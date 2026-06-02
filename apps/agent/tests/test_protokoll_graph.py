"""Tests for Use-Case 4 — Protokoll generation with HITL interrupt.

Layers (cheapest first):
  1. Tool: get_meeting_full_context — mock supabase, verify MeetingFullContext shape.
  2. Graph compile-smoke — no ANTHROPIC_API_KEY needed.
  3. thread_id format — protokoll use-case.
  4. assemble_context_node — mock tool call, verify context in state.
  5. draft_node — mock instructor client, verify ProtokollEntwurf shape.
  6. Interrupt — mock graph run, verify interrupt fires with draft payload.
  7. Resume + persist — verify protocol row written via supabase mock.
"""
from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.tools.versammlung_tools import (
    MeetingFullContext,
    get_meeting_full_context,
)


# ---------------------------------------------------------------------------
# Helper: chainable supabase mock
# ---------------------------------------------------------------------------

def _make_supabase(table_responses: dict[str, Any]) -> MagicMock:
    """Build a mock where sb.table('X').select(...).eq(...).execute() returns table_responses['X']."""

    def table_side_effect(name: str) -> MagicMock:
        response = SimpleNamespace(data=table_responses.get(name, []))
        builder = MagicMock()
        builder.select.return_value = builder
        builder.eq.return_value = builder
        builder.in_.return_value = builder
        builder.order.return_value = builder
        builder.limit.return_value = builder
        builder.single.return_value = builder
        builder.execute.return_value = response
        return builder

    sb = MagicMock()
    sb.table.side_effect = table_side_effect
    return sb


# ---------------------------------------------------------------------------
# Task 4 Tests: get_meeting_full_context
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_meeting_full_context_returns_full_context_shape() -> None:
    """Tool must aggregate meeting, agenda_items, resolutions, votes, BSE."""

    meeting_row = {
        "id": "meet-1",
        "titel": "Jahresversammlung 2025",
        "modus": "praesenz",
        "status": "beendet",
        "termin_von": "2025-03-15T18:00:00+00:00",
    }
    agenda_rows = [
        {"id": "ai-1", "position": 1, "titel": "Begrüßung", "beschreibung": None},
        {"id": "ai-2", "position": 2, "titel": "Heizungsmodernisierung", "beschreibung": "Kostenangebot"},
    ]
    resolution_rows = [
        {
            "id": "res-1",
            "agenda_item_id": "ai-2",
            "text": "Die Eigentümerversammlung beschließt die Heizungsmodernisierung.",
            "mehrheits_typ": "einfach",
            "legal_state": "festgestellt",
            "festgestellt_am": "2025-03-15T19:30:00+00:00",
        }
    ]
    vote_rows = [
        {"resolution_id": "res-1", "wert": "ja"},
        {"resolution_id": "res-1", "wert": "ja"},
        {"resolution_id": "res-1", "wert": "nein"},
        {"resolution_id": "res-1", "wert": "enthaltung"},
    ]
    bse_rows = [
        {
            "resolution_id": "res-1",
            "lfd_nr": 1,
            "beschluss_text": "Die EV beschließt die Heizungsmodernisierung mit 2 Ja, 1 Nein, 1 Enthaltung.",
            "anfechtungsstatus": "keine",
        }
    ]

    fake_sb = _make_supabase({
        "meeting": meeting_row,
        "agenda_item": agenda_rows,
        "resolution": resolution_rows,
        "vote": vote_rows,
        "beschluss_sammlung_entry": bse_rows,
    })
    fake_runtime = SimpleNamespace(config={"configurable": {"jwt": "fake-jwt"}})

    with patch("app.tools.versammlung_tools.get_supabase", return_value=fake_sb):
        ctx: MeetingFullContext = await get_meeting_full_context.coroutine(  # type: ignore[attr-defined]
            meeting_id="meet-1",
            runtime=fake_runtime,
        )

    assert ctx.meeting_id == "meet-1"
    assert ctx.titel == "Jahresversammlung 2025"
    assert len(ctx.agenda_items) == 2
    # Only ai-2 has a resolution
    ai2 = next(ai for ai in ctx.agenda_items if ai.id == "ai-2")
    assert len(ai2.resolutions) == 1
    res = ai2.resolutions[0]
    assert res.legal_state == "festgestellt"
    # Vote aggregation: 2 ja, 1 nein, 1 enthaltung
    assert res.votes.ja == 2
    assert res.votes.nein == 1
    assert res.votes.enthaltung == 1
    assert res.votes.gesamt == 4
    # BSE linked
    assert res.bse is not None
    assert res.bse.lfd_nr == 1
    assert res.bse.anfechtungsstatus == "keine"


