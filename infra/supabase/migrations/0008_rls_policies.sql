-- WEG-Verwaltung migration 0008: RLS policies for every public.* table.
-- See docs/03-security-model.md § 3.4 (Hardening-Checkliste).
--
-- Contract per § 3.4:
--   1. ENABLE ROW LEVEL SECURITY
--   2. FORCE ROW LEVEL SECURITY     (closes the owner-bypass)
--   3. REVOKE ALL FROM PUBLIC       (app role ≠ table owner)
--   4. Tenant-scoped column default (already set in 0003–0007)
--   5. Composite FK (tenant_id, id) (already set in 0003–0007)
--   8. One policy per command (SELECT / INSERT / UPDATE / DELETE) — never FOR ALL.
--
-- Performance: (SELECT auth.jwt() -> ...) — the SELECT-wrapper forces an
-- InitPlan that evaluates once per statement, not per row (§ 3.4 perf trick).
-- Supabase advisor lint 0003_auth_rls_initplan warns if you forget.
--
-- Special cases:
--   - tenant: SELECT only own tenant via membership.
--   - beschluss_sammlung_entry / beschluss_anfechtung_event: only SELECT + INSERT
--     (UPDATE/DELETE are blocked by trigger in 0005 + L1 REVOKE).
--   - audit_event: only SELECT + INSERT (UPDATE/DELETE blocked in 0006).
--   - weg: DELETE intentionally omitted — no app path deletes WEGs.

-- Each ALTER + REVOKE + 4 policies is one paragraph per table.

-- ===========================================================================
-- public.tenant — special: SELECT via membership only.
-- ===========================================================================

alter table public.tenant enable row level security;
alter table public.tenant force row level security;
revoke all on public.tenant from public;
grant select on public.tenant to authenticated;

create policy tenant_select_own
  on public.tenant for select to authenticated
  using (
    id = (select auth.tenant_id())
  );

-- No INSERT / UPDATE / DELETE policy on tenant — tenant lifecycle goes through
-- a SECURITY DEFINER admin function (out of scope for this migration).

-- ===========================================================================
-- public.tenant_member — special: SELECT own row; admin-managed otherwise.
-- ===========================================================================

alter table public.tenant_member enable row level security;
alter table public.tenant_member force row level security;
revoke all on public.tenant_member from public;
grant select on public.tenant_member to authenticated;

create policy tenant_member_select_own
  on public.tenant_member for select to authenticated
  using (
    tenant_id = (select auth.tenant_id())
    and (user_id = (select auth.uid()) or (select auth.has_role('tenant_admin')))
  );

-- No INSERT/UPDATE/DELETE policies — handled by SECURITY DEFINER admin functions.

-- ===========================================================================
-- Standard 4-policy block, used for every tenant-scoped business table.
-- Predicate is identical (tenant_id = JWT.tenant_id); the policy names document
-- the command. Future-proofing: never collapse into FOR ALL (§ 3.4 item 8).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- public.weg
-- ---------------------------------------------------------------------------

alter table public.weg enable row level security;
alter table public.weg force row level security;
revoke all on public.weg from public;
grant select, insert, update on public.weg to authenticated;

create policy weg_select_own_tenant
  on public.weg for select to authenticated
  using (tenant_id = (select auth.tenant_id()));

create policy weg_insert_own_tenant
  on public.weg for insert to authenticated
  with check (tenant_id = (select auth.tenant_id()));

create policy weg_update_own_tenant
  on public.weg for update to authenticated
  using (tenant_id = (select auth.tenant_id()))
  with check (tenant_id = (select auth.tenant_id()));

-- DELETE bewusst kein Policy → niemand löscht WEGs in der App (§ 3.4 Beispiel).

-- ---------------------------------------------------------------------------
-- public.unit
-- ---------------------------------------------------------------------------

alter table public.unit enable row level security;
alter table public.unit force row level security;
revoke all on public.unit from public;
grant select, insert, update, delete on public.unit to authenticated;

create policy unit_select_own_tenant
  on public.unit for select to authenticated
  using (tenant_id = (select auth.tenant_id()));

create policy unit_insert_own_tenant
  on public.unit for insert to authenticated
  with check (tenant_id = (select auth.tenant_id()));

create policy unit_update_own_tenant
  on public.unit for update to authenticated
  using (tenant_id = (select auth.tenant_id()))
  with check (tenant_id = (select auth.tenant_id()));

create policy unit_delete_own_tenant
  on public.unit for delete to authenticated
  using (tenant_id = (select auth.tenant_id()));

-- ---------------------------------------------------------------------------
-- public.person
-- ---------------------------------------------------------------------------

alter table public.person enable row level security;
alter table public.person force row level security;
revoke all on public.person from public;
grant select, insert, update, delete on public.person to authenticated;

create policy person_select_own_tenant
  on public.person for select to authenticated
  using (tenant_id = (select auth.tenant_id()));

create policy person_insert_own_tenant
  on public.person for insert to authenticated
  with check (tenant_id = (select auth.tenant_id()));

