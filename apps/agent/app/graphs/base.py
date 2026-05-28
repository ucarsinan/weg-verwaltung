"""Shared LangGraph foundations: AgentState TypedDict + thread_id helper.

Per § 4.2: the state is a ``TypedDict`` (not Pydantic) so that LangGraph's
reducers (``add_messages``, ``operator.add``) can apply partial node-returns
without forcing full re-validation on every step. Inputs to ``.invoke()`` and
tool arguments are still strictly typed elsewhere.

Hard invariant (§ 4.2, § 3.6 T7): **the JWT is NEVER in this state.** It
travels via ``RunnableConfig.configurable.jwt`` per invoke, transient only.
The state is checkpointed to disk; a persisted JWT would be a replay vector.
"""

from __future__ import annotations

from typing import Annotated, Any, Literal, TypedDict
from uuid import uuid4

from langchain_core.messages import AnyMessage
from langgraph.graph.message import add_messages

UseCase = Literal["agenda", "beschluss", "frist", "protokoll"]


class AgentState(TypedDict, total=False):
    """LangGraph state per § 4.2 — exactly eight fields, no JWT.

    Field-by-field:
      - ``tenant_id``: UUID-string, carried from the verified JWT claim.
      - ``user_id``: UUID-string of the delegating Supabase user.
      - ``use_case``: which of the four graphs is running.
      - ``meeting_id``: optional aggregate-id for the run (``None`` for free runs).
      - ``messages``: chat history; reducer-merged via ``add_messages``.
      - ``suggestions``: structured outputs the router persists or returns to UI.
      - ``interrupt_payload``: HITL gate payload (only used by ``protokoll_graph``).
      - ``langfuse_trace_id``: root-span id for observability cross-linking (§ 4.8).
    """

    tenant_id: str
    user_id: str
    use_case: UseCase
    meeting_id: str | None
    messages: Annotated[list[AnyMessage], add_messages]
    suggestions: list[dict[str, Any]]
    interrupt_payload: dict[str, Any] | None
    langfuse_trace_id: str


def build_thread_id(tenant_id: str, use_case: UseCase, entity_id: str) -> str:
    """Compose the canonical thread_id per § 4.2.

    Format: ``{tenant_id}:{use_case}:{entity_id}:{nonce}``. The nonce prevents
    collisions when the same entity is touched by parallel runs. The
    ``tenant_id`` prefix is what FastAPI later verifies against the JWT claim
    before any checkpointer read/write (§ 4.2 "Isolations-Regel").
    """

    nonce = uuid4().hex
    return f"{tenant_id}:{use_case}:{entity_id}:{nonce}"
