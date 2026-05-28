"""Tools for Versammlung-Lifecycle (§ 4.3).

First real tool module: read-only access to the ``protocol`` aggregate, used
by ``agenda_graph`` to ground the Tagesordnung-Vorschlag in prior-year TOPs.

Tenant isolation is enforced via RLS (§ 2.4 / § 3.4) — the supabase-py
client returned by :func:`app.tools.runtime.get_supabase` carries the user
JWT, so even a tool that selects across the full ``protocol`` table only
ever sees rows visible to the calling user.
"""

from __future__ import annotations

from typing import Annotated, Any

from langchain_core.tools import InjectedToolArg, tool
from langgraph.prebuilt import ToolRuntime
from pydantic import BaseModel, Field

from app.tools.runtime import get_supabase, side_effect

# Hard cap so an LLM-driven tool call cannot scroll through thousands of
# protocols and blow the context window (§ 4.6 Layer 1 length cap).
_MAX_LIMIT: int = 10


class ProtokollSummary(BaseModel):
    """A thin envelope around one ``protocol`` row, safe to hand to the LLM.

    The ``text_excerpt`` is the first 500 chars of the full protokoll text —
    enough for the LLM to identify recurring TOPs without dragging the full
    document (often 2000–8000 words per § 4.5) into every prompt.
    """

    id: str = Field(description="UUID of the protocol row.")
    meeting_id: str = Field(description="FK to the meeting aggregate (§ Section 1).")
    status: str = Field(
        description="Lifecycle state: ki_entwurf | verwalter_revision | unterzeichnet.",
    )
    text_excerpt: str = Field(
        description="First 500 chars of the protocol text — enough to spot recurring TOPs.",
    )


@tool
@side_effect(scope="read")
async def list_previous_protokolle_for_weg(
    weg_id: str,
    runtime: Annotated[ToolRuntime, InjectedToolArg],
    limit: int = 3,
) -> list[ProtokollSummary]:
    """Listet die unterzeichneten Protokolle einer WEG, neueste zuerst.

    Verwendet für die Tagesordnungs-Vorschlag-Erstellung auf Basis der
    Vorjahres-TOPs. Tenant-/WEG-Isolation läuft über RLS (§ 2.4); ein
    Cross-Tenant-Leak ist strukturell ausgeschlossen.

    Args:
      weg_id: UUID-string der WEG, für die geladen wird.
      runtime: LangGraph-``ToolRuntime`` — wird vom Executor injiziert und
        ist für das LLM unsichtbar (``InjectedToolArg``).
      limit: Maximale Anzahl Protokolle. Wird hart auf ``_MAX_LIMIT``
        gedeckelt, um Token-Inflation zu verhindern.
    """

    safe_limit = max(1, min(limit, _MAX_LIMIT))
    sb = get_supabase(runtime)

    # Preferred path: join through meeting to filter by weg_id. The
    # PostgREST embedding syntax ``meeting!inner(weg_id)`` + the dotted
    # ``meeting.weg_id`` filter is the supabase-py-equivalent of an
    # ``INNER JOIN ... WHERE meeting.weg_id = $1``.
    #
    # TODO(weg-scope-join): if the PostgREST embedding syntax shifts in
    # a future supabase-py minor release, switch this to a thin
    # PL/pgSQL RPC (``rpc("list_protokolle_for_weg", {...})``) to keep
    # the filter atomic at the DB level. Either way, RLS still scopes
    # cross-tenant on top — this filter is only the per-WEG narrowing.
    response: Any = (
        sb.table("protocol")
        .select("id, meeting_id, status, text, meeting!inner(weg_id)")
        .eq("status", "unterzeichnet")
        .eq("meeting.weg_id", weg_id)
        .order("unterzeichnet_am", desc=True)
        .limit(safe_limit)
        .execute()
    )
    rows: list[dict[str, Any]] = list(response.data or [])

    return [
        ProtokollSummary(
            id=str(row["id"]),
            meeting_id=str(row["meeting_id"]),
            status=str(row["status"]),
            text_excerpt=(str(row.get("text") or ""))[:500],
        )
        for row in rows
    ]
