-- WEG-Verwaltung migration 0075: Sichtbarkeit je WEG als eigene Zuordnung.
--
-- Symptom:
--   PR #37 hat die Rolle `eigentuemer` aus dem Dashboard ausgesperrt. Das war
--   die Oberflaeche, nicht die Grenze: (dashboard)/layout.tsx schuetzt die
--   gerenderten Seiten, PostgREST unter /rest/v1/* ist davon unberuehrt. Ein
--   Eigentuemer mit gueltigem Token liest heute weiterhin jede WEG, jede
--   Einheit und jede Eigentuemerschaft des Mandanten ueber die API.
--
-- Ursache:
--   Auf den Kern-Fachtabellen filtert keine Lesepolicy nach Rolle, nur nach
--   Mandant. public.has_role() wird zwar in elf SELECT-Policies ausgewertet
--   (Vorgangszentrale 0052, Audit-Konsole 0050/0035, Einladungen 0057,
--   tenant_member 0008) — auf weg, unit, ownership und der Beschluss-Sammlung
--   aber nicht.
--
-- Zweck:
--   Eine eigene Zuordnung Nutzer -> WEG, und Lesepolicies, die sie fuer die
--   Rolle `eigentuemer` erzwingen.
--
-- Warum NICHT ueber die Eigentuemerkette (person.user_id -> ownership -> unit):
--   Die Kette traegt keine Sicherheitsgrenze. Vier Befunde, alle am 2026-09-29
--   erhoben:
--     1. person.user_id hat kein UNIQUE und keinen Fremdschluessel (0003:73);
--        der Index 0003:83 ist nicht unique. RLS naehme die Vereinigung aller
--        daran haengenden Zeilen. Der Anwendungscode lebt bereits mit
--        "erster gewinnt" (modules/settings/data.ts:80).
--     2. Der Wert stammt aus einem freien Textfeld (person-form.tsx:187), nur
--        per UUID-Regex geprueft. Jeder im Dashboard kann eine fremde UUID
--        eintragen.
--     3. create_self_managed_weg_trial (0057:283-355) legt weder person noch
--        unit noch ownership an — ein frisch registrierter Selbstverwalter
--        haette ueber die Kette keine Sichtbarkeit.
--     4. Miteigentuemer haengen an ownership_co_owner (0033:38), nicht an
--        ownership.person_id. Bei einem Ehepaar saehe genau einer von beiden.
--
--   Eigentum ist eine Fachtatsache, Sichtbarkeit eine Zugriffstatsache. Sie zu
--   vermischen erzeugt alle vier Probleme. 0052:754 hat dieses Vorhaben schon
--   einmal begonnen und bewusst abgebrochen ("portal ownership/person matching
--   is not wired end-to-end"); diese Migration umgeht das Matching, statt es zu
--   bauen.
--
-- Betroffene Tabellen:
--   NEU public.weg_zugang. Ersetzte SELECT-Policies auf public.weg,
--   public.unit, public.ownership, public.beschluss_sammlung_entry (alle aus
--   0008). public.feststellen_resolution wird ersetzt — siehe unten.
--
-- RLS-Auswirkung:
--   Sperrlisten-Form, wie der Layout-Riegel aus #37: eingeschraenkt wird genau
--   die Rolle `eigentuemer`. Jede andere oder fehlende Rolle kommt durch. Eine
--   Positivliste wuerde bei nicht registriertem Access-Token-Hook jeden
--   aussperren — derselbe Fehler, den die Claims-Pruefung der Weboberflaeche
--   seit #33 vermeidet.
--
--   weg_zugang startet leer. Ein Eigentuemer sieht damit nichts — der sichere
--   Vorgabewert und derselbe Stand wie nach #37, nur jetzt auch ueber die API.
--
-- Warum feststellen_resolution mitgeht:
--   Sie ist SECURITY INVOKER (0049:346) und zaehlt ownership-Zeilen fuer die
--   Mehrheit (0049:464-471) sowie MEA aus unit (0049:477-493). Mit gefilterten
--   Tabellen faellt v_total_eligible auf den eigenen Anteil und der Beschluss
--   wuerde still falsch festgestellt. Der Koerper ist gegenueber 0049
--   unveraendert bis auf EINEN eingefuegten Rollen-Riegel.
--
-- Teststrategie:
--   infra/supabase/tests/0075_weg_zugang.sql — der erste Vertrag des Projekts
--   mit einer `eigentuemer`-Fixture. Prueft beide Richtungen: der Eigentuemer
--   sieht seine WEG und die Nachbar-WEG nicht, UND der tenant_admin desselben
--   Mandanten sieht weiterhin beide.
--
-- Rollback / Forward-Fix:
--   Rueckwaerts durch Wiederherstellen der vier Policies aus 0008 und des
--   Funktionskoerpers aus 0049. Vorwaerts-Fix bevorzugt.
--
-- Nicht enthalten:
--   - public.person. Die Datenschutzlage verlangt dort eine Einschraenkung auf
--     SPALTENebene: Name und Anschrift duerfen Miteigentuemer sehen, E-Mail und
--     Telefon sind freiwillige Angaben und brauchen Zustimmung. RLS arbeitet
--     zeilenweise; Spalten-Grants wirken pro Datenbankrolle, und alle
--     App-Nutzer sind `authenticated`. Das braucht eine eigene Konstruktion.
--   - Die Finanztabellen. tests/0056:106-172 ist eine geschlossene Welt aus
--     genau sechzehn Policies; eine zusaetzliche dort macht den Vertrag rot.
--   - Eine Oberflaeche zum Vergeben von Zugang. Sie kommt mit der
--     Eigentuemersicht, denn erst dann gibt es etwas zu sehen.

-- ---------------------------------------------------------------------------
-- 1. Die Zuordnung
-- ---------------------------------------------------------------------------

create table if not exists public.weg_zugang (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default public.tenant_id()
              references public.tenant(id) on delete restrict,
  user_id     uuid not null,
  weg_id      uuid not null,
  erteilt_am  timestamptz not null default now(),
  erteilt_von uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, user_id, weg_id),
  -- Der Kern: Sichtbarkeit laesst sich nur an Mitglieder des Mandanten
  -- vergeben. tenant_member traegt dafuer bereits unique (tenant_id, user_id).
  constraint weg_zugang_member_fk
    foreign key (tenant_id, user_id)
    references public.tenant_member(tenant_id, user_id)
    on delete cascade,
  constraint weg_zugang_weg_fk
    foreign key (tenant_id, weg_id)
    references public.weg(tenant_id, id)
    on delete restrict
);

comment on table public.weg_zugang is
  'Explizite Sichtbarkeit: welcher Nutzer welche WEG lesen darf. Zugriffstatsache, nicht Eigentumsnachweis — Eigentum steht in ownership.';

-- Die Richtung, die RLS geht: von der angemeldeten Person zu ihren WEGs.
create index if not exists weg_zugang_user_idx
  on public.weg_zugang (tenant_id, user_id);

alter table public.weg_zugang enable row level security;
alter table public.weg_zugang force row level security;

grant select, insert, delete on public.weg_zugang to authenticated;

-- Eigene Zeilen sieht jeder; alle Zeilen des Mandanten nur der Admin. Ohne den
-- ersten Zweig koennte sichtbare_weg_ids() als SECURITY INVOKER nichts lesen.
create policy weg_zugang_select_own
  on public.weg_zugang for select to authenticated
  using (
    tenant_id = (select public.tenant_id())
    and (
      user_id = (select auth.uid())
      or (select public.has_role('tenant_admin'))
    )
  );

create policy weg_zugang_insert_admin
  on public.weg_zugang for insert to authenticated
  with check (
    tenant_id = (select public.tenant_id())
    and (select public.has_role('tenant_admin'))
  );

create policy weg_zugang_delete_admin
  on public.weg_zugang for delete to authenticated
  using (
    tenant_id = (select public.tenant_id())
    and (select public.has_role('tenant_admin'))
  );

-- ---------------------------------------------------------------------------
-- 2. Der Helfer
-- ---------------------------------------------------------------------------
--
-- `stable`, damit Postgres ihn im InitPlan cachen kann, wenn er als
-- (select public.sichtbare_weg_ids()) aufgerufen wird — die Begruendung steht
-- woertlich in 0001:29-30 fuer has_role().
--
-- Bewusst KEIN security definer: Der Helfer liest weg_zugang, dessen eigene
-- Policy greift, und eine Rekursion entsteht nicht, weil weg_zugang in keiner
-- der unten geaenderten Policies vorkommt. Das vermeidet zugleich die
-- FORCE-RLS-Falle und den LEAKPROOF-Ausnahmeweg, den
-- docs/03-security-model.md Punkt 7 verbietet und den dieses Projekt nie
-- betreten hat.

create or replace function public.sichtbare_weg_ids()
returns setof uuid
language sql
stable
set search_path = ''
as $$
  select z.weg_id
    from public.weg_zugang as z
   where z.tenant_id = public.tenant_id()
     and z.user_id = auth.uid();
$$;

revoke all on function public.sichtbare_weg_ids() from public, anon;
grant execute on function public.sichtbare_weg_ids() to authenticated;

comment on function public.sichtbare_weg_ids() is
  'WEG ids the current user may read, from public.weg_zugang. STABLE and set-returning so IN (SELECT ...) gets a hashed subplan evaluated once per statement.';

-- ---------------------------------------------------------------------------
-- 3. Die Lesepolicies
-- ---------------------------------------------------------------------------
--
-- Muster fuer alle vier: Mandant wie bisher, plus — NUR fuer `eigentuemer` —
-- die Beschraenkung auf zugeordnete WEGs.
--
--   in (select public.sichtbare_weg_ids())
--
-- Die Unterabfrage-Form ist bewusst gewaehlt: Postgres baut daraus einen
-- gehashten SubPlan, der einmal je Anweisung ausgewertet wird statt einmal je
-- Zeile — dasselbe Ziel wie die (select ...)-Klammer aus 0055.
--
-- Die Klammerform aus 0055 gilt nur fuer SKALARE Ausdruecke. Fuer eine Menge
-- waere `= any ((select ...))` ein Parserfehler: Postgres liest das als
-- ANY (subquery) und vergleicht dann uuid gegen uuid[].
--
-- `not has_role('eigentuemer')` als erster Zweig heisst: Die Einschraenkung
-- kostet fuer jede andere Rolle nichts — der zweite Zweig wird dann gar nicht
-- ausgewertet.

drop policy if exists weg_select_own_tenant on public.weg;
create policy weg_select_own_tenant
  on public.weg for select to authenticated
  using (
    tenant_id = (select public.tenant_id())
    and (
      not (select public.has_role('eigentuemer'))
      or id in (select public.sichtbare_weg_ids())
    )
  );

drop policy if exists unit_select_own_tenant on public.unit;
create policy unit_select_own_tenant
  on public.unit for select to authenticated
  using (
    tenant_id = (select public.tenant_id())
    and (
      not (select public.has_role('eigentuemer'))
      or weg_id in (select public.sichtbare_weg_ids())
    )
  );

-- Anmerkung zu ownership: Die Policy filtert ueber ownership.weg_id. Das
-- Schema gleicht diese Spalte NICHT gegen unit.weg_id ab (0003:104-115
-- erzwingen nur denselben Mandanten, es gibt keinen Trigger). Eine inkonsistent
-- angelegte Zeile koennte damit sichtbar werden, obwohl ihre Einheit es nicht
-- ist. Die fehlende Invariante ist als Befund vermerkt; sie hier ueber einen
-- Join auf unit zu umgehen, kostete eine Unterabfrage je Zeile.
drop policy if exists ownership_select_own_tenant on public.ownership;
create policy ownership_select_own_tenant
  on public.ownership for select to authenticated
  using (
    tenant_id = (select public.tenant_id())
    and (
      not (select public.has_role('eigentuemer'))
      or weg_id in (select public.sichtbare_weg_ids())
    )
  );

drop policy if exists bse_select_own_tenant on public.beschluss_sammlung_entry;
create policy bse_select_own_tenant
  on public.beschluss_sammlung_entry for select to authenticated
  using (
    tenant_id = (select public.tenant_id())
    and (
      not (select public.has_role('eigentuemer'))
      or weg_id in (select public.sichtbare_weg_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- 4. feststellen_resolution: unveraendert bis auf einen Rollen-Riegel
-- ---------------------------------------------------------------------------
--
-- Der Koerper ist aus 0049 uebernommen. Einzige Abweichung ist der
-- eigentuemer-Riegel direkt nach der Agenten-Sperre. Grund siehe Kopf: Die
-- Funktion laeuft als SECURITY INVOKER und zaehlt ownership und unit — mit
-- gefilterten Tabellen rechnete sie still falsch.

create or replace function public.feststellen_resolution(p_resolution_id uuid)
returns table (
  resolution_id uuid,
  beschluss_sammlung_entry_id uuid,
  lfd_nr bigint,
  festgestellt_am timestamptz,
  typ text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor text;
  v_user_id uuid;
  v_now timestamptz := pg_catalog.now();
  v_resolution record;
  v_stichtag date;
  v_total_eligible integer;
  v_vote_count integer;
  v_ja integer;
  v_nein integer;
  v_enthaltung integer;
  v_ja_mea numeric;
  v_nein_mea numeric;
  v_total_mea numeric;
  v_positive boolean;
  v_bse_id uuid;
  v_lfd_nr bigint;
  v_typ text;
begin
  v_actor := coalesce(nullif(pg_catalog.current_setting('app.actor_type', true), ''), 'user');
  if v_actor = 'agent' then
    raise exception 'Agents cannot feststellen resolutions.'
      using errcode = '42501',
            hint = 'Agents may only create suggestions; final resolution acts are human actions.';
  end if;

  -- 0075: Die Feststellung ist ein Verwalterakt. Der Riegel ist zugleich
  -- Voraussetzung der Sichtbarkeitsgrenze aus dieser Migration: Diese Funktion
  -- laeuft als SECURITY INVOKER und zaehlt ownership-Zeilen fuer die
  -- Mehrheit (weiter unten) sowie MEA aus unit. Saehe ein Eigentuemer dort nur
  -- noch seine eigene WEG, fiele v_total_eligible auf seinen Anteil — der
  -- Beschluss wuerde still falsch festgestellt. Lieber abweisen als falsch
  -- rechnen.
  if (select public.has_role('eigentuemer')) then
    raise exception 'Eigentümer können keine Beschlüsse feststellen.'
      using errcode = '42501',
            hint = 'Die Feststellung eines Beschlusses ist ein Akt der Verwaltung.';
  end if;

  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authenticated user required to feststellen a resolution.'
      using errcode = '42501';
  end if;

  select
      r.id,
      r.tenant_id,
      r.meeting_id,
      r.agenda_item_id,
      r.text,
      r.mehrheits_typ,
      r.stimmprinzip,
      r.festgestellt_am,
      m.weg_id,
      m.modus,
      m.status as meeting_status,
      m.termin_von,
      ai.meeting_id as agenda_meeting_id
    into v_resolution
    from public.resolution as r
    join public.meeting as m
      on m.tenant_id = r.tenant_id
     and m.id = r.meeting_id
    left join public.agenda_item as ai
      on ai.tenant_id = r.tenant_id
     and ai.id = r.agenda_item_id
   where r.id = p_resolution_id
     and r.tenant_id = public.tenant_id()
   for update of r;

  if not found then
    raise exception 'Resolution not found or not visible for this tenant.'
      using errcode = '42501';
  end if;

  if v_resolution.agenda_item_id is not null
     and v_resolution.agenda_meeting_id is distinct from v_resolution.meeting_id then
    raise exception 'Resolution agenda_item does not belong to its meeting.'
      using errcode = '23514';
  end if;

  if v_resolution.meeting_status is distinct from 'laufend' then
    raise exception 'Resolution can only be festgestellt while the meeting is laufend.'
      using errcode = '42501';
  end if;

  if v_resolution.festgestellt_am is not null then
    raise exception 'Resolution has already been festgestellt.'
      using errcode = '23505';
  end if;

  if exists (
    select 1
      from public.beschluss_sammlung_entry as bse
     where bse.tenant_id = v_resolution.tenant_id
       and bse.resolution_id = v_resolution.id
  ) then
    raise exception 'Resolution already has a Beschluss-Sammlung entry.'
      using errcode = '23505';
  end if;

  if v_resolution.termin_von is null then
    raise exception 'Resolution finalization requires a meeting date.'
      using errcode = '23514';
  end if;

  v_stichtag := v_resolution.termin_von::date;

  if exists (
    select 1
      from public.vote as v
      left join public.ownership as o
        on o.tenant_id = v.tenant_id
       and o.id = v.ownership_id
     where v.tenant_id = v_resolution.tenant_id
       and v.resolution_id = v_resolution.id
       and (
         o.id is null
         or o.weg_id is distinct from v_resolution.weg_id
         or o.von > v_stichtag
         or (o.bis is not null and o.bis < v_stichtag)
       )
  ) then
    raise exception 'Resolution has votes with an invalid ownership basis.'
      using errcode = '23514';
  end if;

  select count(*)
    into v_total_eligible
    from public.ownership as o
   where o.tenant_id = v_resolution.tenant_id
     and o.weg_id = v_resolution.weg_id
     and o.von <= v_stichtag
     and (o.bis is null or o.bis >= v_stichtag);

  if v_total_eligible <= 0 then
    raise exception 'Resolution cannot be festgestellt without an eligible ownership basis.'
      using errcode = '23514';
  end if;

  select
      count(*)::integer,
      (count(*) filter (where v.wert = 'ja'))::integer,
      (count(*) filter (where v.wert = 'nein'))::integer,
      (count(*) filter (where v.wert = 'enthaltung'))::integer,
      coalesce(sum((u.mea_zaehler::numeric / u.mea_nenner::numeric)) filter (where v.wert = 'ja'), 0),
      coalesce(sum((u.mea_zaehler::numeric / u.mea_nenner::numeric)) filter (where v.wert = 'nein'), 0),
      coalesce(sum(u.mea_zaehler::numeric / u.mea_nenner::numeric), 0)
    into v_vote_count, v_ja, v_nein, v_enthaltung, v_ja_mea, v_nein_mea, v_total_mea
    from public.vote as v
    join public.ownership as o
      on o.tenant_id = v.tenant_id
     and o.id = v.ownership_id
    join public.unit as u
      on u.tenant_id = o.tenant_id
     and u.id = o.unit_id
   where v.tenant_id = v_resolution.tenant_id
     and v.resolution_id = v_resolution.id;

  if v_vote_count <= 0 then
    raise exception 'Resolution cannot be festgestellt without votes.'
      using errcode = '23514';
  end if;

  case v_resolution.stimmprinzip
    when 'kopf' then
      null;
    when 'objekt' then
      if exists (
        select 1
          from public.vote as v
          join public.ownership as o
            on o.tenant_id = v.tenant_id
           and o.id = v.ownership_id
         where v.tenant_id = v_resolution.tenant_id
           and v.resolution_id = v_resolution.id
         group by o.unit_id
        having count(*) > 1
      ) then
        raise exception 'Object voting has multiple votes for the same unit.'
          using errcode = '23514';
      end if;
    when 'wert' then
      if v_total_mea <= 0 then
        raise exception 'Value voting requires positive MEA data.'
          using errcode = '23514';
      end if;
    else
      raise exception 'Unsupported stimmprinzip: %', v_resolution.stimmprinzip
        using errcode = '23514';
  end case;

  case v_resolution.mehrheits_typ
    when 'einfach' then
      v_positive := case
        when v_resolution.stimmprinzip = 'wert' then v_ja_mea > v_nein_mea
        else v_ja > v_nein
      end;
    when 'qualifiziert' then
      v_positive := case
        when v_resolution.stimmprinzip = 'wert' then
          (v_ja_mea + v_nein_mea) > 0 and v_ja_mea / (v_ja_mea + v_nein_mea) >= 0.75
        else
          (v_ja + v_nein) > 0 and v_ja::numeric / (v_ja + v_nein)::numeric >= 0.75
      end;
    when 'doppelt_qualifiziert' then
      v_positive := (v_ja + v_nein) > 0
        and v_ja::numeric / (v_ja + v_nein)::numeric > (2.0 / 3.0)
        and v_total_mea > 0
        and v_ja_mea / v_total_mea > 0.5;
    when 'allstimmig' then
      v_positive := v_ja = v_total_eligible and v_nein = 0 and v_enthaltung = 0;
    when 'vereinbarungs_aenderung' then
      v_positive := v_ja = v_total_eligible and v_nein = 0 and v_enthaltung = 0;
    else
      raise exception 'Unsupported mehrheits_typ: %', v_resolution.mehrheits_typ
        using errcode = '23514';
  end case;

  v_typ := case
    when v_resolution.modus = 'umlauf' then 'umlaufbeschluss'
    when v_positive then 'positiv_beschluss'
    else 'negativ_beschluss'
  end;

  perform pg_catalog.set_config('app.resolution_finalizer', '1', true);

  update public.resolution
     set festgestellt_am = v_now,
         updated_at = v_now
   where tenant_id = v_resolution.tenant_id
     and id = v_resolution.id;

  insert into public.beschluss_sammlung_entry as bse (
    tenant_id,
    weg_id,
    meeting_id,
    resolution_id,
    beschluss_text,
    datum,
    typ,
    erstellt_durch
  )
  values (
    v_resolution.tenant_id,
    v_resolution.weg_id,
    v_resolution.meeting_id,
    v_resolution.id,
    v_resolution.text,
    coalesce(v_resolution.termin_von::date, v_now::date),
    v_typ,
    v_user_id
  )
  returning bse.id, bse.lfd_nr
    into v_bse_id, v_lfd_nr;

  resolution_id := v_resolution.id;
  beschluss_sammlung_entry_id := v_bse_id;
  lfd_nr := v_lfd_nr;
  festgestellt_am := v_now;
  typ := v_typ;
  return next;
end;
$$;

revoke all on function public.feststellen_resolution(uuid) from public;
grant execute on function public.feststellen_resolution(uuid) to authenticated;

comment on function public.feststellen_resolution(uuid) is
  'Atomically finalizes a resolution and appends the corresponding Beschluss-Sammlung entry. Refuses the eigentuemer role: this function reads ownership and unit under invoker rights, so a scoped caller would miscount the majority.';

-- Neue Tabelle: ohne Reload antwortet PostgREST auf ihren Namen mit PGRST205.
notify pgrst, 'reload schema';
