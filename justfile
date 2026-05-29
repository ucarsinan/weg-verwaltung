# WEG-Verwaltung — root task runner.
# All recipes run from the repo root; see docs/02-architecture-deployment.md §2.7.

# Show available recipes
default:
    @just --list

# Start the dev stack against the Frankfurt cloud project.
# This project is remote-only; .env.local carries the cloud credentials.
dev:
    @echo "Cloud-DB: Supabase Frankfurt (project sgdlzafvhrfulwidqsno)."
    @echo "Run 'just dev-web' and 'just dev-agent' in separate terminals (or use a process-manager)."

# Next.js dev server
dev-web:
    pnpm --filter @weg-verwaltung/web dev

# FastAPI dev server (uv-managed venv)
dev-agent:
    cd apps/agent && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Build all (JS only — agent has no build step in dev)
build:
    pnpm --filter @weg-verwaltung/web build

# Run all tests
test: test-web test-agent

test-web:
    pnpm --filter @weg-verwaltung/web test

test-agent:
    uv run --project apps/agent pytest

# Playwright e2e against the live Cloud Frankfurt project. Boots the Next.js
# dev server itself (webServer config) — does not need `just dev-web` running.
# The login spec runs `seed-admin` first (idempotent).
e2e:
    pnpm --filter @weg-verwaltung/web exec playwright test --project=chromium --reporter=list

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

# Apply Supabase migrations to the linked cloud project.
# Workdir is `infra` because migrations live under infra/supabase/.
db-migrate:
    supabase db push --workdir infra

# Seed a tenant + tenant_admin user via the Supabase Admin API.
# Reads .env.local for NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
# (or SUPABASE_SECRET_KEY in the new sb_secret_… format). Idempotent.
# Args (all optional): email password "tenant name"
seed-admin *ARGS:
    node apps/web/scripts/seed-admin.mjs {{ARGS}}

# DANGEROUS on a remote-only project — would wipe the Frankfurt DB.
# Left in as a guarded recipe so nobody runs it by typo.
db-reset:
    @echo "ABORT: this project is remote-only; db reset would wipe the cloud DB."
    @echo "If you really want this, run: supabase db reset --workdir infra --linked"
    @exit 1

# Clean all build artifacts
clean:
    rm -rf apps/web/.next apps/web/node_modules
    rm -rf packages/shared-types/dist packages/shared-types/node_modules
    rm -rf apps/agent/.venv apps/agent/.ruff_cache apps/agent/.mypy_cache apps/agent/.pytest_cache
    rm -rf node_modules
