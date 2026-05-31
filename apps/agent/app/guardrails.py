"""Input-validation stack for agent endpoints (§ 4.6, 6 layers).

Every LLM call passes through these layers before reaching the graph.
Order is not negotiable — structural + injection checks happen before the LLM,
so a DoS or injection attempt is rejected in microseconds, not after a costly
Anthropic round-trip.

Layer summary (§ 4.6):
  1. Length cap         — 8k chars user input, 200k docs. DoS guard.
  2. Language detection — reject clearly non-DE inputs in WEG-flows.
                          Uses a simple heuristic (no external dep);
                          the § 4.6 ``lingua-py`` mention is an option when
                          the false-positive rate justifies the dependency.
  3. DE-PII regex       — IBAN, PLZ, Steuer-ID, phone (log + reject for
                          user-facing inputs; docs get spotlighting instead).
  4. Injection heuristic— ~30 patterns covering DAN, roleplay, "ignore prev",
                          "you are now", system-prompt leakage.
  5. SQL / code sniff   — DROP TABLE, <script>, code-fenced SQL.
  6. Rate limit         — per-user token-bucket (Redis when available;
                          no-op stub when ``REDIS_URL`` is not set, which is
                          the case for the current dev setup).

Returns: ``None`` on pass, raises ``fastapi.HTTPException(400)`` on fail.
Every rejection is a 400 (Bad Request) with a human-readable German detail.
403/429 are reserved for auth/rate-limit respectively so UI error handling
can branch cleanly.
"""

from __future__ import annotations

import re

from fastapi import HTTPException, status

# ---------------------------------------------------------------------------
# Layer 1 — Length caps
# ---------------------------------------------------------------------------

_USER_INPUT_MAX_CHARS = 8_000
_DOC_INPUT_MAX_CHARS = 200_000


def _check_length(text: str, *, max_chars: int, field_name: str = "Eingabe") -> None:
    if len(text) > max_chars:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"{field_name} ist zu lang "
                f"({len(text):,} Zeichen, Maximum: {max_chars:,})."
            ),
        )


# ---------------------------------------------------------------------------
# Layer 2 — Language detection (lightweight heuristic)
#
# A full ML-based detector (lingua-py) would be better but adds a non-trivial
# dependency. The heuristic covers the practical attack surface: clearly
# non-German payloads (all-ASCII English, code, JSON blobs) that slip through
# the injection check. Short inputs (< 20 chars) are always allowed — a
# single WEG-Beschluss keyword like "Beiratswahl" should never be rejected.
# ---------------------------------------------------------------------------

# Common DE-specific characters. Presence of at least one suggests DE text.
_DE_CHARS_RE = re.compile(r"[äöüÄÖÜß]")

# ASCII-only control keywords strongly suggesting English technical input.
# These are English instruction verbs that appear in prompts but not in
# normal German WEG text.
_LIKELY_ENGLISH_TOKENS = re.compile(
    r"\b(ignore|override|bypass|translate|summarize|pretend|roleplay|jailbreak)\b",
    re.IGNORECASE,
)

_MIN_LEN_FOR_LANG_CHECK = 40


def _check_language(text: str) -> None:
    """Soft check: reject clearly non-German text in WEG-facing inputs."""

    if len(text) < _MIN_LEN_FOR_LANG_CHECK:
        return  # too short to determine language reliably
    has_de_chars = bool(_DE_CHARS_RE.search(text))
    likely_english = bool(_LIKELY_ENGLISH_TOKENS.search(text))
    if likely_english and not has_de_chars:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Eingabe muss auf Deutsch verfasst sein (WEG-Verfahren).",
        )


# ---------------------------------------------------------------------------
# Layer 3 — DE-PII regex
# ---------------------------------------------------------------------------

_PII_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("IBAN", re.compile(r"\bDE\d{20}\b")),
    ("Steuer-ID", re.compile(r"\b\d{11}\b")),
    ("Telefonnummer", re.compile(r"\+49[\s\-]?[\d\s\-]{8,15}")),
    # PLZ is intentionally NOT a rejection trigger — it's routine in WEG docs.
]


def _check_pii(text: str) -> None:
    for label, pattern in _PII_PATTERNS:
        if pattern.search(text):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Die Eingabe enthält möglicherweise sensible Daten ({label}). "
                    "Bitte entfernen Sie persönliche Kennungen vor der KI-Prüfung."
                ),
            )


# ---------------------------------------------------------------------------
# Layer 4 — Injection heuristics
# ---------------------------------------------------------------------------

