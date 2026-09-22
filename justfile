# WEG-Verwaltung — root task runner.
# All recipes run from the repo root; see docs/02-architecture-deployment.md §2.7.

# ---------------------------------------------------------------------------
# pgTAP contract groups — the single source of truth for which contracts run.
# CI calls `just test-db-all` instead of repeating these paths, so the gate and
# the local recipes cannot drift apart (they did: 0057-0060 were green locally
# but absent from CI until 2026-09-19).
#
# Deliberately NOT listed:
#   - 0001, 0039: commented-out contract shapes, no runnable assertions.
#   - 0050, 0052, 0054: currently failing. 0054 dies on `permission denied for
#     schema auth` inside audit_writer.tg_emit_vorgang_audit_event, which looks
#     like a gap in the local bootstrap rather than a product bug — the hosted
#     project grants audit_writer more than `supabase db reset` does. Tracked in
#     AGENTS.md; do not add them here before they are green.
# ---------------------------------------------------------------------------
SECURITY_DB_TESTS := "supabase/tests/0000_rls_katalog.sql"
AUDIT_DB_TESTS := "supabase/tests/0002_audit_chain.sql supabase/tests/0046_least_privilege.sql supabase/tests/0055_advisor_hardening.sql supabase/tests/0058_audit_writer_vault_decrypt_grant.sql supabase/tests/0059_tenant_audit_emitter.sql"
FINANCE_DB_TESTS := "supabase/tests/0056_finance_allocation_foundation.sql supabase/tests/0060_wirtschaftsplan_position_allocation.sql supabase/tests/0061_zahlung_und_offene_posten.sql supabase/tests/0062_ausgabe_und_ruecklage.sql supabase/tests/0063_jahresabrechnung.sql supabase/tests/0064_null_safe_writer_guards.sql supabase/tests/0065_vermoegensbericht.sql supabase/tests/0066_abrechnung_entwurf_loeschbar.sql supabase/tests/0067_gemischte_verteilungsschluessel.sql"
SAAS_DB_TESTS := "supabase/tests/0057_self_managed_saas_foundation.sql"

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
    uv sync --project apps/agent --extra dev --quiet
    apps/agent/.venv/bin/pytest --rootdir apps/agent apps/agent/tests

# Run the catalogue-wide security contract against an ephemeral local Supabase DB.
# Fixture-free and read-only: it asserts that every table in `public` carries RLS
# and FORCE RLS, that every non-partition has at least one policy, and that
# `private` holds no tables at all. See infra/supabase/tests/0000_rls_katalog.sql.
test-security-db:
    supabase db start --workdir infra
    supabase db reset --workdir infra --local --no-seed
    cd infra && supabase test db {{SECURITY_DB_TESTS}} --local

# Run audit pgTAP regressions against an ephemeral local Supabase DB.
# This intentionally never uses --linked and must not target the Frankfurt cloud.
test-audit-db:
    supabase db start --workdir infra
    supabase db reset --workdir infra --local --no-seed
    cd infra && supabase db query --file supabase/ci/audit_regression_bootstrap.sql --local
    cd infra && supabase test db {{AUDIT_DB_TESTS}} --local

# Run finance pgTAP contracts against an ephemeral local Supabase DB.
# This intentionally never uses --linked and must not target the Frankfurt cloud.
test-finance-db:
    supabase db start --workdir infra
    supabase db reset --workdir infra --local --no-seed
    cd infra && supabase test db {{FINANCE_DB_TESTS}} --local

# Run self-managed SaaS pgTAP contracts against an ephemeral local Supabase DB.
# This intentionally never uses --linked and must not target the Frankfurt cloud.
test-saas-db:
    supabase db start --workdir infra
    supabase db reset --workdir infra --local --no-seed
    cd infra && supabase test db {{SAAS_DB_TESTS}} --local

# Every green pgTAP contract against ONE ephemeral local Supabase DB. This is
# what the CI db-regression job runs; the grouped recipes above stay for focused
# local runs. Applying the migrations is the slow part, so doing it once beats
# running the three recipes back to back.
test-db-all:
    supabase db start --workdir infra
    supabase db reset --workdir infra --local --no-seed
    cd infra && supabase db query --file supabase/ci/audit_regression_bootstrap.sql --local
    cd infra && supabase test db {{SECURITY_DB_TESTS}} {{AUDIT_DB_TESTS}} {{FINANCE_DB_TESTS}} {{SAAS_DB_TESTS}} --local

# Playwright e2e against the live Cloud Frankfurt project. Boots the Next.js
# dev server itself (webServer config) — does not need `just dev-web` running.
# The login spec runs `seed-admin` first (idempotent).
e2e:
    pnpm --filter @weg-verwaltung/web exec playwright test --project=chromium --reporter=list --workers=1

# Lint everything
lint:
    pnpm --filter @weg-verwaltung/web lint
    uv sync --project apps/agent --extra dev --quiet
    apps/agent/.venv/bin/ruff check apps/agent

# Type-check everything
typecheck:
    pnpm --filter @weg-verwaltung/web typecheck
    uv sync --project apps/agent --extra dev --quiet
    apps/agent/.venv/bin/mypy apps/agent

# Regenerate shared TS types from FastAPI OpenAPI schema (§2.2)
# Regenerate packages/shared-types from the agent's OpenAPI contract.
# Exports the schema straight from the FastAPI app — no running server needed.
codegen:
    @echo "Exporting OpenAPI schema from the agent app..."
    uv sync --project apps/agent --extra dev --quiet
    cd apps/agent && .venv/bin/python -c 'import json; from app.main import app; print(json.dumps(app.openapi(), indent=2))' > ../../packages/shared-types/openapi.json
    pnpm --filter @weg-verwaltung/shared-types codegen

# Apply Supabase migrations to the linked cloud project.
# Workdir is `infra` because migrations live under infra/supabase/.
#
# Guarded: `supabase db push` reads the migrations DIRECTORY, not git, so an
# uncommitted or half-written .sql lying there goes to production like any other.
# scripts/db-migrate-guard.sh closes that gap and asks for a typed confirmation.
db-migrate:
    ./scripts/db-migrate-guard.sh
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
