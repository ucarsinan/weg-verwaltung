-- WEG-Verwaltung migration 0052: Vorgangszentrale foundation.
--
-- DB-first slice for the operational work center:
--   - tenant-scoped core tables for Vorgaenge, Inbox, Tasks, Timeline,
--     relations, participants, and explicit visibility rules
--   - conservative staff-only RLS for the first cut
--   - no hard-delete API policy
--   - append-only timeline
--   - agent-write guard: agents still write only public.agent_suggestion

set search_path = pg_catalog, public;

-- ---------------------------------------------------------------------------
-- Shared trigger helpers
-- ---------------------------------------------------------------------------

create or replace function public.tg_vorgangszentrale_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

revoke all on function public.tg_vorgangszentrale_set_updated_at() from public;
revoke execute on function public.tg_vorgangszentrale_set_updated_at() from anon, authenticated;

comment on function public.tg_vorgangszentrale_set_updated_at() is
  'BEFORE UPDATE helper for Vorgangszentrale tables. Trigger-only; not an RPC surface.';

create or replace function public.tg_vorgang_timeline_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception
    'vorgang_timeline_event is append-only. Operation % rejected; add a correcting event instead.',
    tg_op
    using errcode = 'P0001';
end;
$$;

revoke all on function public.tg_vorgang_timeline_append_only() from public;
revoke execute on function public.tg_vorgang_timeline_append_only() from anon, authenticated;

comment on function public.tg_vorgang_timeline_append_only() is
  'Block UPDATE/DELETE on Vorgang timeline events. The timeline is product chronology, not mutable state.';

create or replace function public.tg_vorgang_task_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'done' and new.completed_at is null then
    new.completed_at := pg_catalog.now();
  end if;

  if tg_op = 'UPDATE' and new.status <> 'done' and old.status = 'done' then
    new.completed_at := null;
  end if;

  return new;
end;
$$;

revoke all on function public.tg_vorgang_task_completion() from public;
revoke execute on function public.tg_vorgang_task_completion() from anon, authenticated;

comment on function public.tg_vorgang_task_completion() is
  'Keeps vorgang_task.completed_at aligned with the done lifecycle state.';

create or replace function public.tg_vorgang_relation_tenant_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_exists boolean;
begin
  case new.relation_type
    when 'weg' then
      select exists (
        select 1 from public.weg
         where tenant_id = new.tenant_id and id = new.relation_id
      ) into v_exists;
    when 'unit' then
      select exists (
        select 1 from public.unit
         where tenant_id = new.tenant_id and id = new.relation_id
      ) into v_exists;
    when 'person' then
      select exists (
        select 1 from public.person
         where tenant_id = new.tenant_id and id = new.relation_id
      ) into v_exists;
    when 'ownership' then
      select exists (
        select 1 from public.ownership
         where tenant_id = new.tenant_id and id = new.relation_id
      ) into v_exists;
    when 'document' then
      select exists (
        select 1 from public.document
         where tenant_id = new.tenant_id and id = new.relation_id
      ) into v_exists;
    when 'meeting' then
      select exists (
        select 1 from public.meeting
         where tenant_id = new.tenant_id and id = new.relation_id
      ) into v_exists;
    when 'agenda_item' then
      select exists (
        select 1 from public.agenda_item
         where tenant_id = new.tenant_id and id = new.relation_id
      ) into v_exists;
    when 'resolution' then
      select exists (
        select 1 from public.resolution
         where tenant_id = new.tenant_id and id = new.relation_id
      ) into v_exists;
    when 'beschluss_sammlung_entry' then
      select exists (
        select 1 from public.beschluss_sammlung_entry
         where tenant_id = new.tenant_id and id = new.relation_id
      ) into v_exists;
    when 'wirtschaftsplan' then
      select exists (
        select 1 from public.wirtschaftsplan
         where tenant_id = new.tenant_id and id = new.relation_id
      ) into v_exists;
    when 'sollstellung' then
      select exists (
        select 1 from public.sollstellung
         where tenant_id = new.tenant_id and id = new.relation_id
      ) into v_exists;
    when 'audit_event' then
      select exists (
        select 1 from public.audit_event
         where tenant_id = new.tenant_id and id = new.relation_id
      ) into v_exists;
    else
      v_exists := false;
  end case;

  if not v_exists then
    raise exception 'Vorgang relation target %/% is not visible in this tenant.',
      new.relation_type,
      new.relation_id
      using errcode = '23503';
  end if;

  return new;
