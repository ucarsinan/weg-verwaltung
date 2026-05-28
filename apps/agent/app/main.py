"""FastAPI entry point — wires CORS, logging, and the four agent routers.

Identity flow per § 2.4:
  - User JWT enters as `Authorization: Bearer <token>` from `apps/web`.
  - `get_auth` verifies against the Supabase JWKS endpoint and yields an `AuthContext`.
  - A per-request `supabase-py` client carries the same JWT to Postgres — RLS does the
    rest. The agent has no service-role credentials.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth import get_auth
from app.config import get_settings
from app.routers import agenda, beschluss, health, internal, protokoll

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    logger.info("agent service starting (project_ref=%s)", settings.SUPABASE_PROJECT_REF)
    yield
    logger.info("agent service stopping")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="WEG-Verwaltung Agent",
        version="0.1.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.WEB_ORIGIN],
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )

    app.include_router(health.router)
    app.include_router(agenda.router, prefix="/agent", dependencies=[Depends(get_auth)])
    app.include_router(beschluss.router, prefix="/agent", dependencies=[Depends(get_auth)])
    app.include_router(protokoll.router, prefix="/agent", dependencies=[Depends(get_auth)])
    app.include_router(internal.router, prefix="/agent/internal")
    return app


app = create_app()
