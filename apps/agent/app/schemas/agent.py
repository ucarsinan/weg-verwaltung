"""Request/response models for the agent endpoints.

Schemas are deliberately thin — they're the contract between `apps/web` and `apps/agent`
during scaffolding. The LangGraph state from § 4.2 lives separately (TypedDict, not
Pydantic, per § 4.2 rationale) and is wired in the next phase.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

UseCase = Literal["agenda", "beschluss", "frist", "protokoll"]


class AgendaRequest(BaseModel):
    """Trigger payload for the agenda graph (§ 4.1, Use-Case 1)."""

    weg_id: UUID
    meeting_id: UUID | None = None


class BeschlussRequest(BaseModel):
    """Trigger payload for the beschluss graph (§ 4.1, Use-Case 2)."""

    weg_id: UUID
    draft_text: str = Field(..., min_length=1, max_length=8000)


class ProtokollRequest(BaseModel):
    """Trigger payload for the protokoll graph (§ 4.1, Use-Case 4 — HITL)."""

    meeting_id: UUID
    resume_token: str | None = Field(
        default=None,
        description="Set when resuming an interrupted graph via Command(resume=...).",
    )


class AgentSuggestion(BaseModel):
    """Generic suggestion envelope — concrete shapes refine per use-case later."""

    model_config = ConfigDict(extra="forbid")

    suggestion_id: UUID
    use_case: UseCase
    tenant_id: UUID
    created_at: datetime
    payload: dict[str, object]


class AgentStubResponse(BaseModel):
    """Stub return shape — used by all four endpoints until the graphs are wired."""

    status: Literal["stub"] = "stub"
    endpoint: str
    tenant_id: UUID
    user_id: UUID


class FristScanResponse(BaseModel):
    """Response shape for the internal pg_cron callback (§ 4.4)."""

    status: Literal["stub"] = "stub"
    scan_results: list[AgentSuggestion] = Field(default_factory=list)
