"""LangGraph topology (§ 4.1) — one compiled graph per use-case.

Public surface is intentionally small: each graph module exposes a single
``<usecase>_graph`` binding. Routers import that binding and call ``.ainvoke``
with a ``RunnableConfig`` that carries the JWT (§ 4.2 — never on state).
"""

from app.graphs.base import AgentState, build_thread_id
from app.graphs.beschluss import beschluss_graph

__all__ = [
    "AgentState",
    "beschluss_graph",
    "build_thread_id",
]
