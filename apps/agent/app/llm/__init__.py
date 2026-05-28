"""LLM client wiring — single import-site for model swaps (§ 4.9)."""

from app.llm.anthropic_client import get_anthropic_client, get_instructor_client

__all__ = ["get_anthropic_client", "get_instructor_client"]
