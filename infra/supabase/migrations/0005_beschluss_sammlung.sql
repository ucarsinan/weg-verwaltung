-- WEG-Verwaltung migration 0005: Beschluss-Sammlung (§ 24 Abs. 7 WEG).
-- See docs/01-system-design.md § 4.3 and § 4.6 Invariante 4 (append-only).
-- See docs/03-security-model.md § 3.5 layer 1+2 pattern (REVOKE + RAISE EXCEPTION trigger).
--
-- Anfechtungen werden NICHT durch UPDATE auf der Beschluss-Sammlung modelliert,
-- sondern als separate Event-Kette in beschluss_anfechtung — der Anfechtungsstatus
-- ist eine Projektion über diese Event-Kette (Section 1 § 4.5 Aggregate-Tabelle).

-- ---------------------------------------------------------------------------
-- public.beschluss_sammlung_entry — append-only, lfd_nr pro WEG
-- ---------------------------------------------------------------------------

create table if not exists public.beschluss_sammlung_entry (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null default auth.tenant_id(),
  weg_id              uuid not null,
  lfd_nr              bigint generated always as identity,
  beschluss_text      text not null,
  meeting_id          uuid,                                  -- Quelle (kann bei Umlauf NULL sein wenn pre-app)
  resolution_id       uuid,
  datum               date not null,
  typ                 text not null check (typ in (
    'positiv_beschluss', 'negativ_beschluss', 'umlaufbeschluss'
  )),
  anfechtungsstatus   text not null default 'keine' check (anfechtungsstatus in (
    'keine', 'angefochten', 'unwirksam_erklaert'
  )),
  erstellt_durch      uuid not null,                          -- auth.users.id — niemals Agent
  created_at          timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, weg_id, lfd_nr),                         -- fortlaufend pro WEG
  constraint bse_weg_fk
    foreign key (tenant_id, weg_id)
    references public.weg(tenant_id, id)
    on delete restrict,
  constraint bse_meeting_fk
    foreign key (tenant_id, meeting_id)
    references public.meeting(tenant_id, id)
    on delete restrict,
  constraint bse_resolution_fk
    foreign key (tenant_id, resolution_id)
    references public.resolution(tenant_id, id)
    on delete restrict
);

comment on table public.beschluss_sammlung_entry is
  'Beschluss-Sammlung gem. § 24 Abs. 7 WEG. Append-only, fortlaufende lfd_nr pro WEG.';

create index if not exists bse_weg_idx
  on public.beschluss_sammlung_entry (tenant_id, weg_id, lfd_nr);

-- ---------------------------------------------------------------------------
-- Anfechtungs-Event-Kette (separate, ebenfalls append-only)
-- ---------------------------------------------------------------------------

create table if not exists public.beschluss_anfechtung_event (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null default auth.tenant_id(),
  bse_id              uuid not null,
  event_typ           text not null check (event_typ in (
    'angefochten',         -- Klage erhoben
    'zurueckgenommen',     -- Klage zurückgenommen
    'unwirksam_erklaert',  -- Rechtskräftiges Urteil
    'bestaetigt'           -- Klage abgewiesen
  )),
  aktenzeichen        text,
  datum               date not null,
  bemerkung           text,
  erfasst_durch       uuid not null,         -- auth.users.id
  created_at          timestamptz not null default now(),
  unique (tenant_id, id),
  constraint bae_bse_fk
    foreign key (tenant_id, bse_id)
    references public.beschluss_sammlung_entry(tenant_id, id)
    on delete restrict
);

create index if not exists bae_bse_idx
  on public.beschluss_anfechtung_event (tenant_id, bse_id, datum);

-- ---------------------------------------------------------------------------
-- § 3.5 Layer 1 — REVOKE write privileges from PUBLIC
-- ---------------------------------------------------------------------------

revoke update, delete, truncate on public.beschluss_sammlung_entry from public;
revoke update, delete, truncate on public.beschluss_anfechtung_event from public;

-- ---------------------------------------------------------------------------
-- § 3.5 Layer 2 — RAISE EXCEPTION trigger (fires even for service_role)
-- ---------------------------------------------------------------------------

create or replace function public.tg_beschluss_sammlung_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'beschluss_sammlung_entry is append-only (§ 24 Abs. 7 WEG, Invariante 4). Operation % rejected.',
    tg_op
    using errcode = '42501';   -- insufficient_privilege
end;
$$;

create trigger beschluss_sammlung_entry_no_update_delete
  before update or delete or truncate on public.beschluss_sammlung_entry
  for each statement
  execute function public.tg_beschluss_sammlung_append_only();

create trigger beschluss_anfechtung_event_no_update_delete
  before update or delete or truncate on public.beschluss_anfechtung_event
  for each statement
  execute function public.tg_beschluss_sammlung_append_only();

comment on function public.tg_beschluss_sammlung_append_only() is
  'Append-only enforcement for beschluss-sammlung entries + anfechtungs-events (§ 3.5 layer 2).';
