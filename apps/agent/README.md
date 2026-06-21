# apps/agent — FastAPI Agent Service

KI-Agent-Service für WEG-Verwaltung. FastAPI + LangGraph-orientierte Graphen.
Tenant-Iso via JWT-Pass-Through an Supabase-RLS (siehe `docs/02-architecture-deployment.md` § 2.4). Ein produktives Fly.io-Deployment ist in diesem Audit nicht belegt.

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
- `app/routers/` — `health` + Endpoints für Agenda / Beschluss / Protokoll / Internal-Frist-Scan
- `app/graphs/` — Graphen für Agenda, Beschluss und Protokoll
- `app/rag/` — Chunking/Embedding/Retrieval-Scaffold; `retrieve()` liefert bis zur Datenpipeline bewusst `[]`
- `app/tools/` — Runtime- und Versammlungs-Tooling

## Statusgrenzen

- Der RAG-Layer ist nicht produktiv; die Embedding-Datenpipeline ist offen.
- Der Agent-Write-Header für Audit-/Actor-Kontext ist als TODO dokumentiert und wird in diesem Sprint nicht implementiert.
- Der `frist`-Graph und vollständige `@side_effect`-/HITL-Tool-Safety sind offen.
- Langfuse-Instrumentierung und RAGAS-Eval-Pipeline (§ 4.8)
- `interrupt()`-HITL-Flow für `protokoll_graph` (§ 4.7)

## Tests

```bash
uv run pytest
uv run mypy
uv run ruff check
```
