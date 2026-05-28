"""Pydantic schemas for agent endpoints."""

from app.schemas.agent import (
    AgendaRequest,
    AgentStubResponse,
    AgentSuggestion,
    BeschlussRequest,
    FristScanResponse,
    ProtokollRequest,
)

__all__ = [
    "AgendaRequest",
    "AgentStubResponse",
    "AgentSuggestion",
    "BeschlussRequest",
    "FristScanResponse",
    "ProtokollRequest",
]
