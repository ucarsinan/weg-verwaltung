# Audit Console Implementation Plan

> **Hinweis für agentische Umsetzung:** Der vorgesehene `writing-plans`-Skill ist in dieser Umgebung nicht installiert. Dieser Plan folgt deshalb dem vorhandenen `docs/superpowers/plans/`-Format und ist aus dem freigegebenen Spec abgeleitet.

**Goal:** Den Audit-Bereich unter `/audit` zu einer funktionalen Audit-Konsole ausbauen: Verlauf mit Suche/Filtern/Detailpanel, Admin-Integritätsprüfung und read-only Archivstatus.

**Architecture:** `public.audit_event` bleibt append-only und unverändert. Eine kleine Supabase-RPC-Schicht liefert feed-fähige, maskierte, rollenabhängige Daten. Die Next.js-Seite wird server-first geladen und nutzt Client Islands nur für Tabs, Filter, Pagination, Zeilenauswahl und Reveal/Verify-Actions.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase SSR/RLS/RPC, existing Tailwind v4 tokens, existing UI primitives/components, Vitest, Playwright, pgTAP-style SQL regression tests.

**Spec:** [docs/superpowers/specs/2026-06-21-audit-console-design.md](../specs/2026-06-21-audit-console-design.md)

---

## Guardrails

- Vor jeder Task die betroffenen Dateien erneut lesen; der Worktree enthält viele bestehende fremde Änderungen.
- Keine bestehenden fremden Änderungen revertieren.
- Keine Cloud-E2E-Läufe und kein `just db-migrate` gegen Frankfurt ohne explizite Freigabe.
- Keine Mutation von `public.audit_event` außer neuen append-only Audit-Einträgen über bestehende Trigger-/Writer-Mechanik.
- Keine tenantseitige Archivierung, kein Detach, kein Drop.
- Neue RPCs müssen RLS und `public.tenant_id()` / `public.has_role('tenant_admin')` nutzen.
- UI-Sprache Deutsch, Code-IDs Englisch.
- Server Components bleiben Default; `use client` nur für echte Interaktion.

---

## File Map

**Create likely:**

- `infra/supabase/migrations/0050_audit_console_read_api.sql`
- `infra/supabase/tests/0050_audit_console_read_api.sql`
- `apps/web/src/app/(dashboard)/audit/audit-shell.tsx`
- `apps/web/src/app/(dashboard)/audit/audit-feed.tsx`
- `apps/web/src/app/(dashboard)/audit/audit-detail-panel.tsx`
- `apps/web/src/app/(dashboard)/audit/audit-integrity-panel.tsx`
- `apps/web/src/app/(dashboard)/audit/audit-archive-panel.tsx`
- `apps/web/src/app/(dashboard)/audit/formatters.ts`
- `apps/web/src/app/(dashboard)/audit/__tests__/formatters.test.ts`

**Modify likely:**

- `apps/web/src/app/(dashboard)/audit/page.tsx`
- `apps/web/src/app/(dashboard)/audit/actions.ts`
- `apps/web/src/app/(dashboard)/audit/audit-manager.tsx` may be deleted or folded into `audit-archive-panel.tsx`
- `apps/web/src/lib/supabase/database.types.ts` after type generation
- `apps/web/e2e/audit-cold-storage.spec.ts`
- add focused E2E coverage if the current E2E setup is healthy

**Do not touch unless a task explicitly discovers it is required:**

- `apps/agent/**`
- unrelated WEG/Versammlung/Finanzen pages
- existing audit migrations before `0050`
- Cloud seed/admin scripts

---

## Task 1: Reconfirm Current Audit Surface

**Files:**

- Read: `apps/web/src/app/(dashboard)/audit/page.tsx`
- Read: `apps/web/src/app/(dashboard)/audit/actions.ts`
- Read: `apps/web/src/app/(dashboard)/audit/audit-manager.tsx`
- Read: `infra/supabase/migrations/0001_extensions_and_helpers.sql`
- Read: `infra/supabase/migrations/0008_rls_policies.sql`
- Read: `infra/supabase/migrations/0037_audit_cold_storage_api.sql`
- Read: `infra/supabase/migrations/0045_audit_verification_repair.sql`
- Read: `infra/supabase/migrations/0046_audit_checkpoint_owner_hardening.sql`

- [ ] **Step 1: Read current audit route and actions**

