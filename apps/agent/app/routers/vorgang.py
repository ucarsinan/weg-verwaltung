"""Vorgangszentrale graph endpoint — POST /agent/vorgang."""

from __future__ import annotations

import logging
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from langchain_core.messages import HumanMessage
from pydantic import BaseModel, Field, model_validator

from app.auth import AuthContext, get_auth
from app.graphs.base import AgentState, build_thread_id
from app.graphs.vorgang import SuggestionType, vorgang_graph
from app.guardrails import validate_agent_input

logger = logging.getLogger(__name__)
router = APIRouter(tags=["vorgang"])


class VorgangInvokeRequest(BaseModel):
    """Trigger payload for the Vorgangszentrale graph."""

    user_request: str = Field(
        min_length=1,
        max_length=4000,
        description="Freitext-Auftrag des Verwalters.",
    )
    vorgang_id: UUID | None = Field(default=None)
    inbox_item_id: UUID | None = Field(default=None)
    weg_id: UUID | None = Field(default=None)
    suggestion_type: SuggestionType | None = Field(
        default=None,
        description="Optionaler UI-Hinweis auf die erwartete Vorschlagsart.",
    )

    @model_validator(mode="after")
    def validate_target(self) -> "VorgangInvokeRequest":
        if not any((self.vorgang_id, self.inbox_item_id, self.weg_id)):
            raise ValueError("vorgang_id, inbox_item_id oder weg_id ist erforderlich.")
        return self


class VorgangResponse(BaseModel):
    """Router response — structured suggestion plus thread id for traces."""

    suggestion: dict[str, Any]
    thread_id: str


def _extract_jwt(request: Request) -> str:
    authorization = request.headers.get("authorization") or request.headers.get("Authorization")
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header fehlt oder ist ungültig.",
        )
    token = authorization[7:].strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header fehlt oder ist ungültig.",
        )
    return token


def _entity_id(payload: VorgangInvokeRequest) -> str:
    return str(payload.vorgang_id or payload.inbox_item_id or payload.weg_id)


def _message_content(payload: VorgangInvokeRequest) -> str:
    if payload.suggestion_type is None:
        return payload.user_request
    return f"Gewünschte Vorschlagsart: {payload.suggestion_type}\n\n{payload.user_request}"


@router.post("/vorgang", response_model=VorgangResponse)
async def post_vorgang(
    payload: VorgangInvokeRequest,
    ctx: Annotated[AuthContext, Depends(get_auth)],
    request: Request,
) -> VorgangResponse:
    """Run the Vorgangszentrale suggestion graph."""

    validate_agent_input(
        payload.user_request,
        user_id=str(ctx.user_id),
        field_name="Vorgangsanfrage",
    )

    tenant_id = str(ctx.tenant_id)
    entity_id = _entity_id(payload)
    thread_id = build_thread_id(tenant_id, "vorgang", entity_id)
    jwt = _extract_jwt(request)

    logger.info(
        "vorgang graph invoke: tenant=%s entity_id=%s chars=%d thread_id=%s",
        tenant_id,
        entity_id,
        len(payload.user_request),
        thread_id,
    )

    state: AgentState = {
        "tenant_id": tenant_id,
        "user_id": str(ctx.user_id),
        "use_case": "vorgang",
        # AgentState has no weg_id/vorgang_id slot yet; use meeting_id as
        # the established aggregate-id compatibility field.
        "meeting_id": str(payload.weg_id) if payload.weg_id else None,
        "messages": [HumanMessage(content=_message_content(payload))],
        "suggestions": [],
    }
    result: dict[str, Any] = await vorgang_graph.ainvoke(
        state,
        config={"configurable": {"jwt": jwt, "thread_id": thread_id}},
    )

    for sug in result.get("suggestions") or []:
        if sug.get("type") != "vorgang_suggestion":
            continue
        suggestion = sug.get("suggestion")
        if isinstance(suggestion, dict):
            return VorgangResponse(suggestion=suggestion, thread_id=thread_id)

    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail="Vorgang-Graph lieferte keinen strukturierten Vorschlag.",
    )