end;
$$;

revoke all on function public.tg_vorgang_relation_tenant_guard() from public;
revoke execute on function public.tg_vorgang_relation_tenant_guard() from anon, authenticated;

comment on function public.tg_vorgang_relation_tenant_guard() is
  'Tenant-side validation for polymorphic Vorgang relations where a direct composite FK is not possible.';

create or replace function audit_writer.tg_emit_vorgang_audit_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_type text;
  v_actor_user uuid;
  v_payload jsonb;
  v_entity_id uuid;
  v_tenant uuid;
  v_action text;
begin
  v_actor_type := coalesce(
    nullif(current_setting('app.actor_type', true), ''),
    'user'
  );
  v_actor_user := auth.uid();

  if tg_op in ('INSERT', 'UPDATE') then
    v_entity_id := new.id;
    v_tenant := new.tenant_id;
  else
    v_entity_id := old.id;
    v_tenant := old.tenant_id;
  end if;

  if v_tenant is null then
    return null;
  end if;

  v_action := tg_table_name || '.' || lower(tg_op);

  if tg_table_name = 'vorgang' then
    if tg_op = 'INSERT' then
      v_action := 'vorgang.created';
    elsif tg_op = 'UPDATE' then
      if old.status is distinct from new.status then
        v_action := 'vorgang.status_changed';
      elsif old.priority is distinct from new.priority then
        v_action := 'vorgang.priority_changed';
      elsif old.assigned_to is distinct from new.assigned_to then
        v_action := 'vorgang.assigned';
      elsif old.visibility_state is distinct from new.visibility_state then
        v_action := 'vorgang.visibility_changed';
      else
        v_action := 'vorgang.updated';
      end if;
    end if;
  elsif tg_table_name = 'vorgang_task' then
    if tg_op = 'INSERT' then
      v_action := 'vorgang.task_created';
    elsif tg_op = 'UPDATE' then
      if new.status = 'done' and old.status is distinct from new.status then
        v_action := 'vorgang.task_completed';
      end if;
    end if;
  elsif tg_table_name = 'vorgang_relation' then
    if tg_op = 'INSERT' then
      if new.relation_type = 'document' then
        v_action := 'vorgang.document_linked';
      end if;
    elsif tg_op = 'DELETE' then
      if old.relation_type = 'document' then
        v_action := 'vorgang.document_unlinked';
      end if;
    end if;
  elsif tg_table_name = 'vorgang_visibility' then
    if tg_op = 'INSERT' or tg_op = 'UPDATE' then
      v_action := case
        when new.is_portal_visible then 'vorgang.portal_published'
        else 'vorgang.visibility_changed'
      end;
    end if;
  end if;

  if tg_op = 'INSERT' then
    v_payload := jsonb_build_object(
      'operation', tg_op,
      'before', null,
      'after', to_jsonb(new)
    );
  elsif tg_op = 'UPDATE' then
    v_payload := jsonb_build_object(
      'operation', tg_op,
      'before', to_jsonb(old),
      'after', to_jsonb(new)
    );
  else
    v_payload := jsonb_build_object(
      'operation', tg_op,
      'before', to_jsonb(old),
      'after', null
    );
  end if;

  insert into public.audit_event (
    tenant_id,
    actor_type,
    actor_user_id,
    entity_typ,
    entity_id,
    action,
    payload
  ) values (
    v_tenant,
    v_actor_type,
    v_actor_user,
    tg_table_name,
    v_entity_id,
    v_action,
    v_payload
  );

  return null;
end;
$$;

alter function audit_writer.tg_emit_vorgang_audit_event() owner to audit_writer;

revoke all on function audit_writer.tg_emit_vorgang_audit_event() from public;
grant execute on function audit_writer.tg_emit_vorgang_audit_event() to audit_writer;

comment on function audit_writer.tg_emit_vorgang_audit_event() is
  'Semantic audit emitter for Vorgangszentrale tables. HMAC chaining is handled by existing audit_event triggers.';

-- ---------------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------------

