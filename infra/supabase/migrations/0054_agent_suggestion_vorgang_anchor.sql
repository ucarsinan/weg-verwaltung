-- WEG-Verwaltung migration 0054: anchor agent suggestions to Vorgaenge.
--
-- Keeps public.agent_suggestion as the only agent-write surface while allowing
-- suggestions to be attached directly to the operational Vorgang work center.

set search_path = pg_catalog, public;

alter table public.agent_suggestion
  add column if not exists vorgang_id uuid;

alter table public.agent_suggestion
  add constraint agent_suggestion_vorgang_fk
  foreign key (tenant_id, vorgang_id)
  references public.vorgang(tenant_id, id)
  on delete restrict;

comment on column public.agent_suggestion.vorgang_id is
  'Optional Vorgangszentrale anchor. Tenant-scoped composite FK prevents cross-tenant suggestions.';

create index if not exists agent_suggestion_vorgang_status_idx
  on public.agent_suggestion (tenant_id, vorgang_id, status, created_at desc)
  where vorgang_id is not null;
