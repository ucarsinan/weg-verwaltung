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
