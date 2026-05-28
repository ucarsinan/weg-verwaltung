# apps/agent — FastAPI Agent Service

KI-Agent-Service für WEG-Verwaltung. FastAPI + (geplant) LangGraph, deployed nach Fly.io
Frankfurt. Tenant-Iso via JWT-Pass-Through an Supabase-RLS (siehe `docs/02-architecture-deployment.md` § 2.4).

## Run lokal

```bash
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

OpenAPI: `http://localhost:8000/docs`.

## Env

Alle Env-Vars werden via `pydantic-settings` aus `.env` gelesen. Schema-Referenz: `../../.env.example` (Repo-Root). Pflicht:

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_PROJECT_REF`
- `AGENT_INTERNAL_TOKEN` — Bearer für den `pg_cron`-Callback (§ 4.4)
- `WEB_ORIGIN` — CORS-Allow-Origin für `apps/web`

Optional (für nächste Phase):

- `ANTHROPIC_API_KEY`
- `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST`
- `REDIS_URL`

## Was hier ist

- `app/main.py` — FastAPI-App, CORS, Router-Mount, JWT-Dependency-Wiring
- `app/auth.py` — JWKS-Cache + JWT-Verify nach § 2.4 + per-Request `supabase-py`-Client
- `app/config.py` — Settings via pydantic-settings
- `app/routers/` — `health` + Stub-Endpoints für Agenda / Beschluss / Protokoll / Internal-Frist-Scan

## Was hier NOCH NICHT ist

- Vier LangGraph-Graphen (`agenda`, `beschluss`, `protokoll`, `frist`) aus § 4.1
- `tools/`-Inventory mit `@side_effect`-Decorator (§ 4.3 / § 4.7)
- RAG-Layer (pgvector + bge-m3, § 4.5)
- Langfuse-Instrumentierung und RAGAS-Eval-Pipeline (§ 4.8)
- `interrupt()`-HITL-Flow für `protokoll_graph` (§ 4.7)

## Tests

```bash
uv run pytest
uv run mypy
uv run ruff check
```
