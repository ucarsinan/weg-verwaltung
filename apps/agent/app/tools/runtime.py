"""Tool runtime helpers — ``@side_effect`` decorator + per-call Supabase client.

This module formalises § 4.3 and § 4.7 even though the MVP ``beschluss_graph``
does not yet call any tools. Laying down the contract now avoids retrofitting
the audit-story later when ``agenda_graph`` and ``protokoll_graph`` land.

Contract:
  - ``@side_effect(scope=...)`` annotates a tool with its blast-radius class
    (``"read"`` | ``"internal_write"`` | ``"external"``) per § 4.3. The graph
    executor uses ``scope == "external"`` as the trigger for the
    ``interrupt()`` confirm-gate (§ 4.7, Layer 3).
  - ``get_supabase(runtime)`` builds a fresh, JWT-scoped supabase-py client
    per tool-call; RLS handles the rest. The JWT comes from
    ``runtime.config["configurable"]["jwt"]`` — never from the AgentState.
"""

from __future__ import annotations

from collections.abc import Callable
from functools import wraps
from typing import Any, Literal, TypeVar, cast

from supabase import Client, create_client
from supabase.client import ClientOptions

from app.config import get_settings

SideEffectScope = Literal["read", "internal_write", "external"]

F = TypeVar("F", bound=Callable[..., Any])


def side_effect(scope: SideEffectScope) -> Callable[[F], F]:
    """Tag a tool with its side-effect scope (§ 4.3, § 4.7 Layer 2).

    For the MVP this attaches ``__side_effect_scope__`` to the wrapped
    function so a graph-level executor can introspect the scope without
    importing the tool body. The full Layer-2 behaviour (idempotency-key
    check, per-tenant rate limit) is added when the first ``"external"``
    tool actually ships.
    """

    def decorator(fn: F) -> F:
        @wraps(fn)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            return fn(*args, **kwargs)

        wrapper.__side_effect_scope__ = scope  # type: ignore[attr-defined]
        return cast(F, wrapper)

    return decorator


def get_scope(fn: Callable[..., Any]) -> SideEffectScope | None:
    """Read the scope a tool was tagged with, or ``None`` if untagged."""

    return cast("SideEffectScope | None", getattr(fn, "__side_effect_scope__", None))


def get_supabase(runtime: Any) -> Client:
    """Build a per-call Supabase client carrying the user JWT (§ 4.3).

    ``runtime`` is the LangGraph ``ToolRuntime`` injected via
    ``Annotated[ToolRuntime, InjectedToolArg]``. The JWT lives at
    ``runtime.config["configurable"]["jwt"]`` — pulling it from anywhere
    else (state, env, module-global) would violate § 4.2.
    """

    configurable = runtime.config.get("configurable", {}) if hasattr(runtime, "config") else {}
    jwt: str | None = configurable.get("jwt")
    if not jwt:
        raise RuntimeError(
            "Tool runtime is missing the user JWT — call graph.ainvoke "
            "with config={'configurable': {'jwt': <token>}}."
        )
    settings = get_settings()
    options = ClientOptions(headers={"Authorization": f"Bearer {jwt}"})
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY, options)