create policy person_update_own_tenant
  on public.person for update to authenticated
  using (tenant_id = (select auth.tenant_id()))
  with check (tenant_id = (select auth.tenant_id()));

create policy person_delete_own_tenant
  on public.person for delete to authenticated
  using (tenant_id = (select auth.tenant_id()));

-- ---------------------------------------------------------------------------
-- public.ownership
-- ---------------------------------------------------------------------------

alter table public.ownership enable row level security;
alter table public.ownership force row level security;
revoke all on public.ownership from public;
grant select, insert, update on public.ownership to authenticated;
-- DELETE intentionally not granted — Eigentumswechsel = neue Zeile + bis-Datum,
-- nicht DELETE (historische Stimmen müssen referenzierbar bleiben).

create policy ownership_select_own_tenant
  on public.ownership for select to authenticated
  using (tenant_id = (select auth.tenant_id()));

create policy ownership_insert_own_tenant
  on public.ownership for insert to authenticated
  with check (tenant_id = (select auth.tenant_id()));

create policy ownership_update_own_tenant
  on public.ownership for update to authenticated
  using (tenant_id = (select auth.tenant_id()))
  with check (tenant_id = (select auth.tenant_id()));

-- ---------------------------------------------------------------------------
-- public.meeting
-- ---------------------------------------------------------------------------

alter table public.meeting enable row level security;
alter table public.meeting force row level security;
revoke all on public.meeting from public;
grant select, insert, update, delete on public.meeting to authenticated;

create policy meeting_select_own_tenant
  on public.meeting for select to authenticated
  using (tenant_id = (select auth.tenant_id()));

create policy meeting_insert_own_tenant
  on public.meeting for insert to authenticated
  with check (tenant_id = (select auth.tenant_id()));

create policy meeting_update_own_tenant
  on public.meeting for update to authenticated
  using (tenant_id = (select auth.tenant_id()))
  with check (tenant_id = (select auth.tenant_id()));

create policy meeting_delete_own_tenant
  on public.meeting for delete to authenticated
  using (tenant_id = (select auth.tenant_id()));

-- ---------------------------------------------------------------------------
-- public.agenda_item
-- ---------------------------------------------------------------------------

alter table public.agenda_item enable row level security;
alter table public.agenda_item force row level security;
revoke all on public.agenda_item from public;
grant select, insert, update, delete on public.agenda_item to authenticated;

create policy agenda_item_select_own_tenant
  on public.agenda_item for select to authenticated
  using (tenant_id = (select auth.tenant_id()));

create policy agenda_item_insert_own_tenant
  on public.agenda_item for insert to authenticated
  with check (tenant_id = (select auth.tenant_id()));

create policy agenda_item_update_own_tenant
  on public.agenda_item for update to authenticated
  using (tenant_id = (select auth.tenant_id()))
  with check (tenant_id = (select auth.tenant_id()));

create policy agenda_item_delete_own_tenant
  on public.agenda_item for delete to authenticated
  using (tenant_id = (select auth.tenant_id()));

-- ---------------------------------------------------------------------------
-- public.resolution
-- ---------------------------------------------------------------------------

alter table public.resolution enable row level security;
alter table public.resolution force row level security;
revoke all on public.resolution from public;
grant select, insert, update on public.resolution to authenticated;
-- DELETE intentionally not granted — Beschlüsse werden nicht gelöscht.

create policy resolution_select_own_tenant
  on public.resolution for select to authenticated
  using (tenant_id = (select auth.tenant_id()));

create policy resolution_insert_own_tenant
  on public.resolution for insert to authenticated
  with check (tenant_id = (select auth.tenant_id()));

create policy resolution_update_own_tenant
  on public.resolution for update to authenticated
  using (tenant_id = (select auth.tenant_id()))
  with check (tenant_id = (select auth.tenant_id()));

-- ---------------------------------------------------------------------------
-- public.vote
-- ---------------------------------------------------------------------------

alter table public.vote enable row level security;
alter table public.vote force row level security;
revoke all on public.vote from public;
grant select, insert, update on public.vote to authenticated;
-- DELETE intentionally not granted — Stimmen werden nicht gelöscht, höchstens
-- als ungültig markiert (Spalten dafür folgen in einer späteren Migration).

create policy vote_select_own_tenant
  on public.vote for select to authenticated
  using (tenant_id = (select auth.tenant_id()));

create policy vote_insert_own_tenant
  on public.vote for insert to authenticated
  with check (tenant_id = (select auth.tenant_id()));

create policy vote_update_own_tenant
  on public.vote for update to authenticated
  using (tenant_id = (select auth.tenant_id()))
  with check (tenant_id = (select auth.tenant_id()));

-- ---------------------------------------------------------------------------
-- public.proxy
-- ---------------------------------------------------------------------------

alter table public.proxy enable row level security;
alter table public.proxy force row level security;
revoke all on public.proxy from public;
grant select, insert, update, delete on public.proxy to authenticated;