create table if not exists public.vorgang (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.tenant_id()
    references public.tenant(id) on delete restrict,
  weg_id uuid,
  title text not null check (length(btrim(title)) > 0),
  typ text not null check (typ in (
    'schadensmeldung',
    'belegpruefung',
    'eigentuemeranfrage',
    'beschlussumsetzung',
    'rechnungspruefung',
    'versammlungsvorbereitung',
    'dokumentenklaerung',
    'allgemein'
  )),
  status text not null default 'draft' check (status in (
    'draft',
    'open',
    'waiting_external',
    'waiting_internal',
    'review_required',
    'resolved',
    'closed',
    'cancelled'
  )),
  priority text not null default 'normal' check (priority in (
    'low',
    'normal',
    'high',
    'urgent'
  )),
  visibility_state text not null default 'internal' check (visibility_state in (
    'internal',
    'shared_beirat',
    'shared_eigentuemer',
    'shared_dienstleister',
    'public_portal'
  )),
  assigned_to uuid,
  due_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint vorgang_weg_fk
    foreign key (tenant_id, weg_id)
    references public.weg(tenant_id, id)
    on delete restrict
);

comment on table public.vorgang is
  'Operativer Arbeitscontainer der Vorgangszentrale. Tenant-globale Vorgaenge haben weg_id = NULL.';
comment on column public.vorgang.visibility_state is
  'High-level visibility state. Portal visibility still requires explicit public.vorgang_visibility rows.';

create index if not exists vorgang_tenant_status_idx
  on public.vorgang (tenant_id, status, priority, due_at);
create index if not exists vorgang_weg_idx
  on public.vorgang (tenant_id, weg_id);
create index if not exists vorgang_assigned_idx
  on public.vorgang (tenant_id, assigned_to) where assigned_to is not null;

create table if not exists public.vorgang_inbox_item (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.tenant_id()
    references public.tenant(id) on delete restrict,
  weg_id uuid,
  vorgang_id uuid,
  channel text not null check (channel in (
    'manual',
    'document_upload',
    'portal_message',
    'email_placeholder',
    'phone_note',
    'system_event'
  )),
  status text not null default 'new' check (status in (
    'new',
    'classified',
    'linked',
    'converted',
    'dismissed',
    'failed'
  )),
  subject text not null check (length(btrim(subject)) > 0),
  body_preview text check (body_preview is null or length(body_preview) <= 4000),
  source_metadata jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint vorgang_inbox_item_weg_fk
    foreign key (tenant_id, weg_id)
    references public.weg(tenant_id, id)
    on delete restrict,
  constraint vorgang_inbox_item_vorgang_fk
    foreign key (tenant_id, vorgang_id)
    references public.vorgang(tenant_id, id)
    on delete restrict,
  constraint vorgang_inbox_item_link_status_complete check (
    status not in ('linked', 'converted') or vorgang_id is not null
  )
);

comment on table public.vorgang_inbox_item is
  'Eingangselemente vor fachlicher Einordnung. body_preview is intentionally short/redacted in this first cut.';

create index if not exists vorgang_inbox_item_status_idx
  on public.vorgang_inbox_item (tenant_id, status, received_at desc);
create index if not exists vorgang_inbox_item_vorgang_idx
  on public.vorgang_inbox_item (tenant_id, vorgang_id) where vorgang_id is not null;

create table if not exists public.vorgang_task (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.tenant_id()
    references public.tenant(id) on delete restrict,
  vorgang_id uuid not null,
  title text not null check (length(btrim(title)) > 0),
  description text,
  status text not null default 'todo' check (status in (
    'todo',
    'in_progress',
    'blocked',
    'review_required',
    'done',
    'cancelled'
  )),
  assigned_to uuid,
  due_at timestamptz,
  completed_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint vorgang_task_vorgang_fk
    foreign key (tenant_id, vorgang_id)
    references public.vorgang(tenant_id, id)
    on delete restrict,
  constraint vorgang_task_done_has_completed_at check (
    status <> 'done' or completed_at is not null
  )
);

comment on table public.vorgang_task is
  'Konkrete Arbeitseinheit im Vorgangskontext. Done tasks get completed_at via trigger.';

create index if not exists vorgang_task_vorgang_idx
  on public.vorgang_task (tenant_id, vorgang_id, status, due_at);
create index if not exists vorgang_task_assigned_idx
  on public.vorgang_task (tenant_id, assigned_to) where assigned_to is not null;

