"""Application settings, env-driven via pydantic-settings."""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Env-backed settings. Reads `.env` in dev, real env in prod."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=True,
    )

    # Supabase (per § 2.4)
    SUPABASE_URL: str = Field(..., description="Base URL of the Supabase project")
    SUPABASE_ANON_KEY: str = Field(..., description="Anon-key, used per-request with user JWT")
    SUPABASE_PROJECT_REF: str = Field(..., description="Project reference (subdomain prefix)")

    # Internal pg_cron callback (per § 4.4)
    AGENT_INTERNAL_TOKEN: str = Field(..., description="Bearer guard for /agent/internal/*")

    # CORS
    WEB_ORIGIN: str = Field(
        default="http://localhost:3000",
        description="Allowed CORS origin for apps/web",
    )

    # Optional — wired in next phase
    ANTHROPIC_API_KEY: str | None = None
    LANGFUSE_PUBLIC_KEY: str | None = None
    LANGFUSE_SECRET_KEY: str | None = None
    LANGFUSE_HOST: str | None = None
    REDIS_URL: str | None = None
    SUPABASE_DB_URL: str | None = Field(
        default=None,
        description=(
            "Postgres connection string for AsyncPostgresSaver checkpointer. "
            "Format: postgresql+asyncpg://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres"
        ),
    )

    @property
    def jwks_url(self) -> str:
        """JWKS endpoint for the Supabase Auth issuer (§ 2.4)."""
        return f"{self.SUPABASE_URL}/auth/v1/.well-known/jwks.json"

    @property
    def issuer(self) -> str:
        """JWT `iss` claim — `{SUPABASE_URL}/auth/v1`."""
        return f"{self.SUPABASE_URL}/auth/v1"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Cached settings accessor."""
    return Settings()  # type: ignore[call-arg]
