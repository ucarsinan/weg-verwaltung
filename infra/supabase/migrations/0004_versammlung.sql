-- WEG-Verwaltung migration 0004: Versammlungs-Kern — meeting, agenda_item, resolution,
-- vote, proxy, protocol.
-- See docs/01-system-design.md § 4.2 (Versammlungs-Kern) and § 4.6 (Invarianten 2, 3, 5).
-- See docs/06-workflows-and-risks.md § 6.4 (5 majority types — stolperstein #2).
--
-- Enums modeled as CHECK constraints (not Postgres ENUM types) for forward-compatibility:
-- adding a value via migration is a single statement; ENUM types require ALTER TYPE
-- which is non-transactional in some Postgres versions.

-- ---------------------------------------------------------------------------
-- public.meeting — Eigentümerversammlung
-- ---------------------------------------------------------------------------

create table if not exists public.meeting (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null default public.tenant_id(),
  weg_id                  uuid not null,
  titel                   text not null,
  modus                   text not null check (modus in (
    'praesenz', 'hybrid', 'virtuell', 'umlauf'
  )),
  status                  text not null default 'entwurf' check (status in (
    'entwurf', 'eingeladen', 'laufend', 'beendet', 'abgesagt'
  )),
  termin_von              timestamptz,
  termin_bis              timestamptz,
  einladung_versand_am    timestamptz,
  frist_einladung_ok      boolean generated always as (
    case
      when einladung_versand_am is null or termin_von is null then false
      else (termin_von - einladung_versand_am) >= interval '21 days'
    end
  ) stored,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (tenant_id, id),
  constraint meeting_weg_fk
    foreign key (tenant_id, weg_id)
    references public.weg(tenant_id, id)
    on delete restrict,
  constraint meeting_termin_valid check (
    termin_bis is null or termin_von is null or termin_bis >= termin_von
  )
);

comment on column public.meeting.frist_einladung_ok is
  'Berechnet aus § 24 Abs. 4 WEG: 3 Wochen Einladungsfrist (Invariante 6, § 4.6).';

create index if not exists meeting_weg_idx on public.meeting (tenant_id, weg_id);
create index if not exists meeting_status_idx on public.meeting (tenant_id, status);

-- ---------------------------------------------------------------------------
-- public.agenda_item — TOP
-- ---------------------------------------------------------------------------

create table if not exists public.agenda_item (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null default public.tenant_id(),
  meeting_id      uuid not null,
  position        integer not null,                -- TOP-Nr.
  titel           text not null,
  beschreibung    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, meeting_id, position),
  constraint agenda_item_meeting_fk
    foreign key (tenant_id, meeting_id)
    references public.meeting(tenant_id, id)
    on delete cascade
);

create index if not exists agenda_item_meeting_idx
  on public.agenda_item (tenant_id, meeting_id, position);

-- ---------------------------------------------------------------------------
-- public.resolution — Beschlussvorlage / gefasster Beschluss
-- ---------------------------------------------------------------------------
--
-- majority_rule: fünf gesetzliche Schwellen aus § 6.4 stolperstein #2.
-- legal_state ist die laufende Anfechtungs-Sicht (final / contested / voided).

create table if not exists public.resolution (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null default public.tenant_id(),
  meeting_id      uuid not null,
  agenda_item_id  uuid,
  text            text not null,
  mehrheits_typ   text not null check (mehrheits_typ in (
    'einfach',
    'qualifiziert',
    'doppelt_qualifiziert',
    'allstimmig',
    'vereinbarungs_aenderung'
  )),
  stimmprinzip    text not null check (stimmprinzip in (
    'kopf', 'wert', 'objekt'
  )),
  legal_state     text not null default 'pending' check (legal_state in (
    'pending', 'contested', 'final', 'voided'
  )),
  festgestellt_am timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, id),
  constraint resolution_meeting_fk
    foreign key (tenant_id, meeting_id)
    references public.meeting(tenant_id, id)
    on delete restrict,
  constraint resolution_agenda_item_fk
    foreign key (tenant_id, agenda_item_id)
    references public.agenda_item(tenant_id, id)
    on delete set null
);

comment on column public.resolution.mehrheits_typ is
  'Fünf Schwellen (§ 25 WEG, § 21 Abs. 2 Nr. 1, Vereinbarungs-Änderung). Siehe § 6.4 Stolperstein #2.';
comment on column public.resolution.stimmprinzip is
  'Stimmprinzip nach § 25 WEG: kopf | wert (MEA) | objekt (pro Wohnung).';
