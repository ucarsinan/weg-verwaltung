"""Vorgangszentrale suggestion graph.

Flow:
    START -> retrieve_context -> suggest -> END

This graph is intentionally conservative for the foundation phase:
  - it calls the current RAG retriever read path only;
  - empty retrieval returns ``answer_status='insufficient_sources'`` without an LLM call;
  - it emits structured suggestions only and never performs domain writes.
"""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any, Literal

from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, ConfigDict, Field

from app.graphs.base import AgentState
from app.llm.anthropic_client import get_instructor_client
from app.rag.retrieve import HybridRetriever, RetrievedChunk
from app.tools.runtime import get_jwt, tool_runtime_from_config

logger = logging.getLogger(__name__)

_MODEL = "claude-sonnet-4-6"
_MAX_TOKENS = 2500
_SYSTEM_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "vorgang" / "system.md"

SuggestionType = Literal[
    "vorgang_triage",
    "antwort_entwurf",
    "frist_vorschlag",
    "dokument_metadaten_vorschlag",
    "tool_action_proposal",
    "rag_answer",
    "blocked_proposal",
]
AnswerStatus = Literal["suggestion", "insufficient_sources"]
Confidence = Literal["hoch", "mittel", "niedrig"]

_SOURCE_INJECTION_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"ignore\s+(all\s+)?previous\s+instructions?", re.IGNORECASE),
    re.compile(r"ignoriere\s+(alle\s+)?vorherigen\s+Anweisungen", re.IGNORECASE),
    re.compile(r"system\s*prompt", re.IGNORECASE),
    re.compile(r"du\s+bist\s+jetzt\s+", re.IGNORECASE),
    re.compile(r"you\s+are\s+now\s+", re.IGNORECASE),
)

_PROTECTED_DOMAIN_WRITE_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\bunterzeichnet\b", re.IGNORECASE),
    re.compile(r"\bprotocol\.unterzeichnet\b", re.IGNORECASE),
    re.compile(r"\bresolution\b", re.IGNORECASE),
    re.compile(r"\bbeschluss.?sammlung.?entry\b", re.IGNORECASE),
    re.compile(r"\bvote\b", re.IGNORECASE),
)


def _load_system_prompt() -> str:
    return _SYSTEM_PROMPT_PATH.read_text(encoding="utf-8")


class VorgangSource(BaseModel):
    """One cited source chunk used for a suggestion."""

    model_config = ConfigDict(extra="forbid")

    chunk_id: str
    heading_path: str
    doc_typ: str
    excerpt: str = Field(max_length=800)


class VorgangProposedChange(BaseModel):
    """Human-reviewable change proposal. It is never an executable action."""

    model_config = ConfigDict(extra="forbid")

    field: str = Field(description="Human-readable target field or decision area.")
    current_value: str | None = Field(default=None)
    proposed_value: str
    rationale: str
    requires_human_confirmation: bool = True


class VorgangSuggestion(BaseModel):
    """Structured output returned by the Vorgangszentrale graph."""

    model_config = ConfigDict(extra="forbid")

    suggestion_type: SuggestionType
    title: str = Field(max_length=140)
    summary: str = Field(max_length=1200)
    proposed_changes: list[VorgangProposedChange] = Field(default_factory=list)
    sources: list[VorgangSource] = Field(default_factory=list)
    confidence: Confidence
    risk_flags: list[str] = Field(default_factory=list)
    answer_status: AnswerStatus


def _extract_user_request(state: AgentState) -> str:
    messages = state.get("messages") or []
    if not messages:
        return "Bitte erstelle einen konservativen Vorschlag für diesen Vorgang."
    last = messages[-1]
    content = getattr(last, "content", "")
    if isinstance(content, str):
        return content
    parts: list[str] = []
    for part in content:
        if isinstance(part, dict) and part.get("type") == "text":
            parts.append(str(part.get("text", "")))
        elif isinstance(part, str):
            parts.append(part)
    return "\n".join(parts)


def _source_risk_flags(text: str) -> list[str]:
    if any(pattern.search(text) for pattern in _SOURCE_INJECTION_PATTERNS):
        return ["source_prompt_injection"]
    return []


def _chunk_to_source(chunk: RetrievedChunk) -> VorgangSource:
    return VorgangSource(
        chunk_id=chunk.chunk_id,
        heading_path=chunk.heading_path,
        doc_typ=chunk.doc_typ,
        excerpt=chunk.text[:800],
    )


def _retrieved_sources(state: AgentState) -> list[VorgangSource]:
    for sug in state.get("suggestions") or []:
        if sug.get("type") != "retrieved_vorgang_context":
            continue
        data = sug.get("data")
        if not isinstance(data, list):
            return []
        sources: list[VorgangSource] = []
        for item in data:
            if isinstance(item, dict):
                sources.append(VorgangSource.model_validate(item))
        return sources
    return []


def _retrieval_risk_flags(state: AgentState) -> list[str]:
    for sug in state.get("suggestions") or []:
        if sug.get("type") == "retrieved_vorgang_context":
            flags = sug.get("risk_flags")
            if isinstance(flags, list):
                return [str(flag) for flag in flags]
    return []


def _insufficient_sources(reason: str) -> VorgangSuggestion:
    return VorgangSuggestion(
        suggestion_type="blocked_proposal",
        title="Keine belastbare Vorgangs-Empfehlung möglich",
        summary=(
            "Der Vorgangszentrale-Agent hat keine belastbaren Quellen im RAG-Kontext "
            "gefunden. Es wird deshalb kein fachlicher Vorschlag erzeugt."
        ),
        proposed_changes=[],
        sources=[],
        confidence="niedrig",
        risk_flags=["insufficient_sources", reason],
        answer_status="insufficient_sources",
    )


