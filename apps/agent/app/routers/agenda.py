"""Agenda graph endpoint (§ 4.1, Use-Case 1) — stub until the LangGraph topology lands."""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends

from app.auth import AuthContext, get_auth
from app.schemas import AgendaRequest, AgentStubResponse

logger = logging.getLogger(__name__)
router = APIRouter(tags=["agent"])


@router.post("/agenda", response_model=AgentStubResponse)
async def post_agenda(
    payload: AgendaRequest,
    ctx: Annotated[AuthContext, Depends(get_auth)],
) -> AgentStubResponse:
    """Generate a draft agenda from prior-year protocol. Streamed via SSE in the next phase (§ 4.4)."""
    logger.info("agenda stub called: weg_id=%s tenant=%s", payload.weg_id, ctx.tenant_id)
    return AgentStubResponse(
        endpoint="agenda",
        tenant_id=ctx.tenant_id,
        user_id=ctx.user_id,
    )