```bash
sed -n '1,260p' 'apps/web/src/app/(dashboard)/audit/page.tsx'
sed -n '1,280p' 'apps/web/src/app/(dashboard)/audit/actions.ts'
sed -n '1,260p' 'apps/web/src/app/(dashboard)/audit/audit-manager.tsx'
```

- [ ] **Step 2: Read DB helper contracts**

```bash
sed -n '1,90p' infra/supabase/migrations/0001_extensions_and_helpers.sql
sed -n '353,376p' infra/supabase/migrations/0008_rls_policies.sql
sed -n '1,120p' infra/supabase/migrations/0037_audit_cold_storage_api.sql
rg -n "verify_chain|verify_chain_repaired|audit_chain_repair_checkpoint" infra/supabase/migrations/0045_audit_verification_repair.sql infra/supabase/migrations/0046_audit_checkpoint_owner_hardening.sql
```

- [ ] **Step 3: Record constraints in implementation notes**

Confirm:

- `public.tenant_id()` reads JWT tenant.
- `public.has_role('tenant_admin')` reads JWT role.
- authenticated users can select their tenant's `audit_event`.
- `audit_writer.verify_chain(...)` is internal and needs a public wrapper.
- archive detach/drop stays service-role-only and unused by Tenant UI.

---

## Task 2: DB Migration 0050 - Audit Console Read API

**Files:**

- Create: `infra/supabase/migrations/0050_audit_console_read_api.sql`
- Create/modify: `infra/supabase/tests/0050_audit_console_read_api.sql`

- [ ] **Step 1: Create masked payload helper**

Create a stable helper for UI-safe JSON:

```sql
create or replace function public.audit_mask_payload(p_payload jsonb)
returns jsonb
language plpgsql
stable
set search_path = pg_catalog, public
as $$
begin
  -- Keep structure but redact values likely to be direct identifiers or PII.
  -- Implementation should cover nested objects/arrays or document the chosen depth.
end;
$$;
```

Minimum masking rules:

- keys containing `email`, `mail`, `iban`, `bic`, `phone`, `telefon`
- keys containing `name`, `vorname`, `nachname`
- keys containing `adresse`, `address`, `strasse`, `straße`, `hausnummer`
- raw UUID-looking strings may remain for entity traceability only where they are already explicit IDs; do not mask `entity_id`.

- [ ] **Step 2: Create summary/entity label helpers**

Create deterministic helpers:

- `public.audit_event_summary(p_entity_typ text, p_action text, p_payload jsonb) returns text`
- `public.audit_entity_label(p_entity_typ text, p_payload jsonb, p_entity_id uuid) returns text`
- `public.audit_actor_label(p_actor_type text, p_actor_user_id uuid) returns text`
- `public.audit_risk_flags(p_actor_type text, p_db_role text, p_payload jsonb) returns text[]`

Keep labels conservative:

- `weg insert` -> `WEG angelegt`
- `weg update` -> `WEG aktualisiert`
- `wirtschaftsplan insert/update/delete` -> `Wirtschaftsplan angelegt/aktualisiert/gelöscht`
- fallback -> `<entity_typ> <action>`

- [ ] **Step 3: Create `public.audit_event_feed(...)` RPC**

Return filtered tenant-scoped rows from `public.audit_event` using security invoker and existing RLS.

Signature:

```sql
create or replace function public.audit_event_feed(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_actor_type text default null,
  p_entity_typ text default null,
  p_action text default null,
  p_query text default null,
  p_flag text default null,
  p_cursor_created_at timestamptz default null,
  p_cursor_seq bigint default null,
  p_limit int default 50
)
returns table (
  id uuid,
  seq bigint,
  created_at timestamptz,
  actor_type text,
  actor_user_id uuid,
  db_role text,
  entity_typ text,
  entity_id uuid,
  action text,
  summary text,
  entity_label text,
  actor_label text,
  risk_flags text[],
  payload_masked jsonb,
  can_reveal_payload boolean
)
language sql
stable
security invoker
set search_path = pg_catalog, public;
```

Rules:

- Clamp `p_limit` to a safe maximum, for example 100.
- Cursor sort: `created_at desc, seq desc`.
- Cursor predicate: older than `(p_cursor_created_at, p_cursor_seq)`.
- Search over `summary`, `entity_label`, `entity_typ`, `action`, not raw payload JSON.
- `can_reveal_payload = public.has_role('tenant_admin')`.

- [ ] **Step 4: Create reveal tracking table**

Create a small table that records reveal actions and triggers the existing audit writer:

```sql
create table if not exists public.audit_payload_reveal (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  audit_event_id uuid not null,
  actor_user_id uuid,
  created_at timestamptz not null default now()
);
```

RLS:

- enable and force RLS
- tenant admins can select their tenant rows
- insert only through RPC or `with check (tenant_id = public.tenant_id() and public.has_role('tenant_admin'))`

Attach `audit_writer.tg_emit_audit_event()` to `audit_payload_reveal` so revealing payload produces an append-only audit event without direct app inserts into `audit_event`.

- [ ] **Step 5: Create `public.audit_reveal_event_payload(...)` RPC**

Contract:

```sql
create or replace function public.audit_reveal_event_payload(
  p_event_id uuid,
  p_created_at timestamptz
)
returns jsonb
```

Rules:

- require authenticated tenant admin via `public.has_role('tenant_admin')`
- select target event through RLS and tenant match
- insert `audit_payload_reveal`
- return full `payload`
- never return another tenant's payload

Because `audit_event` primary key includes `tenant_id`, `created_at`, and `id`, pass `p_created_at` with `p_event_id` to locate the row efficiently and unambiguously.

- [ ] **Step 6: Create integrity result table**

Create `public.audit_integrity_check`:

Columns:

- `id uuid primary key`
- `tenant_id uuid not null`
- `checked_at timestamptz not null default now()`
- `checked_by uuid`
- `status text not null check (status in ('not_checked', 'intact', 'warning', 'error'))`
- `seq_from bigint`
- `seq_to bigint`
- `rows_checked int not null default 0`
- `checkpoint jsonb not null default '{}'::jsonb`
- `first_failure jsonb`
- `error_message text`

RLS:

- `tenant_admin` can select own tenant
- insert only through RPC or tenant-admin check
- no update/delete grants

- [ ] **Step 7: Create `public.audit_integrity_status()` RPC**

Return latest row for current tenant. If none exists, return `status = 'not_checked'` with null ranges.

- [ ] **Step 8: Create `public.audit_verify_chain()` RPC**

Security-definer wrapper for tenant admins:

- require `public.has_role('tenant_admin')`
- set tenant context for verifier if required by existing implementation
- call `audit_writer.verify_chain(public.tenant_id())` or `audit_writer.verify_chain_repaired(public.tenant_id())`, depending on current migration contract
- summarize result into `audit_integrity_check`
- return the inserted/latest status row

Do not expose raw `audit_writer` functions to authenticated users.

- [ ] **Step 9: Grants and comments**

Revoke all from public and grant only needed execute/select permissions:

- feed: authenticated
- reveal: authenticated, with internal tenant-admin guard
- status: authenticated, with empty/not-authorized behavior for non-admin if easier for UI
- verify: authenticated, with internal tenant-admin guard

Comment all new public RPCs and tables.

- [ ] **Step 10: DB regression tests**

Test at least:

- non-admin can call feed for own tenant
- non-admin cannot reveal payload
- tenant admin can reveal own tenant payload
- reveal inserts a reveal record and audit event
- `audit_verify_chain()` rejects non-admin
- new RPCs do not grant update/delete on `audit_event`
- cross-tenant rows remain invisible

Do not run remote migration/tests without explicit approval.

---

## Task 3: Regenerate Supabase Types

**Files:**

- Modify: `apps/web/src/lib/supabase/database.types.ts`

- [ ] **Step 1: Decide generation source**

Read existing package scripts and typegen conventions:

```bash
cat apps/web/package.json
rg -n "supabase gen|database.types" apps/web package.json justfile
```

- [ ] **Step 2: Generate types after migration is applied in the target environment**

Preferred command if project conventions confirm it:

```bash
just codegen
```

or the existing Supabase typegen command from project docs.

If Cloud migration has not been applied, do not overwrite generated types with stale remote schema. Instead, add temporary local TypeScript types in the audit route and document why.

- [ ] **Step 3: Verify generated diffs**

Confirm new functions/tables exist in `database.types.ts` and no unrelated schema churn was introduced.

---

## Task 4: Server Actions and Data Contracts

**Files:**

- Modify: `apps/web/src/app/(dashboard)/audit/actions.ts`
- Create: `apps/web/src/app/(dashboard)/audit/formatters.ts`

- [ ] **Step 1: Define TypeScript contracts**

Create/derive types:

- `AuditFeedItem`
- `AuditFeedFilters`
- `AuditFeedResult`
- `AuditIntegrityStatus`
- `AuditArchiveStatus`
- `RevealPayloadResult`

