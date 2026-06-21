# infra/supabase

Supabase Postgres baseline for WEG-Verwaltung: tenant model, domain schema, append-only audit log, and RLS policies. The local migration baseline is designed to enforce multi-tenant isolation via `(SELECT auth.jwt() -> 'app_metadata' ->> 'tenant_id')` on public tenant tables (see `docs/03-security-model.md` § 3.4). Current Cloud state must be checked separately before deployment claims.

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
| 0026 | `audit_emit_triggers.sql` | Business-table audit triggers via `audit_writer.tg_emit_audit_event()`. |
| 0027 | `audit_writer_grants.sql` | Grants needed by audit writer functions. Superseded/extended by later HMAC hardening. |
| 0028 | `audit_emit_jwt_inline.sql` | Fixes audit trigger JWT handling inline after hosted-Supabase role/search-path constraints. |
| 0029 | `audit_hmac_vault_fallback.sql` | Hardens HMAC key lookup fallback behavior. |
| 0030 | `audit_hmac_extensions_fallback.sql` | Hardens `extensions.hmac` fallback behavior. |
| 0031 | `protocol_document_link.sql` | Links generated protocol PDFs to the document module. |
| 0032 | `protocol_awaiting_review.sql` | Adds protocol `awaiting_review` status for HITL review flow. |
| 0033 | `audit_rights_and_co_ownership.sql` | Attempts Vault/Extensions grants for `audit_writer` and adds `ownership_co_owner` with RLS + composite FKs. |
| 0034 | `audit_hmac_undefined_column_fix.sql` | Catches hosted Vault column/permission mismatches in `audit_writer.hash_audit_row`. |
| 0035 | `audit_cold_storage.sql` | Creates private `audit-archives` bucket and read/list helpers. The initial service-role detach/drop path is disabled again in 0041 until a complete export job exists; authenticated users cannot upload archives. |
| 0036 | `wirtschaftsplan_hausgeld.sql` | Adds `wirtschaftsplan` + `sollstellung`, RLS, audit triggers, and initial materialized Sollstellung generation by MEA. |
| 0037 | `audit_cold_storage_api.sql` | Public wrappers for cold-storage read/check helpers; archive execution remains service-role only. |
| 0038 | `generate_sollstellungen_security_definer.sql` | Replaces Sollstellung generation with explicit tenant check under `SECURITY DEFINER`; units with unusable MEA generate `0.00` instead of division-by-zero. |
| 0039 | `sollstellung_recalculation_triggers.sql` | Replaces recalculation with Option-B insert-only generation: missing Sollstellungen are inserted set-based and idempotently; existing historical rows are never updated/deleted. Also restricts plan deletion once generated rows exist. |
| 0040 | `lock_down_sollstellung_writes.sql` | Removes direct writes to generated Sollstellungen, adds a DB trigger guard against INSERT/UPDATE/DELETE bypasses, and blocks parent rewrites that would invalidate posted historical rows. |
| 0041 | `disable_audit_partition_drop_until_export_job.sql` | Keeps audit cold-storage execution non-destructive: partition detach/drop RPCs now raise until a complete privileged export+manifest job exists. |
| 0042 | `security_hotfix_0039_0040.sql` | Removes the internal Sollstellung generator from the public RPC surface, fixes runtime generation issues, and restores fail-closed Vault-keyed audit HMAC behavior. |
| 0043 | `audit_chain_repair.sql` | Local file defines a forward-only audit-chain repair with checkpoint table, v2 metadata+payload HMAC, advisory locking, and repaired verifier. Prior Cloud notes documented migration metadata with `0043` applied while expected v2/checkpoint objects were absent; current Cloud state was not verified in this audit. |
| 0044 | `audit_chain_read_tightening.sql` | Tightens the internal previous-row read path to tenant-bound RLS and column grants. Pre-0045 issue: this also left the live trigger on v1 payload-only HMAC and made `audit_writer.verify_chain()` fail with insufficient `audit_event` read permissions. |
| 0045 | `audit_verification_repair.sql` | Defines a repair migration for previously documented 0043/0044 drift, restores missing v2 repair objects, creates per-tenant forward checkpoints, restores v2 metadata+payload HMAC with tenant advisory locking, repairs tenant-bound verifier permissions, and leaves legacy rows unchanged. Local file present; current Cloud application was not verified in this audit. |
| 0046 | `audit_checkpoint_owner_hardening.sql` | Moves `audit_chain_repair_checkpoint` ownership to `postgres` so `audit_writer` keeps only `SELECT`/`INSERT` on the repair artifact. Local file present; current Cloud application was not verified in this audit. |
| 0047 | `wirtschaftsplan_lifecycle.sql` | Adds local Finance lifecycle structures for Wirtschaftspläne and historical Sollstellungen. |
| 0048 | `wirtschaftsplan_lifecycle_guard_fix.sql` | Fixes/hardens local Finance lifecycle guards. |
| 0049 | `meeting_resolution_hardening.sql` | Adds local Meeting/Resolution hardening. |

