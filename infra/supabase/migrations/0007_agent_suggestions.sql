-- WEG-Verwaltung migration 0007: agent_suggestion — KI-Vorschläge, getrennt von echten Beschlüssen.
-- See docs/01-system-design.md § 4.4 (AgentSuggestion) and § 4.6 Invariante 3
-- ("KI = nur Vorschläge").
--
-- Invariant: Agent darf NIEMALS direkt in vote / beschluss_sammlung_entry /
-- protocol.unterzeichnet schreiben. Stattdessen schreibt der Agent hierher,
-- und ein Verwalter muss aktiv übernehmen (status: vorschlag → uebernommen).

-- ---------------------------------------------------------------------------
-- public.agent_suggestion
-- ---------------------------------------------------------------------------

create table if not exists public.agent_suggestion (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null default auth.tenant_id(),

  -- Anchor — different agent use cases anchor on different parents.
  -- Exactly one of (meeting_id, weg_id, resolution_id) should be non-null in practice,
  -- but enforcing that here would conflict with future anchors — kept soft.
  meeting_id          uuid,
  weg_id              uuid,
  resolution_id       uuid,

  -- agent (LangGraph run) or system (pg_cron frist-scan)
  actor_type          text not null check (actor_type in ('agent', 'system')),

  -- What the suggestion is about — free-form by use case, e.g. "agenda_item",
  -- "frist_warning", "protokoll_draft", "bestimmtheits_check".
  vorschlag_typ       text not null,

  -- The payload — JSON blob shaped by vorschlag_typ.
  payload             jsonb not null,

  -- Provenance — LangGraph thread + Langfuse trace for audit + replay.
  langgraph_thread_id text,
  langfuse_trace_id   text,

  -- Lifecycle (§ 4.4).
  status              text not null default 'vorschlag' check (status in (
    'vorschlag', 'uebernommen', 'verworfen'
  )),
  entschieden_von     uuid,                    -- auth.users.id who übernahm/verwarf
  entschieden_am      timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (tenant_id, id),
  constraint as_meeting_fk
    foreign key (tenant_id, meeting_id)
    references public.meeting(tenant_id, id)
    on delete cascade,
  constraint as_weg_fk
    foreign key (tenant_id, weg_id)
    references public.weg(tenant_id, id)
    on delete cascade,
  constraint as_resolution_fk
    foreign key (tenant_id, resolution_id)
    references public.resolution(tenant_id, id)
    on delete cascade,
  constraint agent_suggestion_decision_complete check (
    (status = 'vorschlag') = (entschieden_von is null and entschieden_am is null)
  )
);

comment on table public.agent_suggestion is
  'KI-Vorschläge. Niemals Auto-Apply — Verwalter muss aktiv übernehmen (§ 4.4, Invariante 3).';
comment on column public.agent_suggestion.actor_type is
  'agent = LangGraph-Run; system = pg_cron-triggered (z.B. Frist-Scan). Andere Werte verboten.';

create index if not exists agent_suggestion_meeting_idx
  on public.agent_suggestion (tenant_id, meeting_id);
create index if not exists agent_suggestion_weg_idx
  on public.agent_suggestion (tenant_id, weg_id);
create index if not exists agent_suggestion_status_idx
  on public.agent_suggestion (tenant_id, status, created_at desc);