Keep types local if generated Supabase RPC typings are unavailable.

- [ ] **Step 2: Implement `getAuditFeedAction(filters)`**

Rules:

- validate filters server-side
- call `audit_event_feed`
- return `{ items, nextCursor, error }`
- never throw raw Supabase errors into UI

- [ ] **Step 3: Implement `revealAuditPayloadAction(eventRef)`**

Rules:

- event ref includes `id` and `created_at`
- call `audit_reveal_event_payload`
- return full payload only on success
- map unauthorized to German UI error

- [ ] **Step 4: Implement `getIntegrityStatusAction()`**

Rules:

- admin-only in UI, server still handles unauthorized
- call `audit_integrity_status`
- normalize `not_checked`, `intact`, `warning`, `error`

- [ ] **Step 5: Implement `verifyAuditIntegrityAction()`**

Rules:

- call `audit_verify_chain`
- handle timeout/errors as structured result
- do not optimistically mark status green

- [ ] **Step 6: Refactor archive actions**

Keep:

- list archivable partitions
- list archived files
- signed download URL

Remove from UI path:

- tenant-triggered `archivePartitionAction`

The function may stay temporarily if tests still reference it, but the product UI must not show an archive button.

---

## Task 5: Formatter and Redaction Unit Tests

**Files:**

- Create: `apps/web/src/app/(dashboard)/audit/formatters.ts`
- Create: `apps/web/src/app/(dashboard)/audit/__tests__/formatters.test.ts`

- [ ] **Step 1: Add client-safe formatters**

Implement:

- `formatAuditDateTime`
- `formatActorLabel`
- `formatActionLabel`
- `formatRiskFlags`
- `formatJsonPreview`
- `buildEventReference`

These are UI formatters only. Security redaction remains server/RPC-side.

- [ ] **Step 2: Unit test formatter behavior**

Test:

- unknown action/entity fallback
- actor labels for user/agent/system
- risk flags render stable labels
- date formatting remains German locale
- event reference includes `id` and `created_at`

Run focused tests:

```bash
cd apps/web && npm test -- audit
```

If project uses another command, use the existing Vitest command from `package.json`.

---

## Task 6: Audit UI Shell and Verlauf Tab

**Files:**

- Modify: `apps/web/src/app/(dashboard)/audit/page.tsx`
- Create: `apps/web/src/app/(dashboard)/audit/audit-shell.tsx`
- Create: `apps/web/src/app/(dashboard)/audit/audit-feed.tsx`
- Create: `apps/web/src/app/(dashboard)/audit/audit-detail-panel.tsx`

- [ ] **Step 1: Replace raw page layout with `PageHeader` + `AuditShell`**

Use existing or recently introduced UI primitives if present:

- `PageHeader`
- `StatusBadge`
- `EmptyState`
- `Button`
- `Card` only where content is genuinely framed

If `PageHeader` etc. are not committed/available, use local layout without creating a broad design-system task.

- [ ] **Step 2: Implement tabs**

Tabs:

- `Verlauf`
- `Integrität` only if tenant admin
- `Archiv` only if tenant admin

Keep tab state URL-friendly if simple, for example `?tab=integritaet`.

- [ ] **Step 3: Implement filter bar**

Controls:

- search input
- date range inputs or compact presets
- actor select
- entity select
- action select
- flag select
- reset button

Debounce search or submit on Enter; avoid fetching on every keystroke without control.

- [ ] **Step 4: Implement `AuditFeed`**

Requirements:

- stable table dimensions
- selected row state
- loading state
- empty state
- error state
- cursor pagination button `Weitere laden`

- [ ] **Step 5: Implement `AuditDetailPanel`**

Requirements:

- default state when no row selected
- summary and metadata
- masked JSON block
- reveal button only when `can_reveal_payload`
- reveal loading/error state
- technical details collapsed by default

- [ ] **Step 6: Mobile behavior**

On narrow screens, detail panel becomes an inline expanded row or modal-like sheet using existing patterns. Avoid permanently hiding details.

---

## Task 7: Integrität Tab

**Files:**

- Create: `apps/web/src/app/(dashboard)/audit/audit-integrity-panel.tsx`
- Modify: `apps/web/src/app/(dashboard)/audit/actions.ts`

- [ ] **Step 1: Render latest status**

Show:

- status badge
- checked at/by
- seq range
- rows checked
- checkpoint explanation
- first failure or error message if present

