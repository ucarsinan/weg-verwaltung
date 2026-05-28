"""JWT verification + per-request Supabase client (per § 2.4 / § 3.3 / § 3.6 T7).

Token verification:
  - asymmetric (`ES256` / `RS256`) against the Supabase JWKS endpoint
  - `audience="authenticated"`, `issuer={SUPABASE_URL}/auth/v1`
  - `app_metadata.tenant_id` is the canonical tenant claim

Per-request Supabase client:
  - never reuse a client across requests (would leak Authorization headers)
  - anon key + injected `Authorization: Bearer <user_jwt>` header
  - RLS does the rest
"""

from __future__ import annotations

import logging
from typing import Annotated, Any
from uuid import UUID

import jwt
from fastapi import Depends, Header, HTTPException, status
from pydantic import BaseModel, ConfigDict
from supabase import Client, create_client
from supabase.client import ClientOptions

from app.config import Settings, get_settings

logger = logging.getLogger(__name__)

_JWT_ALGORITHMS = ["ES256", "RS256"]
_JWT_AUDIENCE = "authenticated"


class AuthContext(BaseModel):
    """Per-request auth surface — supabase client, raw claims, identifiers."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    supabase: Client
    claims: dict[str, Any]
    tenant_id: UUID
    user_id: UUID


class _JWKSHolder:
    """Lazy + cached `PyJWKClient`. One instance per process."""

    _client: jwt.PyJWKClient | None = None

    @classmethod
    def get(cls, settings: Settings) -> jwt.PyJWKClient:
        if cls._client is None:
            cls._client = jwt.PyJWKClient(settings.jwks_url, cache_keys=True)
        return cls._client

    @classmethod
    def reset(cls) -> None:
        """Test hook — clear the cached client."""
        cls._client = None


def _extract_bearer(authorization: str) -> str:
    """Strip the `Bearer ` prefix; raise 401 on malformed input."""
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header muss 'Bearer <token>' sein.",
        )
    return authorization[7:].strip()


def _decode_token(token: str, settings: Settings) -> dict[str, Any]:
    """Verify signature + standard claims, return the decoded payload."""
    try:
        signing_key = _JWKSHolder.get(settings).get_signing_key_from_jwt(token).key
        claims: dict[str, Any] = jwt.decode(
            token,
            signing_key,
            algorithms=_JWT_ALGORITHMS,
            audience=_JWT_AUDIENCE,
            issuer=settings.issuer,
        )
        return claims
    except jwt.PyJWTError as exc:
        logger.info("jwt verification failed: %s", exc.__class__.__name__)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="JWT ungültig oder abgelaufen.",
        ) from exc


def _tenant_from_claims(claims: dict[str, Any]) -> UUID:
    """Extract `app_metadata.tenant_id` (canonical form, § 2.4)."""
    app_meta = claims.get("app_metadata") or {}
    tenant_raw = app_meta.get("tenant_id")
    if not tenant_raw:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Kein tenant_id-Claim im JWT.",
        )
    try:
        return UUID(str(tenant_raw))
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="tenant_id-Claim ist keine gültige UUID.",
        ) from exc


def _user_from_claims(claims: dict[str, Any]) -> UUID:
    """Extract the `sub` claim as the Supabase user_id."""
    sub = claims.get("sub")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Kein sub-Claim im JWT.",
        )
    try:
        return UUID(str(sub))
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="sub-Claim ist keine gültige UUID.",
        ) from exc


def _build_user_supabase(token: str, settings: Settings) -> Client:
    """Per-request supabase-py client carrying the user JWT (§ 2.4 anti-pattern #2)."""
    options = ClientOptions(headers={"Authorization": f"Bearer {token}"})
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY, options)


async def get_auth(
    authorization: Annotated[str, Header(description="Bearer <user_jwt>")],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AuthContext:
    """FastAPI dependency — verifies the JWT and builds the user-scoped Supabase client."""
    token = _extract_bearer(authorization)
    claims = _decode_token(token, settings)
    tenant_id = _tenant_from_claims(claims)
    user_id = _user_from_claims(claims)
    supabase = _build_user_supabase(token, settings)
    return AuthContext(
        supabase=supabase,
        claims=claims,
        tenant_id=tenant_id,
        user_id=user_id,
    )


async def require_internal_token(
    authorization: Annotated[str, Header(description="Bearer <agent_internal_token>")],
    settings: Annotated[Settings, Depends(get_settings)],
) -> None:
    """Bearer guard for the pg_cron callback (§ 4.4)."""
    token = _extract_bearer(authorization)
    if token != settings.AGENT_INTERNAL_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Internal token ungültig.",
        )
