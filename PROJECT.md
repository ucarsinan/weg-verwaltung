# Project: WEG-Verwaltungssoftware Track 2 & 3

## Executive Summary

Dieser Status konsolidiert den lokalen Stand des Track-2/3-Worktrees. Der reale Codezustand gilt vor aelteren Statusnotizen: lokal existieren Supabase-Migrationen bis `0055`, eine Next.js-16-Web-App, ein FastAPI/LangGraph-Agent, E2E-Specs und Audit-/Finance-/Meeting-/Vorgangs-/Advisor-Hardening-Artefakte.

**Lokal belegt:** Migrationen `0001-0055` liegen unter `infra/supabase/migrations`. `0045_audit_verification_repair.sql` und `0046_audit_checkpoint_owner_hardening.sql` bilden den Audit-Forward-Repair ab. `0047`/`0048` bilden Finance-Lifecycle-Hardening ab. `0049` bildet Meeting/Resolution-Hardening ab. `0050` bildet die Audit-Console-Read-API ab. `0051` repariert den Actor-Guard fuer DELETE-Trigger. `0052` legt die Vorgangszentrale-Foundation an. `0053` ergaenzt Settings-relevante Audit-Trigger. `0054` verankert Agent-Suggestions optional an Vorgaengen. `0055` haertet Advisor-gefundene EXECUTE-Grants und RLS-InitPlan-Policies.

**Nicht in diesem Audit verifiziert:** Cloud-Migrationsstand, aktuelle Cloud-E2E-Ergebnisse, GitHub-CI-Status und produktives Web-/Agent-Hosting.

**Ampel:** Rot fuer Release-Readiness wegen dirty Worktree und ungeprueftem Cloud-/E2E-/CI-/Hosting-Stand. Gelb fuer lokalen Review-Schnitt, sobald die Aenderungen in kleine Changesets getrennt sind.

**Test-/Validierungsstatus:** Der Auftrag nennt als Ausgangslage Web-Tests `117/117`, Agent-Tests `67 passed / 5 skipped`, Web Typecheck/Lint, Agent Ruff/Mypy und Web Build als gruen. Diese Ergebnisse wurden in diesem Audit nicht als Cloud-/E2E-Status gewertet; nach Doku-Korrektur werden nur lokale, nicht-cloud-mutierende Checks erneut ausgefuehrt.

## Architecture

- **Audit Module (`modules/audit`)**: Exposes read-only visibility for old audit partitions and archive-file metadata. Tenant-triggered detach/drop is not an active product goal.
- **Finanzen Module (`modules/finanzen`)**: Exposes database structures for `wirtschaftsplan` and `sollstellung`. Option B is binding: `sollstellung` rows are historical, materialized unit-month targets and are never recalculated, overwritten, or deleted because a plan, unit, or MEA value changes later.
- **Supabase Storage**: A private, tenant-isolated bucket `audit-archives` holds archive metadata/files only after a privileged export + manifest + HMAC-verify job exists. Destructive detach/drop remains disabled.
- **Next.js Web App**:
  - `/audit`: UI interface for `tenant_admin` to view archivable partitions and archive metadata. Archive/detach/drop execution remains disabled.
  - `/wegs/[id]/finanzen`: UI page/form to list, create, edit, and delete Wirtschaftspläne for a specific WEG.
  - `/vorgaenge`: UI interface for the operational Vorgangszentrale foundation.

## Code Layout

- `infra/supabase/migrations/`: Database SQL migration files.
- `apps/web/src/app/(dashboard)/audit/`: Audit log page and cold-storage read UI.
- `apps/web/src/app/(dashboard)/wegs/[id]/finanzen/`: Financial management page.
- `apps/web/src/app/(dashboard)/vorgaenge/`: Operational Vorgangszentrale pages.
- `apps/web/src/lib/`: Next.js client-side/server-side logic.

## Audit Incident 0042-0044

### Incident Timeline