comment on column public.resolution.legal_state is
  'Anfechtungs-Sicht: pending → final/voided. contested = aktive Anfechtung läuft.';

create index if not exists resolution_meeting_idx
  on public.resolution (tenant_id, meeting_id);

-- ---------------------------------------------------------------------------
-- public.proxy — Vollmacht
-- ---------------------------------------------------------------------------

create table if not exists public.proxy (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null default public.tenant_id(),
  meeting_id              uuid not null,
  vollmachtgeber_ownership_id uuid not null,
  vollmachtnehmer_ownership_id uuid,             -- NULL wenn Verwalter / Beirat
  vollmachtnehmer_rolle   text check (vollmachtnehmer_rolle in (
    'eigentuemer', 'verwalter', 'beirat'
  )),
  umfang                  text not null check (umfang in ('gesamt', 'top_spezifisch')),
  tops                    uuid[],                -- agenda_item.id[] für top_spezifisch
  dokument_id             uuid,                  -- → documents (separate module)
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (tenant_id, id),
  constraint proxy_meeting_fk
    foreign key (tenant_id, meeting_id)
    references public.meeting(tenant_id, id)
    on delete cascade,
  constraint proxy_geber_fk
    foreign key (tenant_id, vollmachtgeber_ownership_id)
    references public.ownership(tenant_id, id)
    on delete restrict,
  constraint proxy_nehmer_fk
    foreign key (tenant_id, vollmachtnehmer_ownership_id)
    references public.ownership(tenant_id, id)
    on delete restrict
);

create index if not exists proxy_meeting_idx on public.proxy (tenant_id, meeting_id);

-- ---------------------------------------------------------------------------
-- public.vote — Stimmabgabe
-- ---------------------------------------------------------------------------
--
-- Invariante 5 (§ 4.6): vote.ownership_id, NIEMALS person_id oder user_id.
-- Eine Eigentumsübertragung darf historische Stimmen nicht umrouten.

create table if not exists public.vote (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null default public.tenant_id(),
  resolution_id   uuid not null,
  ownership_id    uuid not null,             -- ← Invariante 5
  wert            text not null check (wert in ('ja', 'nein', 'enthaltung')),
  quelle          text not null check (quelle in ('praesenz', 'digital', 'umlauf')),
  proxy_id        uuid,
  abgegeben_am    timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, resolution_id, ownership_id),    -- one vote per (resolution, ownership)
  constraint vote_resolution_fk
    foreign key (tenant_id, resolution_id)
    references public.resolution(tenant_id, id)
    on delete restrict,
  constraint vote_ownership_fk
    foreign key (tenant_id, ownership_id)
    references public.ownership(tenant_id, id)
    on delete restrict,
  constraint vote_proxy_fk
    foreign key (tenant_id, proxy_id)
    references public.proxy(tenant_id, id)
    on delete restrict
);

comment on table public.vote is
  'Stimmabgabe. ownership_id ist Pflicht (Invariante 5, § 4.6). Niemals person_id / user_id.';

create index if not exists vote_resolution_idx on public.vote (tenant_id, resolution_id);
create index if not exists vote_ownership_idx on public.vote (tenant_id, ownership_id);

-- ---------------------------------------------------------------------------
-- public.protocol — Protokoll
-- ---------------------------------------------------------------------------

create table if not exists public.protocol (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null default public.tenant_id(),
  meeting_id          uuid not null,
  status              text not null default 'ki_entwurf' check (status in (
    'ki_entwurf', 'verwalter_revision', 'unterzeichnet'
  )),
  text                text not null default '',                 -- Markdown
  generierungs_quelle text not null default 'ki' check (generierungs_quelle in (
    'ki', 'manuell'
  )),
  unterzeichnet_von   uuid,                                     -- auth.users.id (Verwalter)
  unterzeichnet_am    timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, meeting_id),                               -- one protocol per meeting
  constraint protocol_meeting_fk
    foreign key (tenant_id, meeting_id)
    references public.meeting(tenant_id, id)
    on delete restrict,
  constraint protocol_signature_complete check (
    (status = 'unterzeichnet') = (unterzeichnet_von is not null and unterzeichnet_am is not null)
  )
);

comment on column public.protocol.status is
  'Lifecycle: ki_entwurf → verwalter_revision → unterzeichnet. Invariante 3: Agent darf status nicht selbst auf unterzeichnet setzen (durchgesetzt via Trigger in 0007/0009 — Stub: schema-level Check).';

create index if not exists protocol_meeting_idx on public.protocol (tenant_id, meeting_id);
