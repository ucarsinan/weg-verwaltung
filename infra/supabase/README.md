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
| 0001 | `extensions_and_helpers.sql` | `pgcrypto`, `pg_cron`, `pg_net`, `pgaudit`; `public.has_role()`, `public.tenant_id()`. (Helpers live in `public` because hosted Supabase blocks CREATE on `auth` for the migration role.) `pg_net` + `pgaudit` later moved to `extensions` schema in 0022 + 0023. |
| 0002 | `identity.sql` | `tenant`, `tenant_member`, Custom Access Token Hook (`public.custom_access_token_hook`). |
| 0003 | `weg_domain.sql` | `weg`, `unit`, `person`, `ownership` (incl. composite FKs + tenant defaults). |
| 0004 | `versammlung.sql` | `meeting`, `agenda_item`, `resolution`, `vote`, `proxy`, `protocol`. |
| 0005 | `beschluss_sammlung.sql` | Append-only `beschluss_sammlung_entry` + anfechtungs-event chain (§ 24 Abs. 7 WEG). |
| 0006 | `audit_event.sql` | Partitioned append-only audit log, 3-layer protection (schema columns for HMAC). |
| 0007 | `agent_suggestions.sql` | `agent_suggestion` — KI-Vorschläge, getrennt von echten Beschlüssen. |
| 0008 | `rls_policies.sql` | RLS + FORCE RLS + 4 policies per table (see § 3.4 Hardening-Checkliste). |
| 0009 | `audit_hmac.sql` | HMAC hash-chain on `audit_event`. Header `grant audit_writer to postgres` because hosted-postgres is not auto-member of audit_writer. Vault secret seeded in 0017. |
| 0010 | `embedding_layer.sql` | `pgvector` extension + partitioned `embedding(tenant_id, id)` table (vector(1024) for bge-m3) with HNSW + GIN(`german` FTS) indexes, composite FK to `weg`, RLS + FORCE RLS (§ 4.5). `vector` extension later moved to `extensions` schema in 0024; embedding column type is now `extensions.vector(1024)`. |
| 0011 | `actor_type_guards.sql` | BEFORE-trigger `audit_writer.assert_not_agent_write()` on `vote`, `resolution`, `beschluss_sammlung_entry`, `protocol` (signing-columns only). |
| 0012 | `audit_partition_rotation.sql` | `audit_writer.rotate_audit_partitions(months_ahead)` + `pg_cron` job. **Replaced in 0014** to enforce RLS on new partitions. |
| 0013 | `set_actor_type_hook.sql` | PostgREST `db_pre_request` hook reading `X-Actor-Type` → sets `app.actor_type` GUC. Uses `ALTER ROLE authenticator SET …` (works on both local and hosted; the original `ALTER DATABASE postgres` failed on hosted with insufficient_privilege). |
| 0014 | `partition_rls.sql` | Backfill `ENABLE+FORCE RLS` on every existing `audit_event_*` and `embedding_p*` partition, plus replacement `rotate_audit_partitions` that enforces RLS on every new partition. Closes the advisor `rls_disabled_in_public` ERROR class. |
| 0015 | `dokumente.sql` | Dokumente-Modul: `document` + `document_version` (append-only via trigger) + private storage bucket `weg-docs` with path-based RLS (`<tenant_id>/<weg_id>/<doc_typ>/<uuid>.<ext>`). |
| 0016 | `revoke_trigger_rpc.sql` | Backfill `REVOKE EXECUTE … FROM anon, authenticated` on `public.tg_document_set_current_version()` so the SECURITY DEFINER trigger function is not callable as `/rest/v1/rpc/`. Source-of-truth REVOKE is already inline in 0015. |
| 0017 | `vault_seed_audit_hmac_key.sql` | Idempotently seed `audit_hmac_key` in `vault.secrets`. Replaces the operational SQL-Editor step from the 0009 header. |
| 0018 | `pgrst_pre_request_backfill.sql` | Backfill the `ALTER ROLE authenticator SET pgrst.db_pre_request = …` on environments where 0013 was applied with the old `ALTER DATABASE` form; idempotent. |
| 0019 | `function_search_path.sql` | `SET search_path = ''` on `public.has_role`, `public.tenant_id`, and the two legacy trigger helpers — closes the `function_search_path_mutable` advisor class. |
| 0020 | `revoke_pgaudit_rpc.sql` | First attempt to close the `anon`/`authenticated_security_definer_function_executable` advisors on `public.pgaudit_ddl_command_end` and `public.pgaudit_sql_drop`: `REVOKE EXECUTE … FROM anon, authenticated`. Cloud-side **no-op** (PG: `01006: no privileges could be revoked`) because the roles inherit, not own. Made structurally moot by 0023. |
| 0021 | `revoke_pgaudit_rpc_from_public.sql` | Follow-up `REVOKE … FROM PUBLIC` on the same pgaudit functions. Also a Cloud-side **no-op**: the migration role sees no PUBLIC grant either. Made structurally moot by 0023. |
| 0022 | `move_pg_net_to_extensions.sql` | `DROP EXTENSION pg_net; CREATE EXTENSION pg_net WITH SCHEMA extensions`. Closes the `extension_in_public` advisor for pg_net. `ALTER EXTENSION … SET SCHEMA` fails Cloud-side with SQLSTATE 42501 (`supabase_admin` owns); the drop+recreate as `postgres` works. Safe because there are zero `net.http_*` callers today. |
| 0023 | `move_pgaudit_to_extensions.sql` | `DROP EXTENSION pgaudit CASCADE; CREATE EXTENSION pgaudit WITH SCHEMA extensions`. Closes the `extension_in_public` advisor for pgaudit **and** all 4 `*_security_definer_function_executable` advisors that 0020+0021 could not close. No pgaudit GUC tuning to restore. |
| 0024 | `move_vector_to_extensions.sql` | `DROP EXTENSION vector` + drop+rebuild `public.embedding` parent + `embedding_p0` partition with `extensions.vector(1024)` + `extensions.vector_cosine_ops`. Guard at top aborts if `public.embedding` has any rows (currently empty per `retrieve.py:129`). Distance operators (`<=>`, `<#>`, `<->`) keep resolving via search_path. Closes the last `extension_in_public` advisor. |
| 0025 | `embedding_partition_rls.sql` | `ENABLE+FORCE RLS` on `embedding_p0`. The 0024 rebuild lost the 0014 backfill; Supabase linter immediately flagged it as `rls_disabled_in_public` ERROR. This restores the 0014 invariant for the single existing partition; future repartitioning per the 0010 rotation plan must include ENABLE+FORCE inline. |

