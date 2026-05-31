"""Tests for the Tagesordnung-Vorschlag graph (§ 4.1, Use-Case 1).

Mirrors ``test_beschluss_graph.py`` and adds one tool-shape test for the
new versammlung_tools surface. Layers, in order of cost:

  1. Compile-smoke — does the graph build without an ANTHROPIC_API_KEY?
  2. thread_id-format — § 4.2 contract for the agenda use-case.
  3. retrieve_context_node — mocked tool call; verifies JWT-present and
     JWT-absent (degraded) paths.
  4. propose_agenda_node — mocked instructor client; verifies shape contract.
  5. list_previous_protokolle_for_weg — mocked supabase-py client; verifies
     the row → ``ProtokollSummary`` mapping.
  6. Live LLM — skipped by default (needs ANTHROPIC_API_KEY + eval-gate).
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from langchain_core.messages import HumanMessage

from app.graphs import agenda_graph, build_thread_id
from app.graphs.agenda import (
    AgendaItemSuggestion,
    AgendaVorschlag,
    _format_context_blob,
    _retrieved_protokolle,
    propose_agenda_node,
    retrieve_context_node,
)
from app.graphs.base import AgentState
from app.tools.versammlung_tools import (
    ProtokollSummary,
    list_previous_protokolle_for_weg,
)


# ---------------------------------------------------------------------------
# Compile-smoke + thread_id format
# ---------------------------------------------------------------------------


def test_agenda_graph_compiles() -> None:
    """The graph must compile at import time even without API keys."""

    assert agenda_graph is not None
    assert hasattr(agenda_graph, "ainvoke")
    assert hasattr(agenda_graph, "invoke")


def test_build_thread_id_format_for_agenda() -> None:
    """thread_id must follow ``{tenant}:{usecase}:{entity}:{nonce}`` (§ 4.2)."""

    thread_id = build_thread_id("t_a1b2", "agenda", "weg_07")
    parts = thread_id.split(":")
    assert len(parts) == 4
    assert parts[0] == "t_a1b2"
    assert parts[1] == "agenda"
    assert parts[2] == "weg_07"
    assert len(parts[3]) > 0


# ---------------------------------------------------------------------------
# retrieve_context_node — wired tool call (JWT-present + JWT-absent paths)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_retrieve_context_node_degrades_without_jwt() -> None:
    """Without a JWT in config the node must degrade to empty retrieval.

    This covers the unit-test path where no real Supabase client is available.
    The degraded result still satisfies the ``retrieved_protokolle`` envelope
    so ``propose_agenda_node`` can safely fall back to branchenstandard TOPs.
    """

    state: AgentState = {
        "tenant_id": "t_a1b2",
        "user_id": "u_42",
        "use_case": "agenda",
        "meeting_id": "weg_07",
        "messages": [HumanMessage(content="Bitte Vorschlag.")],
    }
    # Empty config (no JWT) → graceful degradation.
    result = await retrieve_context_node(state, config={})
    assert "suggestions" in result
    assert len(result["suggestions"]) == 1
    sug = result["suggestions"][0]
    assert sug["type"] == "retrieved_protokolle"
    assert sug["data"] == []


@pytest.mark.asyncio
async def test_retrieve_context_node_calls_tool_with_jwt() -> None:
    """With a valid JWT in config the node must call the tool and wrap results.

    The Supabase client is mocked so no real network call is made.
    """

    from types import SimpleNamespace

    long_text = "TOP 1 Heizungsmodernisierung. " * 20  # > 500 chars
    rows: list[dict[str, Any]] = [
        {
            "id": "p_99",
            "meeting_id": "m_99",
            "status": "unterzeichnet",
            "text": long_text,
        }
    ]
    fake_sb = _build_fake_supabase(rows)

    state: AgentState = {
        "tenant_id": "t_a1b2",
        "user_id": "u_42",
        "use_case": "agenda",
        "meeting_id": "weg_07",
        "messages": [HumanMessage(content="Bitte Vorschlag.")],
    }
    config = {"configurable": {"jwt": "fake-jwt-token"}}

    with patch("app.tools.versammlung_tools.get_supabase", return_value=fake_sb):
        result = await retrieve_context_node(state, config=config)

    assert "suggestions" in result
    assert len(result["suggestions"]) == 1
    sug = result["suggestions"][0]
    assert sug["type"] == "retrieved_protokolle"
    assert len(sug["data"]) == 1
    assert sug["data"][0]["id"] == "p_99"
    # excerpt is capped at 500 chars by the tool.
    assert len(sug["data"][0]["text_excerpt"]) == 500


# ---------------------------------------------------------------------------
# Context-blob helpers — pure functions, exercised without LLM
# ---------------------------------------------------------------------------


def test_format_context_blob_empty_fallback() -> None:
    """An empty retrieval list must surface the explicit Fallback marker
    that the prompt's Empty-Retrieval-Fallback section keys off."""

    blob = _format_context_blob([])
    assert "Keine Vorjahres-Protokolle im Kontext." in blob


