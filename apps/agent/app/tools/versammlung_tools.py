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
        description=(
            "Lifecycle state (canonical set per migration 0032, mirrored in "
            "apps/web modules/versammlung/protokoll-status.ts): "
            "awaiting_review | ki_entwurf | verwalter_revision | unterzeichnet."
        ),
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


# ---------------------------------------------------------------------------
# get_meeting_full_context — Use-Case 4 (protokoll_graph context assembly)
# ---------------------------------------------------------------------------


class VoteAggregate(BaseModel):
    """Aggregated vote counts for one resolution."""

    resolution_id: str
    ja: int = 0
    nein: int = 0
    enthaltung: int = 0
    gesamt: int = 0


class BeschlussSammlungItem(BaseModel):
    """BSE entry linked to a resolution."""

    lfd_nr: int
    beschluss_text: str
    anfechtungsstatus: str


class ResolutionContext(BaseModel):
    """One resolution with its votes and BSE entry."""

    id: str
    agenda_item_id: str
    text: str
    mehrheits_typ: str
    legal_state: str
    festgestellt_am: str | None
    votes: VoteAggregate
    bse: BeschlussSammlungItem | None


class AgendaItemContext(BaseModel):
    """Agenda item with nested resolutions."""

    id: str
    position: int
    titel: str
    beschreibung: str | None
    resolutions: list[ResolutionContext] = []


class MeetingFullContext(BaseModel):
    """Full meeting context for protokoll_graph assemble_context_node."""

    meeting_id: str
    titel: str
    modus: str
    status: str
    termin_von: str | None
    agenda_items: list[AgendaItemContext] = []


@tool
@side_effect(scope="read")
async def get_meeting_full_context(
    meeting_id: str,
    runtime: Annotated[ToolRuntime, InjectedToolArg],
) -> MeetingFullContext:
    """Assembles the full meeting aggregate for Protokoll generation.

    Fetches meeting, agenda_items, resolutions, vote counts, and
    beschluss_sammlung_entries in four sequential read-only queries.
    RLS scopes all results to the calling user's tenant.
    """

    sb = get_supabase(runtime)

    # 1. Meeting row
    meeting_resp: Any = (
        sb.table("meeting")
        .select("id, titel, modus, status, termin_von")
        .eq("id", meeting_id)
        .single()
        .execute()
    )
    row = meeting_resp.data or {}

    # 2. Agenda items ordered by position
    ai_resp: Any = (
        sb.table("agenda_item")
        .select("id, position, titel, beschreibung")
        .eq("meeting_id", meeting_id)
        .order("position")
        .execute()
    )
    ai_rows: list[dict[str, Any]] = list(ai_resp.data or [])

    # 3. Resolutions for this meeting
    res_resp: Any = (
        sb.table("resolution")
        .select("id, agenda_item_id, text, mehrheits_typ, legal_state, festgestellt_am")
        .eq("meeting_id", meeting_id)
        .execute()
    )
    res_rows: list[dict[str, Any]] = list(res_resp.data or [])
    res_ids = [r["id"] for r in res_rows]

    # 4. Votes for those resolutions (aggregate in Python)
    vote_agg: dict[str, VoteAggregate] = {}
    if res_ids:
        vote_resp: Any = (
            sb.table("vote")
            .select("resolution_id, wert")
            .in_("resolution_id", res_ids)
            .execute()
        )
        for v in (vote_resp.data or []):
            rid = str(v["resolution_id"])
            agg = vote_agg.setdefault(rid, VoteAggregate(resolution_id=rid))
            wert = v.get("wert", "")
            if wert == "ja":
                agg.ja += 1
            elif wert == "nein":
                agg.nein += 1
            elif wert == "enthaltung":
                agg.enthaltung += 1
            agg.gesamt += 1

    # 5. BSE entries for this meeting
    bse_resp: Any = (
        sb.table("beschluss_sammlung_entry")
        .select("resolution_id, lfd_nr, beschluss_text, anfechtungsstatus")
        .eq("meeting_id", meeting_id)
        .execute()
    )
    bse_by_res: dict[str, BeschlussSammlungItem] = {
        str(b["resolution_id"]): BeschlussSammlungItem(
            lfd_nr=int(b["lfd_nr"]),
            beschluss_text=str(b["beschluss_text"]),
            anfechtungsstatus=str(b["anfechtungsstatus"]),
        )
        for b in (bse_resp.data or [])
        if b.get("resolution_id")
    }

    # Assemble resolution contexts, keyed by agenda_item_id
    res_by_ai: dict[str, list[ResolutionContext]] = {}
    for r in res_rows:
        ai_id = str(r.get("agenda_item_id") or "")
        rid = str(r["id"])
        res_by_ai.setdefault(ai_id, []).append(
            ResolutionContext(
                id=rid,
                agenda_item_id=ai_id,
                text=str(r.get("text", "")),
                mehrheits_typ=str(r.get("mehrheits_typ", "")),
                legal_state=str(r.get("legal_state", "")),
                festgestellt_am=r.get("festgestellt_am"),
                votes=vote_agg.get(rid, VoteAggregate(resolution_id=rid)),
                bse=bse_by_res.get(rid),
            )
        )

    agenda_items = [
        AgendaItemContext(
            id=str(ai["id"]),
            position=int(ai["position"]),
            titel=str(ai["titel"]),
            beschreibung=ai.get("beschreibung"),
            resolutions=res_by_ai.get(str(ai["id"]), []),
        )
        for ai in ai_rows
    ]

    return MeetingFullContext(
        meeting_id=str(row.get("id", meeting_id)),
        titel=str(row.get("titel", "")),
        modus=str(row.get("modus", "")),
        status=str(row.get("status", "")),
        termin_von=row.get("termin_von"),
        agenda_items=agenda_items,
    )