- [ ] **Step 2: Add `Integrität prüfen` action**

Behavior:

- disabled while pending
- calls `verifyAuditIntegrityAction`
- updates panel with returned status
- shows timeout/error without overwriting last known good status as green

- [ ] **Step 3: Explain legacy checkpoint**

Include concise text:

```text
Historische Zeilen vor dem 0045-Checkpoint werden als Legacy-Evidence geführt und nicht als v2-HMAC-verifiziert dargestellt.
```

Keep this visible but not alarmist.

---

## Task 8: Archiv Tab

**Files:**

- Create: `apps/web/src/app/(dashboard)/audit/audit-archive-panel.tsx`
- Modify: `apps/web/src/app/(dashboard)/audit/actions.ts`
- Delete or stop importing: `apps/web/src/app/(dashboard)/audit/audit-manager.tsx`

- [ ] **Step 1: Render retention explanation**

Explain:

- 24 months hot
- older partitions are system-job candidates
- tenant UI cannot detach/drop global partitions

- [ ] **Step 2: Render archivable partitions read-only**

Show:

- partition name
- month
- status `Systemjob erforderlich`

No archive button.

- [ ] **Step 3: Render archived files**

Show:

- filename
- size
- created date
- download button

Download uses existing signed URL action with strict filename regex.

- [ ] **Step 4: Surface errors**

Render missing bucket/RPC/storage errors inline.

---

## Task 9: E2E and Regression Coverage

**Files:**

- Modify: `apps/web/e2e/audit-cold-storage.spec.ts`
- Possibly create: `apps/web/e2e/audit-console.spec.ts`
- Create/modify: `infra/supabase/tests/0050_audit_console_read_api.sql`

- [ ] **Step 1: Update cold-storage E2E wording**

Current test expects management UI headings. Update it to expect read-only archive status and absence of `Archivieren`.

- [ ] **Step 2: Add audit console E2E**

Cover:

- `/audit` loads for authenticated user
- Verlauf tab visible
- filter controls visible
- clicking an event opens detail
- payload starts masked
- tenant admin sees `Integrität` and `Archiv`
- non-admin does not see admin tabs, if test users exist

- [ ] **Step 3: Add SQL regression tests**

Use pgTAP style consistent with existing `infra/supabase/tests`.

Cover:

- grants
- RLS tenant scoping
- non-admin reveal rejection
- verify rejection for non-admin
- no update/delete grants on `audit_event`

- [ ] **Step 4: Run safe local tests**

Preferred:

```bash
just test-web
```

If unrelated dirty-worktree failures block full test, run focused Vitest/Playwright tests and document exactly what was not run.

Do not run Cloud E2E without explicit approval.

---

## Task 10: Manual Browser QA

**Files:**

- No planned code changes unless QA finds issues.

- [ ] **Step 1: Start dev server**

```bash
just dev-web
```

or the existing project command.

- [ ] **Step 2: Check desktop viewport**

Verify:

- no overlap
- filters fit
- table scans well
- detail panel readable
- technical details collapsed
- admin tabs visible only for admin

- [ ] **Step 3: Check mobile viewport**

Verify:

- tabs usable
- filters do not crush content
- detail remains reachable
- buttons fit text

- [ ] **Step 4: Check empty/error states**

If possible, simulate:

- no events
- RPC error
- no archived files
- verify error

---

## Task 11: Final Verification and Commit

**Files:**

- All touched files from previous tasks.

- [ ] **Step 1: Review diff**

```bash
git diff --stat
git diff -- infra/supabase/migrations/0050_audit_console_read_api.sql
git diff -- 'apps/web/src/app/(dashboard)/audit'
```

- [ ] **Step 2: Run verification**

Minimum expected:

```bash
just test-web
just typecheck
```

If DB tests are runnable locally without remote mutation, run the focused SQL regression gate. Otherwise document why they were not run.

- [ ] **Step 3: Commit intentionally**

Stage only files relevant to the audit console work. Keep unrelated dirty worktree changes untouched.

Suggested commit:

```bash
git add infra/supabase/migrations/0050_audit_console_read_api.sql infra/supabase/tests/0050_audit_console_read_api.sql apps/web/src/app/'(dashboard)'/audit apps/web/e2e/audit-cold-storage.spec.ts apps/web/src/lib/supabase/database.types.ts
git commit -m "feat(web): make audit console searchable and verifiable"
```

Adjust staged file list to actual touched files.