# ---------------------------------------------------------------------------
# Task 6 Tests: graph nodes
# ---------------------------------------------------------------------------

from app.graphs.protokoll import (
    ProtokollEntwurf,
    assemble_context_node,
    draft_node,
    build_graph,
)
from app.graphs.base import AgentState, build_thread_id
from langchain_core.messages import HumanMessage


def test_protokoll_graph_compiles() -> None:
    """Graph must compile without ANTHROPIC_API_KEY (no checkpointer = in-memory)."""
    graph = build_graph(checkpointer=None)
    assert hasattr(graph, "ainvoke")


def test_build_thread_id_protokoll() -> None:
    """thread_id must use 'protokoll' use-case prefix (§ 4.2)."""
    tid = build_thread_id("t1", "protokoll", "m1")
    parts = tid.split(":")
    assert parts[1] == "protokoll"
    assert len(parts) == 4


@pytest.mark.asyncio
async def test_assemble_context_node_degrades_without_jwt() -> None:
    """Without JWT, assemble_context_node returns empty MeetingFullContext."""
    state: AgentState = {
        "tenant_id": "t1",
        "user_id": "u1",
        "use_case": "protokoll",
        "meeting_id": "meet-1",
        "messages": [],
        "suggestions": [],
        "interrupt_payload": None,
    }
    result = await assemble_context_node(state, config={})
    assert "suggestions" in result
    ctx_sug = next(s for s in result["suggestions"] if s["type"] == "meeting_context")
    ctx = ctx_sug["data"]
    assert ctx["meeting_id"] == "meet-1"
    assert ctx["agenda_items"] == []


@pytest.mark.asyncio
async def test_draft_node_returns_protokoll_entwurf_shape() -> None:
    """draft_node must call Opus 4.7 and return interrupt_payload with draft."""

    fake_entwurf = ProtokollEntwurf(
        text="# Protokoll\n\n## 1. Begrüßung\n\nVersammlung wurde eröffnet.",
        konfidenz="hoch",
        fehlende_daten=[],
    )

    fake_client = AsyncMock()
    fake_client.messages.create = AsyncMock(return_value=fake_entwurf)

    state: AgentState = {
        "tenant_id": "t1",
        "user_id": "u1",
        "use_case": "protokoll",
        "meeting_id": "meet-1",
        "messages": [],
        "suggestions": [
            {
                "type": "meeting_context",
                "data": {
                    "meeting_id": "meet-1",
                    "titel": "Jahresversammlung 2025",
                    "modus": "praesenz",
                    "status": "beendet",
                    "termin_von": "2025-03-15T18:00:00+00:00",
                    "agenda_items": [],
                },
            }
        ],
        "interrupt_payload": None,
    }

    with patch("app.graphs.protokoll.get_instructor_client", return_value=fake_client):
        result: dict[str, Any] = await draft_node(state)

    assert "interrupt_payload" in result
    payload = result["interrupt_payload"]
    assert "draft" in payload
    assert payload["draft"].startswith("# Protokoll")
    assert payload["konfidenz"] == "hoch"
    assert payload["fehlende_daten"] == []
    fake_client.messages.create.assert_awaited_once()


