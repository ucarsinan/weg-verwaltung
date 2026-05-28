"""Auth tests — negative paths against a stubbed JWKS client.

The positive path (real ES256 token signed against a fake JWKS) is deferred — a real
JWKS fixture lands when the first end-to-end flow is wired (next phase).
"""

from __future__ import annotations

from typing import Any

import httpx
import pytest

from app.auth import _JWKSHolder
from app.main import app


@pytest.fixture(autouse=True)
def _reset_jwks() -> None:
    _JWKSHolder.reset()


@pytest.mark.asyncio
async def test_protected_route_without_authorization_header_returns_422() -> None:
    """FastAPI dependency-injection failure on a required Header surfaces as 422."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/agent/agenda", json={"weg_id": "x"})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_protected_route_with_malformed_token_returns_401() -> None:
    """A bearer token that PyJWKClient can't parse must surface as 401, never 500."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/agent/agenda",
            headers={"Authorization": "Bearer not.a.valid.jwt"},
            json={"weg_id": "00000000-0000-0000-0000-000000000000"},
        )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_non_bearer_authorization_returns_401() -> None:
    """Any auth scheme other than Bearer is rejected uniformly."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/agent/agenda",
            headers={"Authorization": "Basic dXNlcjpwYXNz"},
            json={"weg_id": "00000000-0000-0000-0000-000000000000"},
        )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_internal_endpoint_rejects_wrong_token() -> None:
    """Internal endpoints use a static bearer (§ 4.4) — wrong token must 401."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/agent/internal/frist-scan",
            headers={"Authorization": "Bearer wrong-token"},
        )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_internal_endpoint_accepts_correct_token() -> None:
    """Internal endpoint with the configured token returns the stub response."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/agent/internal/frist-scan",
            headers={"Authorization": "Bearer internal-test-token"},
        )
    assert response.status_code == 200
    body: dict[str, Any] = response.json()
    assert body["status"] == "stub"
    assert body["scan_results"] == []


@pytest.mark.skip(reason="needs real JWKS fixture — follow-up when first E2E flow lands")
@pytest.mark.asyncio
async def test_valid_jwt_yields_auth_context() -> None:
    """Positive path placeholder — mint ES256 token against a fake JWKS endpoint."""
    raise NotImplementedError
