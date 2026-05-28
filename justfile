# WEG-Verwaltung — root task runner.
# All recipes run from the repo root; see docs/02-architecture-deployment.md §2.7.

# Show available recipes
default:
    @just --list

# Start the full local dev stack: supabase + web + agent in parallel.
dev:
    @echo "Starting local dev stack..."
    supabase start
    @echo "Run 'just dev-web' and 'just dev-agent' in separate terminals (or use a process-manager)."

# Next.js dev server
dev-web:
    pnpm --filter @weg-verwaltung/web dev

# FastAPI dev server (uv-managed venv)
dev-agent:
    uv run --project apps/agent uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Build all (JS only — agent has no build step in dev)
build:
    pnpm --filter @weg-verwaltung/web build

# Run all tests
test: test-web test-agent

test-web:
    pnpm --filter @weg-verwaltung/web test

test-agent:
    uv run --project apps/agent pytest

# Lint everything
lint:
    pnpm --filter @weg-verwaltung/web lint
    uv run --project apps/agent ruff check apps/agent

# Type-check everything
typecheck:
    pnpm --filter @weg-verwaltung/web typecheck
    uv run --project apps/agent mypy apps/agent

# Regenerate shared TS types from FastAPI OpenAPI schema (§2.2)
codegen:
    @echo "Fetching OpenAPI schema from agent..."
    curl -s http://localhost:8000/openapi.json > packages/shared-types/openapi.json
    pnpm --filter @weg-verwaltung/shared-types codegen

# Apply Supabase migrations to the linked project
db-migrate:
    supabase db push

# Reset local Supabase + reseed
db-reset:
    supabase db reset

# Clean all build artifacts
clean:
    rm -rf apps/web/.next apps/web/node_modules
    rm -rf packages/shared-types/dist packages/shared-types/node_modules
    rm -rf apps/agent/.venv apps/agent/.ruff_cache apps/agent/.mypy_cache apps/agent/.pytest_cache
    rm -rf node_modules