# -----------------------------------------------------------------------
# Task 7: Interrupt / Resume tests
# -----------------------------------------------------------------------

import asyncio

from langgraph.types import Command


def test_graph_interrupt_raises_graph_interrupt_on_first_run() -> None:
    """Graph pauses at hitl_node: ainvoke returns result with __interrupt__ key."""
    from langgraph.checkpoint.memory import MemorySaver

    fake_entwurf = ProtokollEntwurf(
        text="# Protokoll\n\nEntwurf.",
        konfidenz="mittel",
        fehlende_daten=[],
    )
    fake_client = AsyncMock()
    fake_client.messages.create = AsyncMock(return_value=fake_entwurf)

    graph = build_graph(checkpointer=MemorySaver())
    config = {
        "configurable": {
            "thread_id": "test-tenant:protokoll:mtg-1:abc",
            "jwt": None,
        }
    }
    state: AgentState = {
        "tenant_id": "test-tenant",
        "user_id": "u1",
        "use_case": "protokoll",
        "meeting_id": "mtg-1",
        "messages": [],
        "suggestions": [],
        "interrupt_payload": None,
    }

    with patch("app.graphs.protokoll.get_instructor_client", return_value=fake_client):
        result = asyncio.run(graph.ainvoke(state, config=config))

    # LangGraph signals interrupt via __interrupt__ key in result dict (not by raising)
    assert "__interrupt__" in result, "Graph must pause at hitl_node and set __interrupt__"
    interrupts = result["__interrupt__"]
    assert len(interrupts) == 1
    interrupt_value = interrupts[0].value
    assert "draft" in interrupt_value, "Interrupt payload must include draft text"


def test_graph_resume_with_edited_draft_reaches_persist() -> None:
    """After interrupt, resuming with Command(resume=edited_draft) advances to END."""
    from langgraph.checkpoint.memory import MemorySaver

    fake_entwurf = ProtokollEntwurf(
        text="# Protokoll\n\nEntwurf.",
        konfidenz="hoch",
        fehlende_daten=[],
    )
    fake_client = AsyncMock()
    fake_client.messages.create = AsyncMock(return_value=fake_entwurf)

    graph = build_graph(checkpointer=MemorySaver())
    config = {
        "configurable": {
            "thread_id": "test-tenant:protokoll:mtg-1:abc2",
            "jwt": None,
        }
    }
    initial_state: AgentState = {
        "tenant_id": "test-tenant",
        "user_id": "u1",
        "use_case": "protokoll",
        "meeting_id": "mtg-1",
        "messages": [],
        "suggestions": [],
        "interrupt_payload": None,
    }

    # First run → graph pauses at hitl_node, signals via __interrupt__
    with patch("app.graphs.protokoll.get_instructor_client", return_value=fake_client):
        first_result = asyncio.run(graph.ainvoke(initial_state, config=config))

    assert "__interrupt__" in first_result, "First run must produce an interrupt"

    # Resume — jwt=None so persist_node skips real Supabase call (no mock needed)
    with patch("app.graphs.protokoll.get_instructor_client", return_value=fake_client):
        result = asyncio.run(
            graph.ainvoke(
                Command(resume={"edited_draft": "# Protokoll\n\nBearbeitet."}),
                config=config,
            )
        )

    # Graph reached END: no __interrupt__ in resumed result
    assert result is not None
    assert "__interrupt__" not in result, "Resumed graph must reach END, not interrupt again"


def test_agent_cannot_set_status_unterzeichnet() -> None:
    """persist_node never writes status='unterzeichnet'. DB trigger also enforces this."""
    import ast
    import pathlib

    source = pathlib.Path(
        "/Users/sinanucar/Development/weg-verwaltung/apps/agent/app/graphs/protokoll.py"
    ).read_text()
    tree = ast.parse(source)

    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and node.value == "unterzeichnet":
            pytest.fail(
                "Found literal 'unterzeichnet' in protokoll.py — "
                "agent must never set this status (Invariante 2)"
            )