def _format_sources_for_prompt(sources: list[VorgangSource]) -> str:
    blocks: list[str] = []
    for idx, source in enumerate(sources, start=1):
        blocks.append(
            "\n".join(
                [
                    f"Quelle {idx}",
                    f"chunk_id: {source.chunk_id}",
                    f"doc_typ: {source.doc_typ}",
                    f"heading_path: {source.heading_path}",
                    f"text: {source.excerpt}",
                ]
            )
        )
    return "\n\n---\n\n".join(blocks)


def _has_protected_domain_write_attempt(suggestion: VorgangSuggestion) -> bool:
    haystack = "\n".join(
        "\n".join(
            [
                change.field,
                change.current_value or "",
                change.proposed_value,
                change.rationale,
            ]
        )
        for change in suggestion.proposed_changes
    )
    return any(pattern.search(haystack) for pattern in _PROTECTED_DOMAIN_WRITE_PATTERNS)


def _normalize_suggestion(
    suggestion: VorgangSuggestion,
    *,
    sources: list[VorgangSource],
    risk_flags: list[str],
) -> VorgangSuggestion:
    combined_flags = list(dict.fromkeys([*suggestion.risk_flags, *risk_flags]))
    normalized = suggestion.model_copy(
        update={
            "sources": sources,
            "risk_flags": combined_flags,
            "answer_status": "suggestion",
        }
    )
    if _has_protected_domain_write_attempt(normalized):
        normalized = normalized.model_copy(
            update={
                "suggestion_type": "blocked_proposal",
                "risk_flags": list(
                    dict.fromkeys(
                        [*normalized.risk_flags, "protected_domain_write_requested"]
                    )
                ),
            }
        )
    return normalized


async def retrieve_context_node(
    state: AgentState,
    config: RunnableConfig = None,  # type: ignore[assignment]
) -> dict[str, Any]:
    """Call the current RAG scaffold with the user JWT from RunnableConfig."""

    jwt = get_jwt(config)
    if not jwt:
        logger.warning("vorgang retrieve_context_node: JWT missing")
        return {
            "suggestions": [
                {
                    "type": "retrieved_vorgang_context",
                    "data": [],
                    "risk_flags": ["missing_jwt"],
                }
            ]
        }

    runtime = tool_runtime_from_config(config)
    retriever = HybridRetriever(runtime)
    query = _extract_user_request(state)
    weg_id = state.get("meeting_id")

    try:
        chunks = await retriever.retrieve(query, weg_id=weg_id)
    except Exception as exc:  # noqa: BLE001
        logger.warning("vorgang retrieve_context_node: retrieval failed: %s", exc)
        return {
            "suggestions": [
                {
                    "type": "retrieved_vorgang_context",
                    "data": [],
                    "risk_flags": ["retrieval_failed"],
                }
            ]
        }

    sources = [_chunk_to_source(chunk) for chunk in chunks]
    risk_flags = list(
        dict.fromkeys(
            flag
            for chunk in chunks
            for flag in _source_risk_flags(chunk.text)
        )
    )
    return {
        "suggestions": [
            {
                "type": "retrieved_vorgang_context",
                "data": [source.model_dump() for source in sources],
                "risk_flags": risk_flags,
            }
        ]
    }


async def suggest_node(state: AgentState) -> dict[str, Any]:
    """Return a structured suggestion, or an insufficient-sources result."""

    sources = _retrieved_sources(state)
    risk_flags = _retrieval_risk_flags(state)

    if not sources:
        reason = "retrieval_failed" if "retrieval_failed" in risk_flags else "empty_rag"
        suggestion = _insufficient_sources(reason)
        if "missing_jwt" in risk_flags:
            suggestion = suggestion.model_copy(
                update={"risk_flags": [*suggestion.risk_flags, "missing_jwt"]}
            )
        return {
            "suggestions": [
                {
                    "type": "vorgang_suggestion",
                    "suggestion": suggestion.model_dump(),
                }
            ]
        }

    client = get_instructor_client()
    user_request = _extract_user_request(state)
    source_block = _format_sources_for_prompt(sources)
    llm_suggestion: VorgangSuggestion = await client.messages.create(
        model=_MODEL,
        max_tokens=_MAX_TOKENS,
        system=_load_system_prompt(),
        messages=[
            {
                "role": "user",
                "content": (
                    f"Verwalter-Anfrage:\n{user_request}\n\n"
                    f"Quellenmaterial:\n{source_block}"
                ),
            }
        ],
        response_model=VorgangSuggestion,
    )
    normalized = _normalize_suggestion(
        llm_suggestion,
        sources=sources,
        risk_flags=risk_flags,
    )
    return {
        "suggestions": [
            {
                "type": "vorgang_suggestion",
                "suggestion": normalized.model_dump(),
            }
        ]
    }


def build_graph() -> Any:
    graph: StateGraph[AgentState] = StateGraph(AgentState)
    graph.add_node("retrieve_context", retrieve_context_node)
    graph.add_node("suggest", suggest_node)
    graph.add_edge(START, "retrieve_context")
    graph.add_edge("retrieve_context", "suggest")
    graph.add_edge("suggest", END)
    return graph.compile()


vorgang_graph = build_graph()