| Step | Status |
| --- | --- |
| `0006` | `public.audit_event` created as partitioned append-only table with `prev_hash` and `row_hash`; mutation blocked by grants, trigger, and RLS. |
| `0009` | Initial HMAC trigger introduced; v1 hash binds `prev_hash + payload` and verifies recomputation only. |
| `0026` | Business-table audit emitters enabled for `weg`, `meeting`, `agenda_item`, `resolution`, `vote`, and `beschluss_sammlung_entry`. |
| `0029` | Hosted-Supabase Vault permission failures were converted into an all-zero-key fallback to keep writes working. |
| `0030` | Missing `extensions.hmac` access degraded further to unkeyed `pg_catalog.sha256`. |
| `0033` | Vault and `extensions.hmac` grants for `audit_writer` were attempted and documented as successful in prior project notes. |
| `0034` | Correct Vault column `decrypted_secret` restored and HMAC changed to fail-closed locally. |
| `0036` | `wirtschaftsplan` and `sollstellung` audit emitters added. |
| `0042` | Hotfix reasserted fail-closed Vault-keyed HMAC and removed the public internal Sollstellung generator surface. |
| `0043` | Local migration defines a forward-only v2 repair: checkpoint table, metadata+payload HMAC, per-tenant advisory lock, and repaired verifier. |
| `0044` | Local migration tightens the chain read path but overwrites the active insert trigger back to v1 `hash_audit_row(prev_hash, payload)` and narrows `audit_writer` read access. |
| Prior Cloud read-only check | Earlier validation notes record `0042-0044` as applied, but the expected `0043` checkpoint/v2 objects were not present in the observed schema. `verify_chain()` failed with `permission denied for table audit_event`. This was not re-verified in the current audit. |
| `0045` | Local migration reconciles the documented drift pattern, creates per-tenant forward checkpoints, restores v2 metadata+payload HMAC, per-tenant advisory locking, tenant-bound verifier reads, and the compatibility wrapper `verify_chain()`. Historical `audit_event` rows are unchanged. Cloud state must be re-checked before deployment claims. |
| `0046` | Local migration hardens checkpoint table ownership: owner is `postgres`; `audit_writer` keeps only `SELECT`/`INSERT`. Cloud state must be re-checked before deployment claims. |

### Root Cause

The incident has two layers:

1. Earlier operational fallbacks in `0029` and `0030` prioritized availability over HMAC strength when hosted Supabase blocked Vault or `extensions.hmac` access. That created a legacy audit window with reduced forge resistance.
2. The local `0043` repair model was forward-only and appropriate in shape, but the local `0044` read-tightening migration regressed the active insert path to v1 hashing and made the verifier read path too narrow. Earlier Cloud notes documented a worse pre-0045 schema than the local intent: 0043 was recorded as applied, but its repair objects were absent. This was not re-verified in the current audit.

### Impact

**Affected guarantees**

- **Audit Integritaet:** Historical rows from fallback windows cannot honestly be claimed as Vault-keyed HMAC evidence.
- **Legacy Tamper Evidence:** Rows before the 0045 checkpoint cannot be represented as fully v2-verified evidence.
- **Legacy metadata binding:** v1 hashes only payload; actor, action, entity, `seq`, `created_at`, and `db_role` are not cryptographically bound for pre-v2 rows.
- **Pre-0045 concurrency safety:** The v2 per-tenant advisory lock from local `0043` was not active in the earlier observed pre-repair Cloud schema. Locally, `0045` restores it for new rows.

**Not affected**

- **RLS / Tenant Isolation:** No evidence of cross-tenant data exposure. Tenant isolation remains enforced by RLS and tenant-scoped policies.
- **Append Only:** `audit_event` remains protected against UPDATE/DELETE/TRUNCATE by REVOKE, immutable trigger, and missing mutation policies.
- **Beschluss-Sammlung Append-only:** No indication that the Beschluss-Sammlung invariant was affected.
- **Sollstellung Option B:** The finance history model remains separate from the audit-chain verification issue.

### Betroffene Events

Earlier aggregate read-only notes documented a legacy audit population before the `0045` checkpoint. The current audit did not re-run this Cloud check.

- Total audit events, exact sequence ranges, exact timestamps, and tenant identifiers are intentionally omitted from this summary.
- The relevant security conclusion is that a documented legacy window exists before the `0045` checkpoint and must not be represented as fully v2-HMAC-verified evidence.

Observed `entity_typ`/`action` groups include:

- `weg`: insert/update
- `meeting`: insert/update
- `agenda_item`: insert/update/delete
- `resolution`: insert/update
- `vote`: insert
- `beschluss_sammlung_entry`: insert
- `wirtschaftsplan`: insert/update/delete
- `sollstellung`: insert
- documented validation marker events

No payload values are included in this documentation.

### Remediation

Implemented or attempted:

- `0042` moved the internal Sollstellung generator into `private`, rebuilt the public RPC with tenant checks and agent write blocking, and restored fail-closed Vault-keyed HMAC behavior.
- `0043` locally defines a forward-only chain repair with checkpoints, v2 HMAC over metadata plus payload, advisory locking, and verifier compatibility.
- `0044` locally attempts least-privilege read tightening for the chain-link trigger.

Last documented Cloud/runtime validation, not re-verified in this audit:

- Earlier validation notes record the expected repair objects through `0045`.
- Earlier validation notes record clean `audit_writer.verify_chain_repaired()` and `audit_writer.verify_chain()` results for observed tenants.
- Earlier runtime validation appended a small forward-audit segment per observed tenant and verified prev-hash continuity plus v2 row-hash recomputation.

Automation status:

- `infra/supabase/tests/0002_audit_chain.sql` and `infra/supabase/tests/0046_least_privilege.sql` now assert the forward audit path, verifier wrapper behavior, checkpoint boundary, v2 metadata+payload recomputation, and 0046 checkpoint ownership/grant boundary against a local rollback-only Supabase test database.
- True concurrent advisory-lock stress and full-table FORCE-RLS coverage remain broader hardening backlog.

### Legacy Audit Window

**Legacy range by documented observed tenant window:**