def test_format_context_blob_joins_excerpts() -> None:
    """Multiple protokolle are joined with the ``---`` separator."""

    blob = _format_context_blob(
        [
            {"text_excerpt": "TOP 1 Heizung."},
            {"text_excerpt": "TOP 2 Beirats-Wahl."},
        ]
    )
    assert "TOP 1 Heizung." in blob
    assert "TOP 2 Beirats-Wahl." in blob
    assert "---" in blob


def test_retrieved_protokolle_filters_other_suggestion_types() -> None:
    """Only ``type='retrieved_protokolle'`` suggestions feed the LLM context."""

    state: AgentState = {
        "suggestions": [
            {"type": "agenda_vorschlag", "vorschlag": {"foo": "bar"}},
            {"type": "retrieved_protokolle", "data": [{"text_excerpt": "X"}]},
        ],
    }
    out = _retrieved_protokolle(state)
    assert out == [{"text_excerpt": "X"}]


# ---------------------------------------------------------------------------
# propose_agenda_node — shape contract with a mocked instructor client
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_propose_agenda_node_returns_suggestion_shape() -> None:
    """``propose_agenda_node`` must wrap an ``AgendaVorschlag`` into the
    suggestion-list envelope used by the router."""

    fake_vorschlag = AgendaVorschlag(
        items=[
            AgendaItemSuggestion(
                titel="Begrüßung und Beschlussfähigkeit",
                beschreibung=(
                    "Begrüßung der Eigentümer und Feststellung "
                    "der Beschlussfähigkeit nach § 25 WEG."
                ),
                rationale="Branchenstandard, jede Versammlung.",
                quelle="branchenstandard",
            ),
            AgendaItemSuggestion(
                titel="Genehmigung des Vorjahres-Protokolls",
                beschreibung=(
                    "Die Eigentümerversammlung genehmigt mit "
                    "einfacher Mehrheit das Protokoll der Versammlung vom ..."
                ),
                rationale="Pflicht-TOP nach Branchenstandard.",
                quelle="branchenstandard",
            ),
        ],
        konfidenz="niedrig",
        fehlende_inputs=["Vorjahres-Protokoll"],
    )

    fake_client = AsyncMock()
    fake_client.messages.create = AsyncMock(return_value=fake_vorschlag)

    with patch(
        "app.graphs.agenda.get_instructor_client", return_value=fake_client
    ):
        state: AgentState = {
            "tenant_id": "t_a1b2",
            "user_id": "u_42",
            "use_case": "agenda",
            "meeting_id": "weg_07",
            "messages": [HumanMessage(content="Bitte Tagesordnung.")],
            "suggestions": [{"type": "retrieved_protokolle", "data": []}],
        }
        result: dict[str, Any] = await propose_agenda_node(state)

    assert "suggestions" in result
    assert len(result["suggestions"]) == 1
    sug = result["suggestions"][0]
    assert sug["type"] == "agenda_vorschlag"
    vorschlag = sug["vorschlag"]
    assert vorschlag["konfidenz"] == "niedrig"
    assert vorschlag["fehlende_inputs"] == ["Vorjahres-Protokoll"]
    assert len(vorschlag["items"]) == 2
    assert vorschlag["items"][0]["quelle"] == "branchenstandard"
    fake_client.messages.create.assert_awaited_once()


# ---------------------------------------------------------------------------
# list_previous_protokolle_for_weg — verifies the row → ProtokollSummary map
# ---------------------------------------------------------------------------