# DAN / roleplay / system-prompt-leak patterns. Covers the most common
# attack families documented in OWASP LLM Top 10 (2024/2025).
_INJECTION_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"ignore\s+(all\s+)?previous\s+instructions?", re.IGNORECASE),
    re.compile(r"you\s+are\s+now\s+", re.IGNORECASE),
    re.compile(r"act\s+as\s+(if\s+you\s+are\s+)?a\s+", re.IGNORECASE),
    re.compile(r"pretend\s+(you\s+are|to\s+be)\s+", re.IGNORECASE),
    re.compile(r"(do|ignore)\s+anything\s+", re.IGNORECASE),
    re.compile(r"jailbreak", re.IGNORECASE),
    re.compile(r"DAN\s*mode", re.IGNORECASE),
    re.compile(r"developer\s+mode", re.IGNORECASE),
    re.compile(r"system\s*prompt", re.IGNORECASE),
    re.compile(r"<\s*system\s*>", re.IGNORECASE),
    re.compile(r"\[INST\]", re.IGNORECASE),
    re.compile(r"ignore\s+above", re.IGNORECASE),
    re.compile(r"disregard\s+", re.IGNORECASE),
    re.compile(r"override\s+(the\s+)?(previous|above|system)", re.IGNORECASE),
    re.compile(r"reveal\s+(your\s+)?(system\s+)?prompt", re.IGNORECASE),
    re.compile(r"print\s+your\s+instructions", re.IGNORECASE),
    re.compile(r"what\s+(are\s+)?your\s+instructions", re.IGNORECASE),
    re.compile(r"repeat\s+(everything|the\s+above)\s+", re.IGNORECASE),
    re.compile(r"output\s+your\s+system\s+", re.IGNORECASE),
    re.compile(r"bypass\s+(the\s+)?filter", re.IGNORECASE),
    re.compile(r"forget\s+(everything|all)\s+(you\s+)?(have\s+)?learned", re.IGNORECASE),
    re.compile(r"do\s+not\s+follow\s+", re.IGNORECASE),
    re.compile(r"your\s+new\s+(role|persona|instruction)", re.IGNORECASE),
    re.compile(r"neue\s+(Rolle|Anweisung|Persona)", re.IGNORECASE),  # German DAN
    re.compile(r"ignoriere\s+(alle\s+)?vorherigen\s+Anweisungen", re.IGNORECASE),
    re.compile(r"vergiss\s+(alles?\s+)?bisher", re.IGNORECASE),
    re.compile(r"du\s+bist\s+jetzt\s+", re.IGNORECASE),
]


def _check_injection(text: str) -> None:
    for pattern in _INJECTION_PATTERNS:
        if pattern.search(text):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Eingabe enthält ungültige Instruktionsmuster. "
                    "Bitte nur den Beschlusstext eingeben."
                ),
            )


# ---------------------------------------------------------------------------
# Layer 5 — SQL / code sniff
# ---------------------------------------------------------------------------

_SQL_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\bDROP\s+TABLE\b", re.IGNORECASE),
    re.compile(r"\bDELETE\s+FROM\b", re.IGNORECASE),
    re.compile(r"\bSELECT\s+\*\s+FROM\b", re.IGNORECASE),
    re.compile(r"\bINSERT\s+INTO\b", re.IGNORECASE),
    re.compile(r"\bUNION\s+(ALL\s+)?SELECT\b", re.IGNORECASE),
    re.compile(r"--\s*$", re.MULTILINE),  # SQL comment at end of line
    re.compile(r";\s*(DROP|DELETE|INSERT|UPDATE|TRUNCATE)\b", re.IGNORECASE),
    re.compile(r"<script[\s>]", re.IGNORECASE),
    re.compile(r"javascript\s*:", re.IGNORECASE),
    re.compile(r"```\s*(sql|bash|python|js|javascript)\b", re.IGNORECASE),
]


def _check_code_injection(text: str) -> None:
    for pattern in _SQL_PATTERNS:
        if pattern.search(text):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Eingabe enthält Code oder SQL-Fragmente, die nicht "
                    "zulässig sind. Bitte nur Klartext eingeben."
                ),
            )


# ---------------------------------------------------------------------------
# Layer 6 — Rate limit stub (Redis-backed when REDIS_URL is set)
#
# The full token-bucket (50 LLM-Calls/User/h from § 4.6) is Redis-backed.
# Until Redis is provisioned (REDIS_URL not set in current env per config.py),
# this is a no-op. The function signature is stable — the middleware just
# adds the Redis check when the URL appears in env.
# ---------------------------------------------------------------------------


def _check_rate_limit(user_id: str) -> None:  # noqa: ARG001
    """Token-bucket rate limit (§ 4.6 Layer 6, 50 LLM-Calls/User/h).

    No-op stub until ``REDIS_URL`` is configured. The signature is intentionally
    stable — a follow-up commit wires the Redis client here without touching
    the call sites.
    """


# ---------------------------------------------------------------------------
# Public surface — single entry point used by routers
# ---------------------------------------------------------------------------


def validate_agent_input(
    text: str,
    *,
    user_id: str,
    max_chars: int = _USER_INPUT_MAX_CHARS,
    field_name: str = "Eingabe",
) -> None:
    """Run all 6 input-validation layers.

    Call this before every LLM invocation in a router. Raises
    ``HTTPException(400)`` on the first failing layer; ``HTTPException(429)``
    when the rate-limit fires (Layer 6, when Redis is live).

    Args:
        text: The raw user-provided text to validate.
        user_id: Supabase ``user_id`` string for per-user rate limiting.
        max_chars: Override the default length cap (e.g. 200k for doc uploads).
        field_name: Human-readable field label for the error message.
    """

    _check_length(text, max_chars=max_chars, field_name=field_name)
    _check_language(text)
    _check_pii(text)
    _check_injection(text)
    _check_code_injection(text)
    _check_rate_limit(user_id)