**Deferred (not in baseline):**

- Audit cold-storage execution job — local migration files now create the bucket and read/check API, but the actual system-wide export + detach/drop job is intentionally disabled at DB and UI level. Before enabling this track, verify cloud migration state and design a privileged job that exports complete global partitions with manifest/checksum and HMAC verification before detach/drop.
- Finance follow-ups — current Sollstellungen are historical unit-month targets generated from Wirtschaftsplänen, not a complete payment ledger. Local migrations now include Finance lifecycle hardening through `0048`, but Nachtragswirtschaftsplan workflows, storno/correction UI, SEPA debit batches, dunning, bank reconciliation, and ownership-resolved receivables remain future scope.
- **Agent-side header attachment** — the 0013 hook only fires when callers send `X-Actor-Type: agent`. The remaining piece lives in `apps/agent/app/tools/runtime.py`: the `@side_effect` decorator (docs/04 § 4.3) must attach the header to every per-request supabase-py client. Until that lands, the 0011 trigger is wired end-to-end but never triggered in practice.

## Workflow (remote-only)

This project deploys schema changes directly to the linked Frankfurt Supabase Cloud project. The concrete project reference belongs in local CLI/env configuration, not repo documentation. No local `supabase start` stack is used.

```bash
# One-off setup
supabase link --project-ref <frankfurt-project-ref> --workdir infra

# Day-to-day
supabase migration new <name> --workdir infra   # new 00NN_*.sql under migrations/
just db-migrate                                  # supabase db push --workdir infra
supabase migration list --workdir infra          # compare local files vs cloud state
```

The CLI tracks applied versions in `supabase_migrations.schema_migrations`. Connection requires the Supabase DB password from local secret storage; do not document concrete secret paths or key names in repo docs.

`supabase db reset` is **not** wired into `just`; running it remotely would wipe the cloud DB. See the guarded `just db-reset` recipe.

## RLS philosophy (binding contract)

Every `public.*` table follows § 3.4 to the letter:

1. `ENABLE ROW LEVEL SECURITY`
2. `FORCE ROW LEVEL SECURITY` (closes the table-owner bypass)
3. `REVOKE ALL ON … FROM PUBLIC` (the app role is never the owner)
4. `tenant_id` column with `DEFAULT public.tenant_id()` and `NOT NULL`
5. Composite FK `(tenant_id, parent_id) → parent(tenant_id, id)` whenever there is a parent
6. **One policy per command** (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) using the `(SELECT auth.jwt() ...)` InitPlan-cached pattern — never `FOR ALL`

Special cases:

- `audit_event`, `beschluss_sammlung_entry`, `beschluss_anfechtung_event` — only `SELECT` + `INSERT` policies. `UPDATE`/`DELETE` are blocked at three layers (`REVOKE`, trigger, RLS-absence).
- `tenant` — `SELECT` only, gated by membership.

## Hash-chain note

Migration 0006 defines `audit_event.prev_hash` and `audit_event.row_hash` as `bytea NOT NULL`. Migration 0009 lands the initial HMAC computation as a `BEFORE INSERT` trigger that runs `SECURITY DEFINER` under the `audit_writer` role, and ships `audit_writer.verify_chain(tenant_id)` for tamper detection.

**Vault seed (production, one-off):**

```sql
select vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'audit_hmac_key');
```

The historical fallback behavior from 0029/0030 is no longer an acceptable production state. From 0034/0042 onward, HMAC computation is intended to fail closed if Vault or `extensions.hmac` cannot be used.

### Checkpoint concept

