"""Internal endpoints — guarded by a static bearer token, NOT by user JWT.

Used by `pg_cron` + `pg_net` to trigger the nightly Fristen-scan (§ 4.4). Public routing
is additionally blocked at the Fly edge — never exposed to the internet.
"""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends

from app.auth import require_internal_token
from app.schemas import FristScanResponse

logger = logging.getLogger(__name__)
router = APIRouter(tags=["internal"], dependencies=[Depends(require_internal_token)])


@router.post("/frist-scan", response_model=FristScanResponse)
async def frist_scan() -> FristScanResponse:
    """Nightly scan for upcoming Einladungsfristen (§ 4.4). Stub returns empty results."""
    logger.info("frist scan triggered")
    return FristScanResponse()