create table if not exists public.vorgang_timeline_event (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.tenant_id()
    references public.tenant(id) on delete restrict,
  vorgang_id uuid not null,
  event_type text not null check (length(btrim(event_type)) > 0),
  actor_type text not null default 'user' check (actor_type in ('user', 'agent', 'system')),
  actor_user_id uuid default auth.uid(),
  visibility text not null default 'internal' check (visibility in (
    'internal',
    'beirat',
    'eigentuemer',
    'dienstleister'
  )),
  summary text not null check (length(btrim(summary)) > 0),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint vorgang_timeline_event_vorgang_fk
    foreign key (tenant_id, vorgang_id)
    references public.vorgang(tenant_id, id)
    on delete restrict
);

comment on table public.vorgang_timeline_event is
  'Append-only nutzernahe Chronik pro Vorgang. Revisionsfeste Wahrheit bleibt public.audit_event.';

create index if not exists vorgang_timeline_event_vorgang_idx
  on public.vorgang_timeline_event (tenant_id, vorgang_id, created_at desc);

create table if not exists public.vorgang_relation (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.tenant_id()
    references public.tenant(id) on delete restrict,
  vorgang_id uuid not null,
  relation_type text not null check (relation_type in (
    'weg',
    'unit',
    'person',
    'ownership',
    'document',
    'meeting',
    'agenda_item',
    'resolution',
    'beschluss_sammlung_entry',
    'wirtschaftsplan',
    'sollstellung',
    'audit_event'
  )),
  relation_id uuid not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, vorgang_id, relation_type, relation_id),
  constraint vorgang_relation_vorgang_fk
    foreign key (tenant_id, vorgang_id)
    references public.vorgang(tenant_id, id)
    on delete restrict
);

comment on table public.vorgang_relation is
  'Polymorphe Links von Vorgaengen zu fuehrenden Domainobjekten. Tenant target existence is trigger-validated.';

create index if not exists vorgang_relation_vorgang_idx
  on public.vorgang_relation (tenant_id, vorgang_id, relation_type);

create table if not exists public.vorgang_participant (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.tenant_id()
    references public.tenant(id) on delete restrict,
  vorgang_id uuid not null,
  role text not null check (role in (
    'verwalter',
    'buchhaltung',
    'beirat',
    'eigentuemer',
    'dienstleister',
    'auditor'
  )),
  person_id uuid,
  user_id uuid,
  display_name text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint vorgang_participant_vorgang_fk
    foreign key (tenant_id, vorgang_id)
    references public.vorgang(tenant_id, id)
    on delete restrict,
  constraint vorgang_participant_person_fk
    foreign key (tenant_id, person_id)
    references public.person(tenant_id, id)
    on delete restrict,
  constraint vorgang_participant_identity_present check (
    person_id is not null or user_id is not null or nullif(btrim(display_name), '') is not null
  )
);

comment on table public.vorgang_participant is
  'Beteiligte im Vorgang. Teilnahme erzeugt keine Sichtbarkeit; public.vorgang_visibility steuert Freigaben explizit.';

create index if not exists vorgang_participant_vorgang_idx
  on public.vorgang_participant (tenant_id, vorgang_id, role);

create table if not exists public.vorgang_visibility (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.tenant_id()
    references public.tenant(id) on delete restrict,
  vorgang_id uuid not null,
  scope text not null default 'internal' check (scope in (
    'internal',
    'beirat',
    'eigentuemer',
    'dienstleister'
  )),
  is_portal_visible boolean not null default false,
  target_person_id uuid,
  target_user_id uuid,
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint vorgang_visibility_vorgang_fk
    foreign key (tenant_id, vorgang_id)
    references public.vorgang(tenant_id, id)
    on delete restrict,
  constraint vorgang_visibility_person_fk
    foreign key (tenant_id, target_person_id)
    references public.person(tenant_id, id)
    on delete restrict
);

comment on table public.vorgang_visibility is
  'Explizite Sichtbarkeitsregeln. Portal-Sichtbarkeit defaultet auf false und wird nicht aus Teilnehmerrollen geerbt.';

create index if not exists vorgang_visibility_vorgang_idx
  on public.vorgang_visibility (tenant_id, vorgang_id, scope);
create index if not exists vorgang_visibility_portal_idx
  on public.vorgang_visibility (tenant_id, is_portal_visible, scope)
  where is_portal_visible;

-- ---------------------------------------------------------------------------
-- Lifecycle triggers
-- ---------------------------------------------------------------------------

drop trigger if exists vorgang_set_updated_at on public.vorgang;
create trigger vorgang_set_updated_at
  before update on public.vorgang
  for each row execute function public.tg_vorgangszentrale_set_updated_at();

