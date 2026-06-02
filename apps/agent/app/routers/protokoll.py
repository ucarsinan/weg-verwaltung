"""Protokoll HITL router — POST /agent/protokoll (two-mode: init + resume).

Flow per § 4.7:
  - Erstaufruf  (resume_token=None):  run graph → GraphInterrupt at hitl_node
                                       → return {status="awaiting_review", thread_id, draft, ...}
  - Resume call (resume_token=<tid>): continue from checkpoint via Command(resume=...)
                                       → persist_node writes protocol row
                                       → return {status="completed"}

JWT travels via RunnableConfig.configurable.jwt (§ 4.2 — never on state).
Thread-id prefix carries tenant_id for cross-tenant read rejection (§ 4.2 Isolations-Regel).
"""

from __future__ import annotations

import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from langgraph.errors import GraphInterrupt
from langgraph.types import Command

from app.auth import AuthContext, get_auth
from app.graphs.base import AgentState, build_thread_id
from app.graphs.protokoll import get_protokoll_graph
from app.schemas.agent import ProtokollRequest, ProtokollResponse

logger = logging.getLogger(__name__)
router = APIRouter(tags=["protokoll"])


def _extract_jwt(request: Request) -> str:
    """Re-read bearer token from raw header for the RunnableConfig (§ 4.2).

    ``get_auth`` already verified the JWT; this lifts the token string back out
    so it can be handed to LangGraph's configurable.jwt slot without persisting
    it on state (which would create a replay vector — § 4.2 Hard Invariant).
    """
    authorization = request.headers.get("authorization") or request.headers.get("Authorization")
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header fehlt oder ist ungültig.",
        )
    return authorization[7:].strip()


def _assert_thread_tenant(thread_id: str, tenant_id: str) -> None:
    """§ 4.2 Isolations-Regel: thread_id prefix must match JWT tenant_id."""
    if not thread_id.startswith(f"{tenant_id}:"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Thread-ID gehört nicht zum aktuellen Mandanten.",
        )


@router.post("/protokoll", response_model=ProtokollResponse)
async def generate_or_resume_protokoll(
    req: ProtokollRequest,
    ctx: Annotated[AuthContext, Depends(get_auth)],
    request: Request,
) -> ProtokollResponse:
    """Run or resume the HITL Protokoll graph.

    - Without resume_token: invokes graph, catches GraphInterrupt, returns draft.
    - With resume_token:    verifies tenant ownership, resumes with edited_draft,
                            returns completed status after persist_node writes the row.
    """
    graph = get_protokoll_graph()
    jwt = _extract_jwt(request)
    tenant_id = str(ctx.tenant_id)

    if req.resume_token is None:
        # ------------------------------------------------------------------ #
        # ERSTAUFRUF — run graph until hitl_node raises GraphInterrupt        #
        # ------------------------------------------------------------------ #
        thread_id = build_thread_id(tenant_id, "protokoll", str(req.meeting_id))
        config: dict[str, Any] = {
            "configurable": {
                "thread_id": thread_id,
                "jwt": jwt,
            }
        }
        initial_state: AgentState = {
            "tenant_id": tenant_id,
            "user_id": str(ctx.user_id),
            "use_case": "protokoll",
            "meeting_id": str(req.meeting_id),
            "messages": [],
            "suggestions": [],
            "interrupt_payload": None,
        }

        logger.info(
            "protokoll init: tenant=%s meeting_id=%s thread_id=%s",
            tenant_id,
            req.meeting_id,
            thread_id,
        )

        try:
            result = await graph.ainvoke(initial_state, config=config)
        except GraphInterrupt as exc:
            # No-checkpointer path (local dev fallback): GraphInterrupt raised directly.
            payload: dict[str, Any] = exc.args[0] if exc.args else {}
            return ProtokollResponse(
                status="awaiting_review",
                thread_id=thread_id,
                draft=payload.get("draft"),
                konfidenz=payload.get("konfidenz"),
                fehlende_daten=payload.get("fehlende_daten") or [],
            )

        # With checkpointer (production + MemorySaver): LangGraph returns
        # {"__interrupt__": [Interrupt(value=payload)]} instead of raising.
        interrupts = result.get("__interrupt__", ())
        if not interrupts:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Protokoll-Graph beendet sich unerwartet ohne Interrupt.",
            )
        interrupt_value: dict[str, Any] = (
            interrupts[0].value if hasattr(interrupts[0], "value") else interrupts[0]
        )
        return ProtokollResponse(
            status="awaiting_review",
            thread_id=thread_id,
            draft=interrupt_value.get("draft"),
            konfidenz=interrupt_value.get("konfidenz"),
            fehlende_daten=interrupt_value.get("fehlende_daten") or [],
        )

    else:
        # ------------------------------------------------------------------ #
        # RESUME — continue from checkpoint after Verwalter edits             #
        # ------------------------------------------------------------------ #
        _assert_thread_tenant(req.resume_token, tenant_id)
        config = {
            "configurable": {
                "thread_id": req.resume_token,
                "jwt": jwt,
            }
        }

        logger.info(
            "protokoll resume: tenant=%s thread_id=%s",
            tenant_id,
            req.resume_token,
        )

        await graph.ainvoke(
            Command(resume={"edited_draft": req.edited_draft}),
            config=config,
        )
        return ProtokollResponse(
            status="completed",
            thread_id=req.resume_token,
        )
