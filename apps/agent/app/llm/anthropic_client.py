"""Anthropic SDK + ``instructor`` wiring.

One module so that the routing decisions in § 4.9 ("Sonnet workhorse, Opus
for legal precision, Haiku for classification") collapse to a single swap
point. Graph nodes never import ``anthropic`` directly.

Structured output uses ``instructor`` in ``ANTHROPIC_TOOLS`` mode — that
maps the Pydantic response model onto Anthropic's native ``tool_use`` so
the model returns a validated object on first pass, with automatic re-prompt
on validation error (§ 4.6 "Structured Output").

Failure mode for a missing ``ANTHROPIC_API_KEY``: raise at *first call*, not
at import time. Test collection must not blow up just because the env var
is unset on the CI runner.
"""

from __future__ import annotations

from typing import Any

import instructor
from anthropic import AsyncAnthropic

from app.config import get_settings


def _require_api_key() -> str:
    settings = get_settings()
    if not settings.ANTHROPIC_API_KEY:
        raise RuntimeError(
            "ANTHROPIC_API_KEY is not configured — set it in .env or "
            "the environment before invoking an LLM-bound graph node."
        )
    return settings.ANTHROPIC_API_KEY


def get_anthropic_client() -> AsyncAnthropic:
    """Return a fresh async Anthropic client. Lightweight; safe to re-create."""

    return AsyncAnthropic(api_key=_require_api_key())


def get_instructor_client() -> Any:
    """Return an ``instructor``-wrapped Anthropic client for structured outputs.

    Default model for legal-precision tasks (Beschluss-Prüfung) is Opus 4.7
    per the § 4.9 routing table — individual nodes still pass ``model=...``
    explicitly so the choice stays visible at the call site.
    """

    return instructor.from_anthropic(
        get_anthropic_client(),
        mode=instructor.Mode.ANTHROPIC_TOOLS,
    )