- One documented tenant has a legacy segment before the `0045` checkpoint.
- Another documented tenant has no observed legacy segment in the prior validation notes; its rows start in the forward-validation segment.

For the documented legacy tenant, legacy rows do not match current Vault-keyed HMAC recomputation. The rows remain append-only evidence, but they cannot be represented as current HMAC-chain evidence. Many legacy rows also have a zero `prev_hash`, so predecessor continuity is not established for that legacy window.

**Restrictions:**

- Rows written during fallback periods may be all-zero-key HMAC or unkeyed SHA-256, depending on the deployed function state at write time.
- v1 rows bind payload but not full audit metadata.
- Historical rows are not rewritten by design and should remain preserved as legacy evidence, not upgraded in place.

### Verified Forward Audit Window

**Manually validated new HMAC window, according to prior validation notes:**

- A small forward-validation segment exists for each documented observed tenant after the `0045` checkpoint.
- The documented segments are HMAC-valid and continuity-valid in the prior validation notes.

**Pre-0045 operational verifier status:** broken before repair in the prior Cloud notes. `audit_writer.verify_chain()` failed with `permission denied for table audit_event`, and the observed schema lacked the local `0043` repair verifier/checkpoint objects. `0045`/`0046` locally define the repair path for the verified window after the checkpoint; current Cloud state must be re-checked before deployment claims.

**Verified Forward Audit Window after 0045:** The documented forward-verifiable window begins per tenant at `seq > audit_writer.audit_chain_repair_checkpoint.valid_after_seq`. Prior runtime validation notes document a small appended segment for each observed tenant with 32-byte `prev_hash`/`row_hash`, valid prev-hash continuity, valid v2 recomputation, and clean `verify_chain_repaired()` plus `verify_chain()` results. This was not re-verified in the current audit.

### Remaining Risks

- **Gelb:** Legacy audit rows before the 0045 checkpoint have reduced forensic strength and remain outside v2 verification by design.
- **Gruen:** `infra/supabase/tests/0002_audit_chain.sql` is now an executable pgTAP contract for 0045 forward-audit behavior.
- **Gruen:** `infra/supabase/tests/0046_least_privilege.sql` protects 0046 checkpoint ownership/grants, RPC exposure, column grants, and audit RLS/FORCE-RLS catalog invariants.
- **Gruen:** Forward audit verification is locally represented from the 0045 checkpoint and was clean in prior validation notes; current Cloud state was not re-verified in this audit.
- **Gruen:** No evidence of tenant-isolation failure, audit deletion, or Beschluss-Sammlung mutation.

### Current Status

**Ampel:** Gruen for locally represented forward-audit repair and prior documented validation, Gelb for documented legacy evidence, and Rot for any deployment claim until the current Cloud state is re-verified.

Feature and architecture work may resume locally for flows that rely on forward audit from the `0045` checkpoint. Product copy must still avoid claiming that the pre-0045 legacy window is fully v2-HMAC verified, and deployment copy must wait for a fresh Cloud check.

### Naechste empfohlene Aufgabe

Add an executable regression test for v2 insert + verification + 0044/0046-style least-privilege read tightening.

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | E2E Testing Suite | Design and build E2E Playwright tests for Tracks 2/3 | None | IN_PROGRESS |
| 2 | Database Migrations | Implement migrations through `0055` locally | None | LOCAL - Cloud state not verified in this audit |
| 3 | Audit Cold-Storage UI | Read-only audit partition/archive visibility | M1, M2 | BLOCKED - destructive execution remains disabled until privileged export + manifest job exists |
| 4 | Finanzen UI | Wirtschaftsplan and Hausgeld UI | M1, M2 | LOCAL - review pending |
| 5 | E2E Verification | Run E2E/unit tests and verify RLS compliance | M3, M4 | PENDING - no `just e2e` in this audit |
| 6 | Adversarial Hardening | Harden residual security issues | M5 | PENDING - forward audit repaired; legacy caveat documented |

## Interface Contracts

### Database Schema & RPCs

- **Wirtschaftsplan**:
  - `public.wirtschaftsplan` table: `id`, `tenant_id`, `weg_id`, `jahr`, `bezeichnung`, `gesamtkosten`, `created_at`, `updated_at`.
- **Sollstellung**:
  - `public.sollstellung` table: `id`, `tenant_id`, `wirtschaftsplan_id`, `unit_id`, `monat`, `betrag`, `created_at`, `updated_at`.
  - Option B: generated rows are historical claims at unit-month level. Existing rows are not recalculated after `wirtschaftsplan`, `unit`, or MEA changes.
- **RPC `audit_writer.get_archivable_partitions()`**:
  - Returns `table(partition_name text, partition_date date)` for partitions older than 24 months.
- **RPC `audit_writer.detach_and_drop_partition(p_name text)`**:
  - Disabled. Tenant UI must not rely on detach/drop. Destructive partition handling stays blocked until a privileged export + manifest + HMAC-verify job exists and the audit-chain verifier is healthy.
