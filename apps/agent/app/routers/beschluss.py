"""Beschluss graph endpoint (§ 4.1, Use-Case 2) — stub.

Validates a draft resolution against the Bestimmtheitsgrundsatz. The real graph runs
Opus 4.7 (per § 4.9) with a custom `weg_legal_precision` judge in CI (§ 4.8).
"""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends

from app.auth import AuthContext, get_auth
from app.schemas import AgentStubResponse, BeschlussRequest

logger = logging.getLogger(__name__)
router = APIRouter(tags=["agent"])


@router.post("/beschluss", response_model=AgentStubResponse)
async def post_beschluss(
    payload: BeschlussRequest,
    ctx: Annotated[AuthContext, Depends(get_auth)],
) -> AgentStubResponse:
    logger.info(
        "beschluss stub called: weg_id=%s draft_chars=%d tenant=%s",
        payload.weg_id,
        len(payload.draft_text),
        ctx.tenant_id,
    )
    return AgentStubResponse(
        endpoint="beschluss",
        tenant_id=ctx.tenant_id,
        user_id=ctx.user_id,
    )