drop trigger if exists vorgang_inbox_item_set_updated_at on public.vorgang_inbox_item;
create trigger vorgang_inbox_item_set_updated_at
  before update on public.vorgang_inbox_item
  for each row execute function public.tg_vorgangszentrale_set_updated_at();

drop trigger if exists vorgang_task_set_updated_at on public.vorgang_task;
create trigger vorgang_task_set_updated_at
  before update on public.vorgang_task
  for each row execute function public.tg_vorgangszentrale_set_updated_at();

drop trigger if exists vorgang_task_completion on public.vorgang_task;
create trigger vorgang_task_completion
  before insert or update on public.vorgang_task
  for each row execute function public.tg_vorgang_task_completion();

drop trigger if exists vorgang_timeline_event_no_update on public.vorgang_timeline_event;
create trigger vorgang_timeline_event_no_update
  before update on public.vorgang_timeline_event
  for each row execute function public.tg_vorgang_timeline_append_only();

drop trigger if exists vorgang_timeline_event_no_delete on public.vorgang_timeline_event;
create trigger vorgang_timeline_event_no_delete
  before delete on public.vorgang_timeline_event
  for each row execute function public.tg_vorgang_timeline_append_only();

drop trigger if exists vorgang_relation_tenant_guard on public.vorgang_relation;
create trigger vorgang_relation_tenant_guard
  before insert or update on public.vorgang_relation
  for each row execute function public.tg_vorgang_relation_tenant_guard();

drop trigger if exists vorgang_participant_set_updated_at on public.vorgang_participant;
create trigger vorgang_participant_set_updated_at
  before update on public.vorgang_participant
  for each row execute function public.tg_vorgangszentrale_set_updated_at();

drop trigger if exists vorgang_visibility_set_updated_at on public.vorgang_visibility;
create trigger vorgang_visibility_set_updated_at
  before update on public.vorgang_visibility
  for each row execute function public.tg_vorgangszentrale_set_updated_at();

-- Agent actor guard. A row may describe actor_type = 'agent' for chronology,
-- but a DB session marked app.actor_type = 'agent' cannot write these tables.

drop trigger if exists vorgang_no_agent_write on public.vorgang;
create trigger vorgang_no_agent_write
  before insert or update or delete on public.vorgang
  for each row execute function audit_writer.assert_not_agent_write();

drop trigger if exists vorgang_inbox_item_no_agent_write on public.vorgang_inbox_item;
create trigger vorgang_inbox_item_no_agent_write
  before insert or update or delete on public.vorgang_inbox_item
  for each row execute function audit_writer.assert_not_agent_write();

drop trigger if exists vorgang_task_no_agent_write on public.vorgang_task;
create trigger vorgang_task_no_agent_write
  before insert or update or delete on public.vorgang_task
  for each row execute function audit_writer.assert_not_agent_write();

drop trigger if exists vorgang_timeline_event_no_agent_write on public.vorgang_timeline_event;
create trigger vorgang_timeline_event_no_agent_write
  before insert or update or delete on public.vorgang_timeline_event
  for each row execute function audit_writer.assert_not_agent_write();

drop trigger if exists vorgang_relation_no_agent_write on public.vorgang_relation;
create trigger vorgang_relation_no_agent_write
  before insert or update or delete on public.vorgang_relation
  for each row execute function audit_writer.assert_not_agent_write();

drop trigger if exists vorgang_participant_no_agent_write on public.vorgang_participant;
create trigger vorgang_participant_no_agent_write
  before insert or update or delete on public.vorgang_participant
  for each row execute function audit_writer.assert_not_agent_write();

drop trigger if exists vorgang_visibility_no_agent_write on public.vorgang_visibility;
create trigger vorgang_visibility_no_agent_write
  before insert or update or delete on public.vorgang_visibility
  for each row execute function audit_writer.assert_not_agent_write();

-- Audit emitters.

drop trigger if exists vorgang_audit_emit on public.vorgang;
create trigger vorgang_audit_emit
  after insert or update or delete on public.vorgang
  for each row execute function audit_writer.tg_emit_vorgang_audit_event();

drop trigger if exists vorgang_inbox_item_audit_emit on public.vorgang_inbox_item;
create trigger vorgang_inbox_item_audit_emit
  after insert or update or delete on public.vorgang_inbox_item
  for each row execute function audit_writer.tg_emit_vorgang_audit_event();

