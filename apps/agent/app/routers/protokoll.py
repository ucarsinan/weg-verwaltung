"""Protokoll graph endpoint (§ 4.1, Use-Case 4 — Human-in-the-Loop) — stub.

Will become the HITL flow described in § 4.7:
    1. assembler-Node builds draft from Vote + AgendaItem + ResolutionResult + Notes
    2. `interrupt()` before persist — state checkpointed via AsyncPostgresSaver
    3. FastAPI returns `status="awaiting_review"` + thread_id
    4. Verwalter edits in the diff editor (Section 5 UX)
    5. Resume via `Command(resume={"edited_draft": ...})`
    6. Persist as `Protocol{status="ki_entwurf"}` — signing is a separate non-agent endpoint
"""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends

from app.auth import AuthContext, get_auth
from app.schemas import AgentStubResponse, ProtokollRequest

logger = logging.getLogger(__name__)
router = APIRouter(tags=["agent"])


@router.post("/protokoll", response_model=AgentStubResponse)
async def post_protokoll(
    payload: ProtokollRequest,
    ctx: Annotated[AuthContext, Depends(get_auth)],
) -> AgentStubResponse:
    logger.info(
        "protokoll stub called: meeting_id=%s resume=%s tenant=%s",
        payload.meeting_id,
        payload.resume_token is not None,
        ctx.tenant_id,
    )
    return AgentStubResponse(
        endpoint="protokoll",
        tenant_id=ctx.tenant_id,
        user_id=ctx.user_id,
    )
