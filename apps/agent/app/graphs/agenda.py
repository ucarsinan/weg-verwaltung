"""Use-Case 1 — Tagesordnung-Vorschlag aus Vorjahres-Protokoll (§ 4.1).

Two-node graph:

  START → retrieve_context → propose_agenda → END

``retrieve_context_node`` is now wired: it calls
:func:`app.tools.versammlung_tools.list_previous_protokolle_for_weg` directly
using the JWT from ``RunnableConfig.configurable`` (§ 4.3 pattern). The LangGraph
executor injects the config as the second argument to the node function. The
tool is read-only (scope="read", § 4.3) so no confirm-gate is needed (§ 4.7).

``propose_agenda_node`` calls Sonnet 4.6 (per § 4.9 routing) via
``instructor`` + Anthropic ``tool_use`` for structured output (§ 4.6).

Empty-retrieval is handled gracefully: the prompt's Empty-Retrieval-Fallback
section fires when ``Keine Vorjahres-Protokolle im Kontext.`` appears in the
context blob (§ 4.6 Output-Validation rules; § 4.10 prompt frontmatter).
"""

from __future__ import annotations

import logging
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Literal

from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field

from app.graphs.base import AgentState
from app.llm.anthropic_client import get_instructor_client
from app.tools.versammlung_tools import list_previous_protokolle_for_weg

logger = logging.getLogger(__name__)

# Per § 4.9 routing table: Tagesordnung-Vorschlag = Sonnet 4.6 (workhorse).
# Opus 4.7 is the confidence-< 0.7 fallback — not wired in this iter (the
# graph emits a structured ``konfidenz`` field; the bump-to-Opus router
# lives outside this node when it lands).
_AGENDA_MODEL = "claude-sonnet-4-6"
_MAX_TOKENS = 2500

_SYSTEM_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "agenda" / "system.md"


def _load_system_prompt() -> str:
    """Read the prompt at call time so frontmatter edits don't require reimport."""

    return _SYSTEM_PROMPT_PATH.read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# Structured output schema (instructor + Anthropic tool_use — § 4.6)
# ---------------------------------------------------------------------------


class AgendaItemSuggestion(BaseModel):
    """One proposed TOP (Tagesordnungs-Punkt) for the upcoming meeting."""

    titel: str = Field(description="Knapper TOP-Titel, max ~80 Zeichen.")
    beschreibung: str = Field(
        description=(
            "Inhalt des TOP — Antragsteller, Beschluss-Gegenstand, "
            "geplante Mehrheit (Bestimmtheitsgrundsatz, § 4.6)."
        ),
    )
    rationale: str = Field(
        description=(
            "Warum dieser TOP vorgeschlagen wird (z. B. 'wiederkehrend "
            "laut Vorjahres-Protokoll TOP 5', 'Branchenstandard', "
            "'Beirats-Wahl alle 2 Jahre § 29 WEG')."
        ),
    )
    quelle: Literal["vorjahres_protokoll", "branchenstandard", "frist_gebunden"] = Field(
        description="Herkunft des Vorschlags — speist die UI-Begründungs-Spalte.",
    )


class AgendaVorschlag(BaseModel):
    """Top-level structured response from the agenda graph."""

    items: list[AgendaItemSuggestion] = Field(
        description="Vorgeschlagene TOPs in der gewünschten Reihenfolge.",
    )
    konfidenz: Literal["hoch", "mittel", "niedrig"] = Field(
        description="Selbstbewertung der Vorschlags-Sicherheit.",
    )
    fehlende_inputs: list[str] = Field(
        default_factory=list,
        description=(
            "Inputs, die nicht im Kontext lagen, den Vorschlag aber "
            "verbessert hätten (z. B. 'Jahresabrechnung-Status')."
        ),
    )


# ---------------------------------------------------------------------------
# Graph nodes
# ---------------------------------------------------------------------------