drop trigger if exists vorgang_task_audit_emit on public.vorgang_task;
create trigger vorgang_task_audit_emit
  after insert or update or delete on public.vorgang_task
  for each row execute function audit_writer.tg_emit_vorgang_audit_event();

drop trigger if exists vorgang_timeline_event_audit_emit on public.vorgang_timeline_event;
create trigger vorgang_timeline_event_audit_emit
  after insert or update or delete on public.vorgang_timeline_event
  for each row execute function audit_writer.tg_emit_vorgang_audit_event();

drop trigger if exists vorgang_relation_audit_emit on public.vorgang_relation;
create trigger vorgang_relation_audit_emit
  after insert or update or delete on public.vorgang_relation
  for each row execute function audit_writer.tg_emit_vorgang_audit_event();

drop trigger if exists vorgang_participant_audit_emit on public.vorgang_participant;
create trigger vorgang_participant_audit_emit
  after insert or update or delete on public.vorgang_participant
  for each row execute function audit_writer.tg_emit_vorgang_audit_event();

drop trigger if exists vorgang_visibility_audit_emit on public.vorgang_visibility;
create trigger vorgang_visibility_audit_emit
  after insert or update or delete on public.vorgang_visibility
  for each row execute function audit_writer.tg_emit_vorgang_audit_event();

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------

alter table public.vorgang enable row level security;
alter table public.vorgang force row level security;
alter table public.vorgang_inbox_item enable row level security;
alter table public.vorgang_inbox_item force row level security;
alter table public.vorgang_task enable row level security;
alter table public.vorgang_task force row level security;
alter table public.vorgang_timeline_event enable row level security;
alter table public.vorgang_timeline_event force row level security;
alter table public.vorgang_relation enable row level security;
alter table public.vorgang_relation force row level security;
alter table public.vorgang_participant enable row level security;
alter table public.vorgang_participant force row level security;
alter table public.vorgang_visibility enable row level security;
alter table public.vorgang_visibility force row level security;

revoke all on public.vorgang from public;
revoke all on public.vorgang_inbox_item from public;
revoke all on public.vorgang_task from public;
revoke all on public.vorgang_timeline_event from public;
revoke all on public.vorgang_relation from public;
revoke all on public.vorgang_participant from public;
revoke all on public.vorgang_visibility from public;

grant select, insert, update on public.vorgang to authenticated;
grant select, insert, update on public.vorgang_inbox_item to authenticated;
grant select, insert, update on public.vorgang_task to authenticated;
grant select, insert on public.vorgang_timeline_event to authenticated;
grant select, insert, update on public.vorgang_relation to authenticated;
grant select, insert, update on public.vorgang_participant to authenticated;
grant select, insert, update on public.vorgang_visibility to authenticated;

-- Staff role set for the first DB slice. External roles intentionally get no
-- read policy yet: portal ownership/person matching is not wired end-to-end.

drop policy if exists vorgang_select_staff on public.vorgang;
create policy vorgang_select_staff
  on public.vorgang for select to authenticated
  using (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
      or (select public.has_role('buchhaltung'))
      or (select public.has_role('auditor_readonly'))
    )
  );

drop policy if exists vorgang_insert_staff on public.vorgang;
create policy vorgang_insert_staff
  on public.vorgang for insert to authenticated
  with check (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
      or (select public.has_role('buchhaltung'))
    )
  );

drop policy if exists vorgang_update_staff on public.vorgang;
create policy vorgang_update_staff
  on public.vorgang for update to authenticated
  using (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
      or (select public.has_role('buchhaltung'))
    )
  )
  with check (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
      or (select public.has_role('buchhaltung'))
    )
  );

drop policy if exists vorgang_inbox_item_select_staff on public.vorgang_inbox_item;
create policy vorgang_inbox_item_select_staff
  on public.vorgang_inbox_item for select to authenticated
  using (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
      or (select public.has_role('buchhaltung'))
      or (select public.has_role('auditor_readonly'))
    )
  );

drop policy if exists vorgang_inbox_item_insert_staff on public.vorgang_inbox_item;
create policy vorgang_inbox_item_insert_staff
  on public.vorgang_inbox_item for insert to authenticated
  with check (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
      or (select public.has_role('buchhaltung'))
    )
  );

