"""Request/response models for the agent endpoints.

Schemas are deliberately thin — they're the contract between `apps/web` and `apps/agent`
during scaffolding. The LangGraph state from § 4.2 lives separately (TypedDict, not
Pydantic, per § 4.2 rationale) and is wired in the next phase.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

UseCase = Literal["agenda", "beschluss", "frist", "protokoll", "vorgang"]


class AgendaRequest(BaseModel):
    """Trigger payload for the agenda graph (§ 4.1, Use-Case 1)."""

    weg_id: UUID
    meeting_id: UUID | None = None


class BeschlussRequest(BaseModel):
    """Trigger payload for the beschluss graph (§ 4.1, Use-Case 2)."""

    weg_id: UUID
    draft_text: str = Field(..., min_length=1, max_length=8000)


class ProtokollRequest(BaseModel):
    """Trigger payload for the protokoll graph (§ 4.1, Use-Case 4 — HITL).

    Two modes:
      - First call:  resume_token=None → graph runs to interrupt, returns draft.
      - Resume call: resume_token=thread_id + edited_draft → graph continues, persists.
    """

    meeting_id: UUID
    resume_token: str | None = Field(
        default=None,
        description="Set when resuming an interrupted graph via Command(resume=...).",
    )
    edited_draft: str | None = Field(
        default=None,
        description="Verwalter-edited Markdown text, required when resume_token is set.",
        max_length=50_000,
    )

    @model_validator(mode="after")
    def validate_resume_requires_draft(self) -> "ProtokollRequest":
        if self.resume_token is not None and not self.edited_draft:
            raise ValueError("edited_draft is required when resume_token is set.")
        return self


class ProtokollResponse(BaseModel):
    """Router response for both modes of the protokoll endpoint."""

    status: Literal["awaiting_review", "completed"]
    thread_id: str
    draft: str | None = None
    konfidenz: Literal["hoch", "mittel", "niedrig"] | None = None
    fehlende_daten: list[str] = Field(default_factory=list)


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
