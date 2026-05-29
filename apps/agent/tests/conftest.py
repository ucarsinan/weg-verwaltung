"""Shared fixtures — injects safe defaults for required Settings env vars.

Tests never reach a real Supabase / JWKS endpoint; auth-positive paths are stubbed in
the individual test modules. This conftest guarantees that `Settings()` can be
constructed both during test collection (test modules import `app.main` at the top
level, which builds the FastAPI app and triggers `get_settings()` at module-import
time — before any autouse fixture can run) and during individual test execution.
"""

from __future__ import annotations

import os
from collections.abc import Iterator

import pytest

_TEST_ENV: dict[str, str] = {
    "SUPABASE_URL": "https://test.supabase.co",
    "SUPABASE_ANON_KEY": "test-anon-key",
    "SUPABASE_PROJECT_REF": "test",
    "AGENT_INTERNAL_TOKEN": "internal-test-token",
    "WEB_ORIGIN": "http://localhost:3000",
}

# Set BEFORE importing app.config so the eager `get_settings()` calls in
# `app.main` succeed at test-module collection time. The autouse fixture below
# additionally resets the lru_cache between tests for hygiene.
for _key, _value in _TEST_ENV.items():
    os.environ.setdefault(_key, _value)

from app.config import get_settings  # noqa: E402


@pytest.fixture(autouse=True)
def _patch_env(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    for key, value in _TEST_ENV.items():
        monkeypatch.setenv(key, value)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