`audit_writer.audit_chain_repair_checkpoint` is a per-tenant forward boundary. `valid_after_seq` points to the last legacy row at repair time. Rows with `seq <= valid_after_seq` are preserved but not v2-verified. Rows with `seq > valid_after_seq` must verify by v2 HMAC and prev-hash continuity, using `valid_after_row_hash` as the first anchor.

### Audit incident status

Prior Cloud/runtime validation after `0045`/`0046` showed the following. This audit did not re-run Cloud verification; treat the bullets as historical validation evidence, not as a fresh Cloud-state check.

- Supabase migration metadata was last documented as listing `0045` and `0046` as applied after `0043`/`0044`.
- The observed Cloud schema was documented as containing `audit_writer.audit_chain_repair_checkpoint`, `audit_writer.hash_audit_event_v2()`, `audit_writer.verify_chain_repaired()`, and the compatibility wrapper `audit_writer.verify_chain()`.
- The active `audit_event_hmac_chain` trigger was documented as pointing to `audit_writer.audit_event_before_insert()`.
- `audit_writer.verify_chain_repaired()` and `audit_writer.verify_chain()` were documented as returning `0` broken rows for observed tenants.
- Existing audit rows were documented as append-only. Legacy rows before the checkpoint are preserved as legacy evidence, not rehashed.

Observed audit windows are intentionally generalized here:

- Legacy Audit Window: one documented observed tenant has legacy rows before the repair checkpoint that do not match current Vault-keyed v2 HMAC recomputation.
- Verified Forward Audit Window: prior manual validation confirmed post-checkpoint HMAC segments for observed tenants.
- Runtime validation appended representative post-repair rows for observed tenants and documented prev-hash continuity, v2 recomputation, and clean `verify_chain_repaired()` plus `verify_chain()` results.

Tamper-detection and 0046 least-privilege regression coverage now lives in executable pgTAP suites: `tests/0002_audit_chain.sql` and `tests/0046_least_privilege.sql`.

### Validation coverage

| Claim area | Current evidence | Automated test status |
| --- | --- | --- |
| `0045`/`0046` migration content | SQL migrations define checkpoints, v2 HMAC, verifier wrapper, advisory lock, tenant-bound read policy, and checkpoint owner/grants. | Covered by `tests/0002_audit_chain.sql` and `tests/0046_least_privilege.sql`. |
| Verified Forward Audit Window | Prior manual Cloud/runtime validation for observed tenants; exact operational sequence windows omitted. Current Cloud state was not re-verified in this audit. | `0002_audit_chain.sql` inserts rollback-only runtime rows and verifies the forward segment. |
| `verify_chain_repaired()` and `verify_chain()` | Prior Cloud validation showed `0` broken rows for observed tenants. Current Cloud state was not re-verified in this audit. | `0002_audit_chain.sql` calls both functions for valid and intentionally broken checkpoint-boundary cases. |
| v2 metadata+payload HMAC | Migration review and manual recomputation for the documented validation window. | `0002_audit_chain.sql` recomputes stored hashes with `hash_audit_event_v2()` and proves metadata changes alter the hash. |
| Checkpoints and advisory locks | Migration review shows checkpoint boundaries and `pg_advisory_xact_lock`. | Checkpoint boundary is covered; true concurrent advisory-lock stress remains uncovered. |
| RPC surface | Sollstellung public/internal RPC lockdown has string-level Vitest coverage for migration `0042`; cold-storage detach/drop denial has Playwright coverage. | `0046_least_privilege.sql` asserts audit repair internals are not executable by `anon`, `authenticated`, or `service_role`. |
| RLS / FORCE RLS | Migration files apply `ENABLE`/`FORCE RLS`; Playwright checks cover selected finance and cold-storage paths. | `0046_least_privilege.sql` checks `audit_event` parent/partitions and chain-read policy; full-table RLS coverage remains broader backlog. |
| Least privilege | Migration review shows `REVOKE`/`GRANT` boundaries and 0046 checkpoint owner hardening. | `0046_least_privilege.sql` asserts checkpoint owner, table privileges, column grants, and no grant-option escalation. |

## References

- Domain model + invariants: `docs/01-system-design.md` § 4
- JWT claim location (`app_metadata.tenant_id`): `docs/02-architecture-deployment.md` § 2.4
- RLS + audit + 3-layer protection: `docs/03-security-model.md` § 3.4 + § 3.5