**Deferred (not in baseline):**

- Audit cold-storage migration (planned) — detach `audit_event` partitions older than 24 months and export them to Supabase Storage (S3-Glacier-equivalent), per § 3.5 cold-storage rule. Blocked on the storage-bucket + IAM design.
- **Agent-side header attachment** — the 0013 hook only fires when callers send `X-Actor-Type: agent`. The remaining piece lives in `apps/agent/app/tools/runtime.py`: the `@side_effect` decorator (docs/04 § 4.3) must attach the header to every per-request supabase-py client. Until that lands, the 0011 trigger is wired end-to-end but never triggered in practice.

## Workflow (remote-only)

This project deploys schema changes directly to the Frankfurt cloud project (`sgdlzafvhrfulwidqsno`). No local `supabase start` stack is used.

```bash
# One-off setup
supabase link --project-ref sgdlzafvhrfulwidqsno --workdir infra

# Day-to-day
supabase migration new <name> --workdir infra   # new 00NN_*.sql under migrations/
just db-migrate                                  # supabase db push --workdir infra
supabase migration list --workdir infra          # compare local files vs cloud state
```

The CLI tracks applied versions in `supabase_migrations.schema_migrations`. Connection requires the DB password (kept in `~/.env.local` as `SUPABASE_DB_PASSWORD`, also in the macOS Keychain after `supabase link`).

`supabase db reset` is **not** wired into `just`; running it remotely would wipe the cloud DB. See the guarded `just db-reset` recipe.

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

Migration 0006 defines `audit_event.prev_hash` and `audit_event.row_hash` as `bytea NOT NULL`. Migration 0009 lands the HMAC computation (`HMAC_SHA256(prev_hash || canonical_json(payload), vault_key)`) as a `BEFORE INSERT` trigger that runs `SECURITY DEFINER` under the `audit_writer` role, and ships `audit_writer.verify_chain(tenant_id)` for nightly tamper detection.

**Vault seed (production, one-off):**

```sql
select vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'audit_hmac_key');
```

In local dev (`supabase start`) the trigger falls back to an all-zero key with a `RAISE WARNING`, so migrations and tests stay green without manual setup. Shipping to prod without seeding the Vault secret is the failure mode this warning protects against. Tamper-detection contract stubs live in `tests/0002_audit_chain.sql`.

## References

- Domain model + invariants: `docs/01-system-design.md` § 4
- JWT claim location (`app_metadata.tenant_id`): `docs/02-architecture-deployment.md` § 2.4
- RLS + audit + 3-layer protection: `docs/03-security-model.md` § 3.4 + § 3.5