drop policy if exists vorgang_inbox_item_update_staff on public.vorgang_inbox_item;
create policy vorgang_inbox_item_update_staff
  on public.vorgang_inbox_item for update to authenticated
  using (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
      or (select public.has_role('buchhaltung'))
    )
  )
  with check (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
      or (select public.has_role('buchhaltung'))
    )
  );

drop policy if exists vorgang_task_select_staff on public.vorgang_task;
create policy vorgang_task_select_staff
  on public.vorgang_task for select to authenticated
  using (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
      or (select public.has_role('buchhaltung'))
      or (select public.has_role('auditor_readonly'))
    )
  );

drop policy if exists vorgang_task_insert_staff on public.vorgang_task;
create policy vorgang_task_insert_staff
  on public.vorgang_task for insert to authenticated
  with check (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
      or (select public.has_role('buchhaltung'))
    )
  );

drop policy if exists vorgang_task_update_staff on public.vorgang_task;
create policy vorgang_task_update_staff
  on public.vorgang_task for update to authenticated
  using (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
      or (select public.has_role('buchhaltung'))
    )
  )
  with check (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
      or (select public.has_role('buchhaltung'))
    )
  );

drop policy if exists vorgang_timeline_event_select_staff on public.vorgang_timeline_event;
create policy vorgang_timeline_event_select_staff
  on public.vorgang_timeline_event for select to authenticated
  using (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
      or (select public.has_role('buchhaltung'))
      or (select public.has_role('auditor_readonly'))
    )
  );

drop policy if exists vorgang_timeline_event_insert_staff on public.vorgang_timeline_event;
create policy vorgang_timeline_event_insert_staff
  on public.vorgang_timeline_event for insert to authenticated
  with check (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
      or (select public.has_role('buchhaltung'))
    )
  );

drop policy if exists vorgang_relation_select_staff on public.vorgang_relation;
create policy vorgang_relation_select_staff
  on public.vorgang_relation for select to authenticated
  using (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
      or (select public.has_role('buchhaltung'))
      or (select public.has_role('auditor_readonly'))
    )
  );

drop policy if exists vorgang_relation_insert_staff on public.vorgang_relation;
create policy vorgang_relation_insert_staff
  on public.vorgang_relation for insert to authenticated
  with check (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
      or (select public.has_role('buchhaltung'))
    )
  );

drop policy if exists vorgang_relation_update_staff on public.vorgang_relation;
create policy vorgang_relation_update_staff
  on public.vorgang_relation for update to authenticated
  using (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
      or (select public.has_role('buchhaltung'))
    )
  )
  with check (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
      or (select public.has_role('buchhaltung'))
    )
  );

drop policy if exists vorgang_participant_select_staff on public.vorgang_participant;
create policy vorgang_participant_select_staff
  on public.vorgang_participant for select to authenticated
  using (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
      or (select public.has_role('buchhaltung'))
      or (select public.has_role('auditor_readonly'))
    )
  );

drop policy if exists vorgang_participant_insert_staff on public.vorgang_participant;
create policy vorgang_participant_insert_staff
  on public.vorgang_participant for insert to authenticated
  with check (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
      or (select public.has_role('buchhaltung'))
    )
  );

drop policy if exists vorgang_participant_update_staff on public.vorgang_participant;
create policy vorgang_participant_update_staff
  on public.vorgang_participant for update to authenticated
  using (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
      or (select public.has_role('buchhaltung'))
    )
  )
  with check (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
      or (select public.has_role('buchhaltung'))
    )
  );

drop policy if exists vorgang_visibility_select_staff on public.vorgang_visibility;
create policy vorgang_visibility_select_staff
  on public.vorgang_visibility for select to authenticated
  using (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
      or (select public.has_role('buchhaltung'))
      or (select public.has_role('auditor_readonly'))
    )
  );

drop policy if exists vorgang_visibility_insert_staff on public.vorgang_visibility;
create policy vorgang_visibility_insert_staff
  on public.vorgang_visibility for insert to authenticated
  with check (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
      or (select public.has_role('buchhaltung'))
    )
  );

drop policy if exists vorgang_visibility_update_staff on public.vorgang_visibility;
create policy vorgang_visibility_update_staff
  on public.vorgang_visibility for update to authenticated
  using (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
      or (select public.has_role('buchhaltung'))
    )
  )
  with check (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
      or (select public.has_role('buchhaltung'))
    )
  );