def _build_fake_supabase(rows: list[dict[str, Any]]) -> MagicMock:
    """Build a chainable MagicMock that mimics the supabase-py fluent API."""

    response = SimpleNamespace(data=rows)
    builder = MagicMock()
    builder.select.return_value = builder
    builder.eq.return_value = builder
    builder.order.return_value = builder
    builder.limit.return_value = builder
    builder.execute.return_value = response

    sb = MagicMock()
    sb.table.return_value = builder
    return sb


@pytest.mark.asyncio
async def test_list_previous_protokolle_wraps_rows_into_pydantic() -> None:
    """The tool must take raw supabase rows and return ``ProtokollSummary`` objects.

    Tests both the 500-char excerpt cap and the ``str`` coercion of UUID
    columns coming back from PostgREST.
    """

    long_text = "Lorem ipsum dolor " * 200  # > 500 chars
    rows: list[dict[str, Any]] = [
        {
            "id": "p_1",
            "meeting_id": "m_1",
            "status": "unterzeichnet",
            "text": long_text,
        },
        {
            "id": "p_2",
            "meeting_id": "m_2",
            "status": "unterzeichnet",
            "text": "Kurzer Text.",
        },
    ]

    fake_sb = _build_fake_supabase(rows)
    fake_runtime = SimpleNamespace(
        config={"configurable": {"jwt": "fake-jwt-token"}}
    )

    with patch("app.tools.versammlung_tools.get_supabase", return_value=fake_sb):
        # ``@tool``-decorated async functions expose their underlying
        # coroutine on ``.coroutine``; we call that so the test does not
        # need a real LangGraph tool-dispatch context (the runtime arg
        # is normally injected by ``ToolNode``).
        results = await list_previous_protokolle_for_weg.coroutine(  # type: ignore[misc,attr-defined]
            weg_id="weg_07",
            runtime=fake_runtime,
            limit=2,
        )

    assert len(results) == 2
    assert all(isinstance(r, ProtokollSummary) for r in results)
    assert results[0].id == "p_1"
    assert results[0].meeting_id == "m_1"
    assert results[0].status == "unterzeichnet"
    # 500-char cap on the excerpt.
    assert len(results[0].text_excerpt) == 500
    assert results[1].text_excerpt == "Kurzer Text."


@pytest.mark.asyncio
async def test_list_previous_protokolle_caps_limit() -> None:
    """``limit`` is hard-capped at ``_MAX_LIMIT`` to protect the LLM context."""

    fake_sb = _build_fake_supabase(rows=[])
    fake_runtime = SimpleNamespace(
        config={"configurable": {"jwt": "fake-jwt-token"}}
    )

    with patch("app.tools.versammlung_tools.get_supabase", return_value=fake_sb):
        await list_previous_protokolle_for_weg.coroutine(  # type: ignore[misc,attr-defined]
            weg_id="weg_07",
            runtime=fake_runtime,
            limit=9999,
        )

    # The builder's ``.limit(...)`` call is what enforces the cap. Walk
    # the call list to find it (the fluent chain returns the same mock
    # for every call, so we inspect ``call_args_list``).
    limit_call = fake_sb.table.return_value.limit.call_args
    assert limit_call is not None
    # Hard cap is 10 (see ``_MAX_LIMIT`` in versammlung_tools).
    assert limit_call.args[0] == 10


# ---------------------------------------------------------------------------
# Live LLM (skipped by default)
# ---------------------------------------------------------------------------


@pytest.mark.skip(
    reason="needs ANTHROPIC_API_KEY + live API; follow-up after eval-gate (§ 4.8)"
)
@pytest.mark.asyncio
async def test_agenda_graph_live_call_with_empty_retrieval() -> None:  # pragma: no cover
    """End-to-end live call — exercises the Empty-Retrieval-Fallback path."""

    result = await agenda_graph.ainvoke(
        {
            "tenant_id": "t_live",
            "user_id": "u_live",
            "use_case": "agenda",
            "meeting_id": "weg_live",
            "messages": [HumanMessage(content="Bitte Tagesordnung vorschlagen.")],
            "suggestions": [],
        },
        config={
            "configurable": {
                "jwt": "unused-for-agenda-iter",
                "thread_id": "t_live:agenda:weg_live:1",
            },
        },
    )
    assert any(s.get("type") == "agenda_vorschlag" for s in result["suggestions"])
