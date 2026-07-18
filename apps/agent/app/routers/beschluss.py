"""Beschluss graph endpoint (§ 4.1, Use-Case 2).

Wires ``beschluss_graph`` into FastAPI. The JWT travels via ``RunnableConfig``
(§ 4.2 — never on state); the thread_id carries the verified ``tenant_id``
prefix so a downstream checkpointer (when added) can reject cross-tenant
reads via the § 4.2 "Isolations-Regel".

Response shape is intentionally thin — the structured ``BestimmtheitsBefund``
is returned as ``dict[str, Any]`` so this router does not need to import the
Pydantic schema (which lives in the graph module). ``apps/web`` parses it.
"""

from __future__ import annotations

import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from langchain_core.messages import HumanMessage
from pydantic import BaseModel, ValidationError

from app.auth import AuthContext, get_auth
from app.graphs.base import build_thread_id
from app.graphs.beschluss import BestimmtheitsBefund, beschluss_graph
from app.guardrails import validate_agent_input
from app.schemas import BeschlussRequest

logger = logging.getLogger(__name__)
router = APIRouter(tags=["agent"])


class BeschlussCheckResponse(BaseModel):
    """Router response — the structured Befund + the thread_id for trace links.

    ``befund`` ist bewusst das Graph-Modell selbst: der OpenAPI-Kontrakt
    (``just codegen`` → shared-types) trägt damit die volle Payload-Form,
    und Drift zwischen Graph und apps/web wird zum Compile-Fehler.
    """

    befund: BestimmtheitsBefund
    thread_id: str


def _extract_jwt(request: Request) -> str:
    """Re-read the bearer token from the raw header for the RunnableConfig.

    ``get_auth`` already verified the JWT; this just lifts the token string
    back out so we can hand it to LangGraph's ``configurable.jwt`` slot.
    """

    authorization = request.headers.get("authorization") or request.headers.get("Authorization")
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header fehlt oder ist ungültig.",
        )
    return authorization[7:].strip()


@router.post("/beschluss", response_model=BeschlussCheckResponse)
async def post_beschluss(
    payload: BeschlussRequest,
    ctx: Annotated[AuthContext, Depends(get_auth)],
    request: Request,
) -> BeschlussCheckResponse:
    """Run the Beschluss-Formulierungs-Prüfung graph on a single draft text."""

    entity_id = str(payload.weg_id)
    thread_id = build_thread_id(str(ctx.tenant_id), "beschluss", entity_id)
    jwt = _extract_jwt(request)

    # § 4.6 guardrail pipeline — runs before the LLM call.
    validate_agent_input(
        payload.draft_text,
        user_id=str(ctx.user_id),
        field_name="Beschlusstext",
    )

    logger.info(
        "beschluss graph invoke: tenant=%s weg_id=%s draft_chars=%d thread_id=%s",
        ctx.tenant_id,
        payload.weg_id,
        len(payload.draft_text),
        thread_id,
    )

    result: dict[str, Any] = await beschluss_graph.ainvoke(
        {
            "tenant_id": str(ctx.tenant_id),
            "user_id": str(ctx.user_id),
            "use_case": "beschluss",
            "meeting_id": None,
            "messages": [HumanMessage(content=payload.draft_text)],
        },
        config={"configurable": {"jwt": jwt, "thread_id": thread_id}},
    )

    suggestions = result.get("suggestions") or []
    if not suggestions:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Beschluss-Graph lieferte keinen Befund.",
        )
    befund = suggestions[0].get("befund")
    try:
        befund_model = BestimmtheitsBefund.model_validate(befund)
    except ValidationError as exc:
        logger.error("beschluss graph returned malformed befund: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Beschluss-Graph lieferte unerwartete Befund-Form.",
        ) from exc
    return BeschlussCheckResponse(befund=befund_model, thread_id=thread_id)
