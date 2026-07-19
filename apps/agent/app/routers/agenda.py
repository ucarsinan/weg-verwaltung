"""Agenda graph endpoint (§ 4.1, Use-Case 1).

Wires ``agenda_graph`` into FastAPI. JWT travels via ``RunnableConfig``
(§ 4.2 — never on state); the thread_id carries the verified ``tenant_id``
prefix so a downstream checkpointer (when added) can reject cross-tenant
reads via the § 4.2 "Isolations-Regel".

Response shape mirrors the Beschluss router: the structured
``AgendaVorschlag`` flows out as ``dict[str, Any]`` so this layer doesn't
need to import the graph-internal Pydantic schema. ``apps/web`` parses it.
"""

from __future__ import annotations

import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from langchain_core.messages import HumanMessage
from pydantic import BaseModel, Field, ValidationError

from app.auth import AuthContext, get_auth
from app.graphs.agenda import AgendaVorschlag, agenda_graph
from app.graphs.base import build_thread_id

logger = logging.getLogger(__name__)
router = APIRouter(tags=["agent"])


class AgendaInvokeRequest(BaseModel):
    """Trigger payload for the agenda graph.

    Distinct from ``schemas.AgendaRequest`` (which is the older stub-era
    contract). Once the router stabilises this can replace it in
    ``app.schemas``.
    """

    weg_id: str = Field(description="UUID-string der WEG, für die die TO vorbereitet wird.")
    verwalter_hinweis: str | None = Field(
        default=None,
        description=(
            "Optionaler Freitext zur Versammlung — 'Beirats-Wahl steht an', "
            "'außerordentliche Versammlung wegen Wasserschaden', etc."
        ),
        max_length=2000,
    )


class AgendaResponse(BaseModel):
    """Router response — the structured ``AgendaVorschlag`` + thread_id for traces.

    ``vorschlag`` ist bewusst das Graph-Modell selbst: der OpenAPI-Kontrakt
    (``just codegen`` → shared-types) trägt damit die volle Payload-Form,
    und Drift zwischen Graph und apps/web wird zum Compile-Fehler.
    """

    vorschlag: AgendaVorschlag
    thread_id: str


def _extract_jwt(request: Request) -> str:
    """Re-read the bearer token from the raw header for the ``RunnableConfig``.

    ``get_auth`` already verified the JWT; this just lifts the token string
    back out so we can hand it to LangGraph's ``configurable.jwt`` slot
    (§ 4.2 — JWT travels via config, never on state).
    """

    authorization = request.headers.get("authorization") or request.headers.get("Authorization")
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header fehlt oder ist ungültig.",
        )
    return authorization[7:].strip()


@router.post("/agenda", response_model=AgendaResponse)
async def post_agenda(
    payload: AgendaInvokeRequest,
    ctx: Annotated[AuthContext, Depends(get_auth)],
    request: Request,
) -> AgendaResponse:
    """Run the Tagesordnung-Vorschlag graph for a given WEG.

    Streamed via SSE will come next (§ 4.4); for now we ``ainvoke`` and
    return the final ``AgendaVorschlag`` shape directly.
    """

    thread_id = build_thread_id(str(ctx.tenant_id), "agenda", payload.weg_id)
    jwt = _extract_jwt(request)

    user_content = payload.verwalter_hinweis or (
        "Bitte schlage die Tagesordnung für die nächste Versammlung dieser WEG vor."
    )

    logger.info(
        "agenda graph invoke: tenant=%s weg_id=%s hint_chars=%d thread_id=%s",
        ctx.tenant_id,
        payload.weg_id,
        len(payload.verwalter_hinweis or ""),
        thread_id,
    )

    result: dict[str, Any] = await agenda_graph.ainvoke(
        {
            "tenant_id": str(ctx.tenant_id),
            "user_id": str(ctx.user_id),
            "use_case": "agenda",
            # TODO(state-shape): ``AgentState`` does not yet carry a
            # ``weg_id`` slot — we co-opt ``meeting_id`` until a follow-up
            # commit widens the TypedDict. Routers and tools both stay
            # tolerant in the meantime.
            "meeting_id": payload.weg_id,
            "messages": [HumanMessage(content=user_content)],
            "suggestions": [],
        },
        config={"configurable": {"jwt": jwt, "thread_id": thread_id}},
    )

    vorschlag: dict[str, Any] = {}
    for sug in result.get("suggestions") or []:
        if sug.get("type") == "agenda_vorschlag":
            candidate = sug.get("vorschlag")
            if isinstance(candidate, dict):
                vorschlag = candidate
            break

    if not vorschlag:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Agenda-Graph lieferte keinen Vorschlag.",
        )

    try:
        vorschlag_model = AgendaVorschlag.model_validate(vorschlag)
    except ValidationError as exc:
        logger.error("agenda graph returned malformed vorschlag: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Agenda-Graph lieferte unerwartete Vorschlag-Form.",
        ) from exc

    return AgendaResponse(vorschlag=vorschlag_model, thread_id=thread_id)
