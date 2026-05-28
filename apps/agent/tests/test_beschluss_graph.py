"""Tests for the Beschluss-Formulierungs-Prüfung graph (§ 4.1, Use-Case 2).

Three layers, in order of cost:
  1. Compile-smoke — does the graph build without an ANTHROPIC_API_KEY in env?
  2. Node-shape   — mocks the instructor client, asserts the suggestion shape.
  3. Live LLM     — skipped by default; requires a real key. CI will pick it
                    up once the secret is wired and the eval-gate (§ 4.8) is
                    in place.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from langchain_core.messages import HumanMessage

from app.graphs import beschluss_graph, build_thread_id
from app.graphs.base import AgentState
from app.graphs.beschluss import (
    BestimmtheitsBefund,
    _extract_beschluss_text,
    analyze_node,
)


def test_beschluss_graph_compiles() -> None:
    """The graph must compile at import time even without API keys."""

    assert beschluss_graph is not None
    assert hasattr(beschluss_graph, "ainvoke")
    assert hasattr(beschluss_graph, "invoke")


def test_build_thread_id_format() -> None:
    """thread_id must follow the § 4.2 format ``{tenant}:{usecase}:{entity}:{nonce}``."""

    thread_id = build_thread_id("t_a1b2", "beschluss", "weg_07")
    parts = thread_id.split(":")
    assert len(parts) == 4
    assert parts[0] == "t_a1b2"
    assert parts[1] == "beschluss"
    assert parts[2] == "weg_07"
    assert len(parts[3]) > 0


def test_extract_beschluss_text_from_string_message() -> None:
    """``_extract_beschluss_text`` handles the common HumanMessage(content=str) case."""

    state: AgentState = {"messages": [HumanMessage(content="Test-Beschluss-Wortlaut.")]}
    assert _extract_beschluss_text(state) == "Test-Beschluss-Wortlaut."


def test_extract_beschluss_text_raises_on_empty_state() -> None:
    """An empty messages list is a programmer error — fail loudly."""

    with pytest.raises(ValueError, match="HumanMessage"):
        _extract_beschluss_text({"messages": []})


@pytest.mark.asyncio
async def test_analyze_node_returns_suggestion_shape() -> None:
    """``analyze_node`` must return ``{"suggestions": [{"type":..., "befund":...}]}``.

    The instructor client is mocked to a fixed Befund so we exercise the
    node's *shape contract* without touching the Anthropic API.
    """

    fake_befund = BestimmtheitsBefund(
        antragsteller_klar=True,
        beschlussgegenstand_klar=False,
        mehrheitserfordernis_klar=False,
        fehlende_elemente=["Beschlussgegenstand unklar", "Mehrheitserfordernis fehlt"],
        redlining_vorschlag="Die Eigentümerversammlung beschließt mit einfacher Mehrheit ...",
        konfidenz="hoch",
    )

    fake_client = AsyncMock()
    fake_client.messages.create = AsyncMock(return_value=fake_befund)

    with patch(
        "app.graphs.beschluss.get_instructor_client", return_value=fake_client
    ):
        state: AgentState = {
            "tenant_id": "t_a1b2",
            "user_id": "u_42",
            "use_case": "beschluss",
            "meeting_id": None,
            "messages": [HumanMessage(content="Roher Beschluss-Text.")],
        }
        result: dict[str, Any] = await analyze_node(state)

    assert "suggestions" in result
    assert len(result["suggestions"]) == 1
    sug = result["suggestions"][0]
    assert sug["type"] == "beschluss_review"
    assert sug["befund"]["antragsteller_klar"] is True
    assert sug["befund"]["beschlussgegenstand_klar"] is False
    assert sug["befund"]["konfidenz"] == "hoch"
    fake_client.messages.create.assert_awaited_once()


@pytest.mark.skip(reason="needs ANTHROPIC_API_KEY + live API; follow-up after eval-gate (§ 4.8)")
@pytest.mark.asyncio
async def test_beschluss_graph_live_call() -> None:  # pragma: no cover
    """End-to-end live call — only runs when a real key is configured."""

    result = await beschluss_graph.ainvoke(
        {
            "tenant_id": "t_live",
            "user_id": "u_live",
            "use_case": "beschluss",
            "meeting_id": None,
            "messages": [
                HumanMessage(
                    content=(
                        "Es wird beschlossen, das Dach zu reparieren."
                    )
                )
            ],
        },
        config={"configurable": {"jwt": "unused-for-beschluss", "thread_id": "t_live:beschluss:x:1"}},
    )
    assert result["suggestions"][0]["type"] == "beschluss_review"
