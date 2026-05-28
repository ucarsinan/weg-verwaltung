# infra/supabase

Supabase Postgres baseline for WEG-Verwaltung: tenant model, domain schema, append-only audit log, and RLS policies. Every public table enforces multi-tenant isolation via `(SELECT auth.jwt() -> 'app_metadata' ->> 'tenant_id')` (see `docs/03-security-model.md` § 3.4).

## Layout

```text
config.toml             Local Supabase CLI config (project_id, ports).
migrations/             Numbered SQL migrations, applied in order.
tests/                  pgTAP negative-path RLS tests (stubs).
```

## Migrations

| # | File | Scope |
| --- | --- | --- |
| 0001 | `extensions_and_helpers.sql` | `pgcrypto`, `pg_cron`, `pg_net`, `pgaudit`; `auth.has_role()`, `auth.tenant_id()`. |
| 0002 | `identity.sql` | `tenant`, `tenant_member`, Custom Access Token Hook (`auth.custom_access_token_hook`). |
| 0003 | `weg_domain.sql` | `weg`, `unit`, `person`, `ownership` (incl. composite FKs + tenant defaults). |
| 0004 | `versammlung.sql` | `meeting`, `agenda_item`, `resolution`, `vote`, `proxy`, `protocol`. |
| 0005 | `beschluss_sammlung.sql` | Append-only `beschluss_sammlung_entry` + anfechtungs-event chain (§ 24 Abs. 7 WEG). |
| 0006 | `audit_event.sql` | Partitioned append-only audit log, 3-layer protection (schema columns for HMAC). |
| 0007 | `agent_suggestions.sql` | `agent_suggestion` — KI-Vorschläge, getrennt von echten Beschlüssen. |
| 0008 | `rls_policies.sql` | RLS + FORCE RLS + 4 policies per table (see § 3.4 Hardening-Checkliste). |

**Deferred (not in baseline):**

- `0009_actor_type_guards.sql` — DB triggers that block `actor_type=agent` on `vote`, `resolution`, `protocol.unterzeichnet`, `beschluss_sammlung_entry` (Invariante 3, § 4.6).
- `0010_audit_hmac.sql` — HMAC hash-chain trigger on `audit_event`. The columns `prev_hash` and `row_hash` already exist on the table; only the trigger + Vault-key wiring is pending.
- `0011_audit_partition_rotation.sql` — `pg_cron`-job creating monthly partitions 12 months ahead.

## Workflows

**Local (no remote DB touched):**

```bash
supabase start                # boots Postgres + Auth + Storage; migrations auto-apply
supabase status               # shows API / DB / Studio ports (54321 / 54322 / 54323)
supabase migration new <name> # add the next 00NN_*.sql
supabase db reset             # wipe + re-apply all migrations
```

**Remote (production):**

```bash
supabase link --project-ref <ref>   # one-off, links this folder to the cloud project
supabase db push                    # applies unmigrated files to the cloud DB
```

Both flows use the same files; the CLI tracks applied versions in `supabase_migrations.schema_migrations`.

## RLS philosophy (binding contract)

Every `public.*` table follows § 3.4 to the letter:

1. `ENABLE ROW LEVEL SECURITY`
2. `FORCE ROW LEVEL SECURITY` (closes the table-owner bypass)
3. `REVOKE ALL ON … FROM PUBLIC` (the app role is never the owner)
4. `tenant_id` column with `DEFAULT auth.tenant_id()` and `NOT NULL`
5. Composite FK `(tenant_id, parent_id) → parent(tenant_id, id)` whenever there is a parent
6. **One policy per command** (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) using the `(SELECT auth.jwt() ...)` InitPlan-cached pattern — never `FOR ALL`

Special cases:

- `audit_event`, `beschluss_sammlung_entry`, `beschluss_anfechtung_event` — only `SELECT` + `INSERT` policies. `UPDATE`/`DELETE` are blocked at three layers (`REVOKE`, trigger, RLS-absence).
- `tenant` — `SELECT` only, gated by membership.

## Hash-chain note

Migration 0006 defines `audit_event.prev_hash` and `audit_event.row_hash` as `bytea NOT NULL`. The HMAC computation (`HMAC_SHA256(prev_hash || canonical_json(row), vault_key[tenant_id])`) is intentionally deferred to `0010_audit_hmac.sql` — splitting it keeps the baseline reviewable. The schema is ready; the trigger and Vault wiring are pending.

## References

- Domain model + invariants: `docs/01-system-design.md` § 4
- JWT claim location (`app_metadata.tenant_id`): `docs/02-architecture-deployment.md` § 2.4
- RLS + audit + 3-layer protection: `docs/03-security-model.md` § 3.4 + § 3.5
