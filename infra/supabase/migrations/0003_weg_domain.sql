-- WEG-Verwaltung migration 0003: WEG-Stammdaten — weg, unit, person, ownership.
-- See docs/01-system-design.md § 4.1 (Hierarchie) and § 4.6 (Invarianten 1, 5).
--
-- Every table:
--   - id uuid pk default gen_random_uuid()
--   - tenant_id with default from JWT (§ 3.4 item 4)
--   - composite FK (tenant_id, parent_id) → parent(tenant_id, id) — § 3.4 L3
--   - created_at / updated_at timestamps
--
-- RLS is enabled in 0008. Triggers / indices are kept minimal to keep the
-- baseline reviewable.

-- ---------------------------------------------------------------------------
-- public.weg — Wohnungseigentümergemeinschaft
-- ---------------------------------------------------------------------------

create table if not exists public.weg (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null default public.tenant_id()
                  references public.tenant(id) on delete restrict,
  name            text not null,
  adresse         text,
  amtsgericht     text,
  grundbuch_blatt text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, id)   -- composite-FK target for child tables (§ 3.4 L3).
);

comment on table public.weg is
  'Eigentümergemeinschaft. Aggregate root for unit, ownership, meetings, beschluss-sammlung.';

create index if not exists weg_tenant_id_idx on public.weg (tenant_id);

-- ---------------------------------------------------------------------------
-- public.unit — Wohnung / Sondereigentum
-- ---------------------------------------------------------------------------

create table if not exists public.unit (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null default public.tenant_id(),
  weg_id          uuid not null,
  bezeichnung     text not null,           -- "Whg. 12, 3. OG links"
  mea_zaehler     bigint not null,         -- Miteigentumsanteil als Bruch
  mea_nenner      bigint not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, id),
  constraint unit_mea_positive check (mea_zaehler > 0 and mea_nenner > 0),
  constraint unit_weg_fk
    foreign key (tenant_id, weg_id)
    references public.weg(tenant_id, id)
    on delete restrict
);

comment on column public.unit.mea_zaehler is
  'Miteigentumsanteil als Bruch (zaehler/nenner). Summe aller units einer WEG = 1000/1000 (oder 1/1).';

create index if not exists unit_weg_idx on public.unit (tenant_id, weg_id);

-- ---------------------------------------------------------------------------
-- public.person — natürliche Person (kein Login!)
-- ---------------------------------------------------------------------------

create table if not exists public.person (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null default public.tenant_id(),
  vorname         text not null,
  nachname        text not null,
  anschrift       text,
  email           text,
  telefon         text,
  user_id         uuid,    -- optional link to auth.users; nullable on purpose (§ 4.1).
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, id)
);

comment on table public.person is
  'Natürliche Person. Kein Login. user_id is optional — many Eigentümer have no app account.';

create index if not exists person_tenant_id_idx on public.person (tenant_id);
create index if not exists person_user_id_idx on public.person (user_id);

-- ---------------------------------------------------------------------------
-- public.ownership — zeitgebundene Beziehung Person ↔ Unit
-- ---------------------------------------------------------------------------
--
-- Invariante 5 (§ 4.6): Vote.ownership_id, niemals person_id / user_id.
-- Eigentumswechsel = aktuelle ownership-Zeile mit `bis` schließen + neue
-- Zeile anlegen. Historische Stimmen bleiben der damaligen ownership zugeordnet.

create table if not exists public.ownership (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null default public.tenant_id(),
  weg_id          uuid not null,
  unit_id         uuid not null,
  person_id       uuid not null,
  von             date not null,
  bis             date,                            -- NULL = currently active.
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, id),
  constraint ownership_weg_fk
    foreign key (tenant_id, weg_id)
    references public.weg(tenant_id, id)
    on delete restrict,
  constraint ownership_unit_fk
    foreign key (tenant_id, unit_id)
    references public.unit(tenant_id, id)
    on delete restrict,
  constraint ownership_person_fk
    foreign key (tenant_id, person_id)
    references public.person(tenant_id, id)
    on delete restrict,
  constraint ownership_period_valid check (bis is null or bis >= von)
);

comment on table public.ownership is
  'Zeitgebundene Eigentümerschaft. Vote referenziert ownership_id (Invariante 5, § 4.6).';

create index if not exists ownership_unit_idx on public.ownership (tenant_id, unit_id);
create index if not exists ownership_person_idx on public.ownership (tenant_id, person_id);
-- Partial index for "currently active" lookups.
create index if not exists ownership_active_idx
  on public.ownership (tenant_id, unit_id) where bis is null;
