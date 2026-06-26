"""Use-Case 4 — Protokoll-Generierung mit HITL interrupt (§ 4.1, § 4.7).

Flow:
    START → assemble_context → draft → hitl → persist → END

``assemble_context_node``: calls get_meeting_full_context (read-only tool,
    JWT from RunnableConfig) to build MeetingFullContext.
``draft_node``: calls Opus 4.7 via instructor + Anthropic tool_use;
    returns ProtokollEntwurf (text, konfidenz, fehlende_daten).
``hitl_node``: calls interrupt(payload) — graph checkpoints and waits for
    Command(resume={edited_draft: str}).
``persist_node``: writes protocol row (status='ki_entwurf') via Supabase.

Checkpointer: AsyncPostgresSaver from SUPABASE_DB_URL. Initialized via
    setup_protokoll_graph() called in main.py lifespan.

Hard invariant (Invariante 2): agent NEVER sets status='unterzeichnet'.
    The DB trigger protocol_no_agent_sign (0011) enforces this structurally.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Literal

from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt
from pydantic import BaseModel, Field

from app.graphs.base import AgentState
from app.llm.anthropic_client import get_instructor_client
from app.tools.versammlung_tools import MeetingFullContext, get_meeting_full_context

logger = logging.getLogger(__name__)

_MODEL = "claude-opus-4-7"
_MAX_TOKENS = 4000
_SYSTEM_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "protokoll" / "system.md"

_protokoll_graph: Any | None = None
_checkpointer: Any | None = None  # kept alive at module level — do not let GC close pool
_checkpointer_cm: Any | None = None  # context manager — held for __aexit__ on shutdown


def _load_system_prompt() -> str:
    return _SYSTEM_PROMPT_PATH.read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# Structured output (instructor + Anthropic tool_use — § 4.6)
# ---------------------------------------------------------------------------


class ProtokollEntwurf(BaseModel):
    """Structured protocol draft returned by Opus 4.7."""

    text: str = Field(
        description="Vollständiger Protokoll-Entwurf als Markdown (§ 24 Abs. 6 WEG).",
    )
    konfidenz: Literal["hoch", "mittel", "niedrig"] = Field(
        description=(
            "hoch = alle Pflichtinhalte vollständig; "
            "mittel = 1-2 Ergänzungen nötig; "
            "niedrig = >2 Pflichtinhalte fehlen."
        ),
    )
    fehlende_daten: list[str] = Field(
        default_factory=list,
        description="Liste fehlender Pflichtangaben (z. B. 'Ort der Versammlung').",
    )


# ---------------------------------------------------------------------------
# Context helpers
# ---------------------------------------------------------------------------


def _extract_meeting_context(state: AgentState) -> dict[str, Any]:
    for sug in state.get("suggestions") or []:
        if sug.get("type") == "meeting_context":
            return sug.get("data") or {}
    return {}


def _context_to_user_message(ctx: dict[str, Any]) -> str:
    """Format MeetingFullContext dict into a user message for the LLM."""

    if not ctx:
        return "Keine Versammlungsdaten verfügbar. Erstelle ein leeres Protokoll-Template."

    lines: list[str] = [
        "# Versammlungsdaten",
        "",
        f"**Titel:** {ctx.get('titel', '[unbekannt]')}",
        f"**Datum:** {ctx.get('termin_von', '[unbekannt]')}",
        f"**Modus:** {ctx.get('modus', '[unbekannt]')}",
        f"**Status:** {ctx.get('status', '[unbekannt]')}",
        "",
        "## Tagesordnungspunkte",
    ]

    for ai in ctx.get("agenda_items") or []:
        lines.append("")
        lines.append(f"### TOP {ai.get('position')}: {ai.get('titel')}")
        if ai.get("beschreibung"):
            lines.append(ai["beschreibung"])

        for res in ai.get("resolutions") or []:
            votes = res.get("votes") or {}
            lines.append("")
            lines.append(f"**Beschlussvorlage:** {res.get('text', '')}")
            lines.append(f"**Mehrheitstyp:** {res.get('mehrheits_typ', '')}")
            lines.append(f"**Legal State:** {res.get('legal_state', '')}")
            lines.append(
                f"**Abstimmung:** {votes.get('ja', 0)} Ja / "
                f"{votes.get('nein', 0)} Nein / "
                f"{votes.get('enthaltung', 0)} Enthaltung"
            )
            bse = res.get("bse")
            if bse:
                lines.append(
                    f"**BSE lfd. Nr. {bse.get('lfd_nr')}:** {bse.get('beschluss_text', '')}"
                )

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Graph nodes
# ---------------------------------------------------------------------------


async def assemble_context_node(
    state: AgentState, config: RunnableConfig = None  # type: ignore[assignment]
) -> dict[str, Any]:
    """Fetch meeting aggregate from Supabase via get_meeting_full_context tool."""

    meeting_id = state.get("meeting_id") or ""
    configurable: dict[str, Any] = getattr(config, "configurable", {}) or {}
    jwt: str | None = configurable.get("jwt")

    if not jwt or not meeting_id:
        logger.warning("assemble_context_node: no JWT or meeting_id — degrading to empty context")
        ctx = MeetingFullContext(
            meeting_id=meeting_id,
            titel="",
            modus="",
            status="",
            termin_von=None,
        )
    else:
        from types import SimpleNamespace

        runtime = SimpleNamespace(config={"configurable": {"jwt": jwt}})
        try:
            ctx = await get_meeting_full_context.coroutine(  # type: ignore[attr-defined]
                meeting_id=meeting_id,
                runtime=runtime,
            )
        except Exception as exc:
            logger.error("assemble_context_node: tool call failed: %s", exc)
            ctx = MeetingFullContext(
                meeting_id=meeting_id,
                titel="",
                modus="",
                status="",
                termin_von=None,
            )

    return {
        "suggestions": [{"type": "meeting_context", "data": ctx.model_dump()}]
    }


async def draft_node(state: AgentState) -> dict[str, Any]:
    """Call Opus 4.7 to generate ProtokollEntwurf from assembled context."""

    ctx = _extract_meeting_context(state)
    user_message = _context_to_user_message(ctx)

    client = get_instructor_client()
    entwurf: ProtokollEntwurf = await client.messages.create(
        model=_MODEL,
        max_tokens=_MAX_TOKENS,
        system=_load_system_prompt(),
        messages=[{"role": "user", "content": user_message}],
        response_model=ProtokollEntwurf,
    )

    return {
        "interrupt_payload": {
            "draft": entwurf.text,
            "konfidenz": entwurf.konfidenz,
            "fehlende_daten": entwurf.fehlende_daten,
        }
    }


async def hitl_node(state: AgentState) -> dict[str, Any]:
    """Pause graph for Verwalter review. Resume via Command(resume={edited_draft})."""

    payload = state.get("interrupt_payload") or {}
    resumed: dict[str, Any] = interrupt(payload)
    return {
        "interrupt_payload": {
            **payload,
            "edited_draft": resumed.get("edited_draft", payload.get("draft", "")),
        }
    }


async def persist_node(
    state: AgentState, config: RunnableConfig = None  # type: ignore[assignment]
) -> dict[str, Any]:
    """Write protocol row with status='ki_entwurf' via Supabase."""

    payload = state.get("interrupt_payload") or {}
    edited_draft: str = payload.get("edited_draft", payload.get("draft", ""))
    meeting_id = state.get("meeting_id") or ""

    configurable = getattr(config, "configurable", {}) or {}
    jwt: str | None = configurable.get("jwt")

    if jwt and meeting_id and edited_draft:
        from supabase import create_client
        from supabase.client import ClientOptions
        from app.config import get_settings

        settings = get_settings()
        sb = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_ANON_KEY,
            ClientOptions(headers={"Authorization": f"Bearer {jwt}"}),
        )
        try:
            result: Any = (
                sb.table("protocol")
                .upsert(
                    {
                        "meeting_id": meeting_id,
                        "status": "ki_entwurf",
                        "text": edited_draft,
                        "generierungs_quelle": "ki",
                    },
                    on_conflict="tenant_id,meeting_id",
                )
                .select("id")
                .execute()
            )
            protocol_id = (result.data or [{}])[0].get("id")
            logger.info(
                "persist_node: upserted protocol id=%s for meeting=%s",
                protocol_id,
                meeting_id,
            )
            return {
                "suggestions": [
                    *(state.get("suggestions") or []),
                    {"type": "protokoll_entwurf", "protocol_id": str(protocol_id or "")},
                ]
            }
        except Exception as exc:
            logger.error("persist_node: upsert failed: %s", exc)

    return {}


# ---------------------------------------------------------------------------
# Graph builder
# ---------------------------------------------------------------------------


def build_graph(checkpointer: Any | None = None) -> Any:
    """Compile the HITL protokoll graph.

    Pass checkpointer=AsyncPostgresSaver for production (resume support).
    Pass checkpointer=None for unit tests (no persistence, no resume).
    """

    graph: StateGraph[AgentState] = StateGraph(AgentState)
    graph.add_node("assemble_context", assemble_context_node)
    graph.add_node("draft", draft_node)
    graph.add_node("hitl", hitl_node)
    graph.add_node("persist", persist_node)

    graph.add_edge(START, "assemble_context")
    graph.add_edge("assemble_context", "draft")
    graph.add_edge("draft", "hitl")
    graph.add_edge("hitl", "persist")
    graph.add_edge("persist", END)

    return graph.compile(checkpointer=checkpointer)


# ---------------------------------------------------------------------------
# Lifespan initialization
# ---------------------------------------------------------------------------


async def setup_protokoll_graph(db_url: str) -> None:
    """Initialize the checkpointed graph. Called once in FastAPI lifespan.

    We enter the AsyncPostgresSaver context manager and store the live
    checkpointer at module scope so the connection pool is not closed
    prematurely. The pool stays open for the process lifetime.
    The context manager is stored in _checkpointer_cm so teardown_protokoll_graph
    can close the pool cleanly on shutdown.
    """

    global _protokoll_graph, _checkpointer, _checkpointer_cm
    from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

    cm = AsyncPostgresSaver.from_conn_string(db_url)
    _checkpointer_cm = cm
    _checkpointer = await cm.__aenter__()
    await _checkpointer.setup()
    _protokoll_graph = build_graph(checkpointer=_checkpointer)
    logger.info("protokoll_graph initialized with AsyncPostgresSaver")


async def teardown_protokoll_graph() -> None:
    """Close the AsyncPostgresSaver connection pool. Called in FastAPI lifespan after yield."""

    global _checkpointer_cm
    if _checkpointer_cm is not None:
        try:
            await _checkpointer_cm.__aexit__(None, None, None)
            logger.info("protokoll_graph checkpointer pool closed")
        except Exception as exc:  # pragma: no cover
            logger.warning("teardown_protokoll_graph: error closing pool: %s", exc)
        finally:
            _checkpointer_cm = None


def get_protokoll_graph() -> Any:
    """Return the compiled graph (with checkpointer in prod, without in tests)."""

    if _protokoll_graph is None:
        return build_graph(checkpointer=None)
    return _protokoll_graph