async def retrieve_context_node(
    state: AgentState,
    config: RunnableConfig,
) -> dict[str, Any]:
    """Holt die letzten N Protokolle der WEG via list_previous_protokolle_for_weg.

    The LangGraph executor injects the ``RunnableConfig`` as the second
    argument when the node function accepts it (§ 4.3 / § 4.2 pattern).
    The JWT is pulled from ``config["configurable"]["jwt"]`` and forwarded
    to the tool via a minimal runtime proxy — exactly like ToolNode does it,
    but without the extra LLM hop for tool-selection (the tool to call is
    deterministic for this use-case: always ``list_previous_protokolle_for_weg``
    for the WEG identified by ``state["meeting_id"]``).

    If the JWT is absent (e.g. in unit tests without a real config) or the
    tool call fails for any reason, the node degrades gracefully to empty
    retrieval so ``propose_agenda_node`` can still produce branchenstandard
    TOPs (§ 4.6 Empty-Retrieval-Fallback).
    """

    weg_id: str = str(state.get("meeting_id") or "")
    if not weg_id:
        logger.warning("retrieve_context_node: no weg_id in state — skipping tool call")
        return {"suggestions": [{"type": "retrieved_protokolle", "data": []}]}

    # Build a ToolRuntime proxy carrying the JWT from the graph config.
    # This mirrors what LangGraph's ToolNode does internally (§ 4.3):
    #   runtime.config["configurable"]["jwt"] → get_supabase(runtime) → RLS-scoped client.
    configurable: dict[str, Any] = {}
    if config and isinstance(config, dict):
        configurable = config.get("configurable", {})

    jwt: str | None = configurable.get("jwt")
    if not jwt:
        logger.warning(
            "retrieve_context_node: JWT missing in config — degrading to empty retrieval"
        )
        return {"suggestions": [{"type": "retrieved_protokolle", "data": []}]}

    runtime = SimpleNamespace(config={"configurable": {"jwt": jwt}})

    try:
        results = await list_previous_protokolle_for_weg.coroutine(  # type: ignore[attr-defined]
            weg_id=weg_id,
            runtime=runtime,
            limit=3,
        )
        protokolle_data = [r.model_dump() for r in results]
        logger.info(
            "retrieve_context_node: loaded %d protokolle for weg_id=%s",
            len(protokolle_data),
            weg_id,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("retrieve_context_node: tool call failed (%s) — empty retrieval", exc)
        protokolle_data = []

    return {"suggestions": [{"type": "retrieved_protokolle", "data": protokolle_data}]}


def _extract_user_hint(state: AgentState) -> str:
    """Pull the optional Verwalter-Hinweis from the last HumanMessage."""

    messages = state.get("messages") or []
    if not messages:
        return ""
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


def _retrieved_protokolle(state: AgentState) -> list[dict[str, Any]]:
    """Pull the retrieved-protokolle payload out of the suggestion list, if any."""

    for sug in state.get("suggestions") or []:
        if sug.get("type") == "retrieved_protokolle":
            data = sug.get("data")
            if isinstance(data, list):
                return [d for d in data if isinstance(d, dict)]
    return []


def _format_context_blob(protokolle: list[dict[str, Any]]) -> str:
    """Compose the RAG-style context block handed to the LLM."""

    if not protokolle:
        return "Bisherige Protokolle:\nKeine Vorjahres-Protokolle im Kontext."
    body = "\n---\n".join(str(p.get("text_excerpt") or "") for p in protokolle)
    return f"Bisherige Protokolle:\n{body}"


async def propose_agenda_node(state: AgentState) -> dict[str, Any]:
    """Single LLM call → structured ``AgendaVorschlag`` → suggestion envelope."""

    client = get_instructor_client()
    user_hint = _extract_user_hint(state) or (
        "Bitte schlage die Tagesordnung für die nächste Versammlung dieser WEG vor."
    )
    context_blob = _format_context_blob(_retrieved_protokolle(state))
    vorschlag: AgendaVorschlag = await client.messages.create(
        model=_AGENDA_MODEL,
        max_tokens=_MAX_TOKENS,
        system=_load_system_prompt(),
        messages=[
            {
                "role": "user",
                "content": f"{context_blob}\n\nVerwalter-Eingabe: {user_hint}",
            },
        ],
        response_model=AgendaVorschlag,
    )
    return {
        "suggestions": [
            {
                "type": "agenda_vorschlag",
                "vorschlag": vorschlag.model_dump(),
            }
        ],
    }


def build_graph() -> Any:
    """Compile the two-node Tagesordnung-Vorschlag graph."""

    graph: StateGraph[AgentState] = StateGraph(AgentState)
    graph.add_node("retrieve", retrieve_context_node)
    graph.add_node("propose", propose_agenda_node)
    graph.add_edge(START, "retrieve")
    graph.add_edge("retrieve", "propose")
    graph.add_edge("propose", END)
    return graph.compile()


agenda_graph = build_graph()
