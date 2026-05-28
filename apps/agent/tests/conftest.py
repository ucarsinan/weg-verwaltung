"""Shared fixtures — injects safe defaults for required Settings env vars.

Tests never reach a real Supabase / JWKS endpoint; auth-positive paths are stubbed in
the individual test modules. This conftest only guarantees that `Settings()` can be
constructed during test collection.
"""

from __future__ import annotations

import os
from collections.abc import Iterator

import pytest

from app.config import get_settings

_TEST_ENV: dict[str, str] = {
    "SUPABASE_URL": "https://test.supabase.co",
    "SUPABASE_ANON_KEY": "test-anon-key",
    "SUPABASE_PROJECT_REF": "test",
    "AGENT_INTERNAL_TOKEN": "internal-test-token",
    "WEB_ORIGIN": "http://localhost:3000",
}


@pytest.fixture(autouse=True)
def _patch_env(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    for key, value in _TEST_ENV.items():
        monkeypatch.setenv(key, value)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