create policy proxy_select_own_tenant
  on public.proxy for select to authenticated
  using (tenant_id = (select auth.tenant_id()));

create policy proxy_insert_own_tenant
  on public.proxy for insert to authenticated
  with check (tenant_id = (select auth.tenant_id()));

create policy proxy_update_own_tenant
  on public.proxy for update to authenticated
  using (tenant_id = (select auth.tenant_id()))
  with check (tenant_id = (select auth.tenant_id()));

create policy proxy_delete_own_tenant
  on public.proxy for delete to authenticated
  using (tenant_id = (select auth.tenant_id()));

-- ---------------------------------------------------------------------------
-- public.protocol
-- ---------------------------------------------------------------------------

alter table public.protocol enable row level security;
alter table public.protocol force row level security;
revoke all on public.protocol from public;
grant select, insert, update on public.protocol to authenticated;
-- DELETE intentionally not granted — Protokolle werden nicht gelöscht.

create policy protocol_select_own_tenant
  on public.protocol for select to authenticated
  using (tenant_id = (select auth.tenant_id()));

create policy protocol_insert_own_tenant
  on public.protocol for insert to authenticated
  with check (tenant_id = (select auth.tenant_id()));

create policy protocol_update_own_tenant
  on public.protocol for update to authenticated
  using (tenant_id = (select auth.tenant_id()))
  with check (tenant_id = (select auth.tenant_id()));

-- ---------------------------------------------------------------------------
-- public.beschluss_sammlung_entry — append-only: SELECT + INSERT only.
-- UPDATE/DELETE blocked by REVOKE (§ 3.5 L1) + trigger (§ 3.5 L2) in 0005.
-- ---------------------------------------------------------------------------

alter table public.beschluss_sammlung_entry enable row level security;
alter table public.beschluss_sammlung_entry force row level security;
revoke all on public.beschluss_sammlung_entry from public;
grant select, insert on public.beschluss_sammlung_entry to authenticated;

create policy bse_select_own_tenant
  on public.beschluss_sammlung_entry for select to authenticated
  using (tenant_id = (select auth.tenant_id()));

create policy bse_insert_own_tenant
  on public.beschluss_sammlung_entry for insert to authenticated
  with check (tenant_id = (select auth.tenant_id()));

-- No UPDATE / DELETE policies — Invariante 4.

-- ---------------------------------------------------------------------------
-- public.beschluss_anfechtung_event — append-only, same posture as BSE.
-- ---------------------------------------------------------------------------

alter table public.beschluss_anfechtung_event enable row level security;
alter table public.beschluss_anfechtung_event force row level security;
revoke all on public.beschluss_anfechtung_event from public;
grant select, insert on public.beschluss_anfechtung_event to authenticated;

create policy bae_select_own_tenant
  on public.beschluss_anfechtung_event for select to authenticated
  using (tenant_id = (select auth.tenant_id()));

create policy bae_insert_own_tenant
  on public.beschluss_anfechtung_event for insert to authenticated
  with check (tenant_id = (select auth.tenant_id()));

-- ---------------------------------------------------------------------------
-- public.audit_event — only SELECT + INSERT (§ 3.5 layer 3).
-- UPDATE/DELETE blocked by REVOKE + trigger in 0006.
-- ---------------------------------------------------------------------------

alter table public.audit_event enable row level security;
alter table public.audit_event force row level security;
revoke all on public.audit_event from public;
grant select on public.audit_event to authenticated;
-- INSERT happens via audit_writer role (see 0006); authenticated does NOT
-- get INSERT directly. We still declare an INSERT policy so audit_writer
-- (which inherits PUBLIC) is gated by tenant_id when used via PostgREST.

create policy audit_event_select_own_tenant
  on public.audit_event for select to authenticated
  using (tenant_id = (select auth.tenant_id()));

create policy audit_event_insert_own_tenant
  on public.audit_event for insert
  to audit_writer
  with check (tenant_id is not null);
-- audit_writer is internal — the trigger function sets tenant_id explicitly,
-- so a JWT-claim predicate doesn't apply here.

-- No UPDATE / DELETE policies — § 3.5 layer 3.

-- ---------------------------------------------------------------------------
-- public.agent_suggestion
-- ---------------------------------------------------------------------------

alter table public.agent_suggestion enable row level security;
alter table public.agent_suggestion force row level security;
revoke all on public.agent_suggestion from public;
grant select, insert, update on public.agent_suggestion to authenticated;
-- No DELETE — Vorschläge bleiben als historischer Anker (entweder uebernommen
-- oder verworfen).

create policy agent_suggestion_select_own_tenant
  on public.agent_suggestion for select to authenticated
  using (tenant_id = (select auth.tenant_id()));

create policy agent_suggestion_insert_own_tenant
  on public.agent_suggestion for insert to authenticated
  with check (tenant_id = (select auth.tenant_id()));

create policy agent_suggestion_update_own_tenant
  on public.agent_suggestion for update to authenticated
  using (tenant_id = (select auth.tenant_id()))
  with check (tenant_id = (select auth.tenant_id()));
