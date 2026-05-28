"""Beschluss-Formulierungs-Prüfung (Use-Case 2, § 4.1).

Pure analysis: no retrieval, no tools, no HITL. The graph is a single
``analyze`` node that prompts Opus 4.7 (per the § 4.9 routing table) for a
structured ``BestimmtheitsBefund`` via ``instructor`` + Anthropic
``tool_use`` (§ 4.6 "Structured Output").

Why no checkpointer here: the run is sub-second-to-low-second, in-and-out,
and has nothing to resume. ``protokoll_graph`` will pull in
``langgraph-checkpoint-postgres`` when HITL is wired.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Literal

from langchain_core.messages import HumanMessage
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field

from app.graphs.base import AgentState
from app.llm.anthropic_client import get_instructor_client

# Per § 4.9 routing table: Beschluss-Prüfung = Opus 4.7 (highest legal precision,
# lowest hallucination rate). Pinned here, in one place, swappable via § 4.9.
_BESCHLUSS_MODEL = "claude-opus-4-7"
_MAX_TOKENS = 2000

_SYSTEM_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "beschluss" / "system.md"


def _load_system_prompt() -> str:
    """Read the prompt file at call time so frontmatter changes don't need a reimport."""

    return _SYSTEM_PROMPT_PATH.read_text(encoding="utf-8")


class BestimmtheitsBefund(BaseModel):
    """Structured verdict on a draft Beschluss per the Bestimmtheitsgrundsatz.

    The three booleans are the canonical legal test (Antragsteller,
    Beschlussgegenstand, Mehrheitserfordernis). ``redlining_vorschlag`` is
    the actionable output for the Verwalter — what they paste back into the
    draft to make it bestimmt.
    """

    antragsteller_klar: bool = Field(
        description="Ist der Antragsteller im Wortlaut eindeutig benannt?",
    )
    beschlussgegenstand_klar: bool = Field(
        description="Ist der konkrete Beschlussgegenstand aus dem Wortlaut ableitbar?",
    )
    mehrheitserfordernis_klar: bool = Field(
        description="Ist das Mehrheitserfordernis explizit angegeben?",
    )
    fehlende_elemente: list[str] = Field(
        default_factory=list,
        description="Knappe Liste der fehlenden oder unklaren Elemente.",
    )
    redlining_vorschlag: str = Field(
        description=(
            "Konkrete Umformulierung des Beschluss-Textes, die alle drei "
            "Bestimmtheits-Anforderungen erfüllt."
        ),
    )
    konfidenz: Literal["hoch", "mittel", "niedrig"] = Field(
        description="Selbstbewertung der Prüfsicherheit.",
    )


def _extract_beschluss_text(state: AgentState) -> str:
    """Pull the draft text from the last user message in the state."""

    messages = state.get("messages") or []
    if not messages:
        raise ValueError("beschluss_graph requires at least one HumanMessage in state['messages'].")
    last = messages[-1]
    content = getattr(last, "content", "")
    if isinstance(content, str):
        return content
    # langchain content can be a list of dict-parts; coerce to a single string.
    parts: list[str] = []
    for part in content:
        if isinstance(part, dict) and part.get("type") == "text":
            parts.append(str(part.get("text", "")))
        elif isinstance(part, str):
            parts.append(part)
    return "\n".join(parts)


async def analyze_node(state: AgentState) -> dict[str, Any]:
    """Single LLM call → structured Befund → suggestion."""

    beschluss_text = _extract_beschluss_text(state)
    client = get_instructor_client()
    befund: BestimmtheitsBefund = await client.messages.create(
        model=_BESCHLUSS_MODEL,
        max_tokens=_MAX_TOKENS,
        system=_load_system_prompt(),
        messages=[{"role": "user", "content": beschluss_text}],
        response_model=BestimmtheitsBefund,
    )
    return {
        "suggestions": [
            {
                "type": "beschluss_review",
                "befund": befund.model_dump(),
            }
        ],
    }


def build_graph() -> Any:
    """Compile the single-node Beschluss analysis graph."""

    graph: StateGraph = StateGraph(AgentState)
    graph.add_node("analyze", analyze_node)
    graph.add_edge(START, "analyze")
    graph.add_edge("analyze", END)
    return graph.compile()


beschluss_graph = build_graph()
