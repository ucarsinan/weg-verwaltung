-- WEG-Verwaltung migration 0067: gemischte Verteilungsschluessel und HeizKV.
--
-- Purpose:
--   Until now every calculation using typ = 'gemischt' failed closed with
--   0A000 rather than allocate wrongly. Under the HeizkostenV that hit the
--   single largest cost item a WEG has.
--
--   The blocker was never the arithmetic, it was storage:
--   verteilungsschluessel_basiswert is unique per (version, unit, date) and has
--   no column saying which PART of a rule a value belongs to. A 70/30 rule
--   needs two values per unit — consumption and area.
--
-- The model: composition, not a second value column.
--   A 'gemischt' version references other, ordinary key versions with weights:
--
--     "Heizung 70/30"            (gemischt)
--        ├── 70 % → "Heizverbrauch" (verbrauch, own Basiswerte)
--        └── 30 % → "Wohnflaeche"   (flaeche,   own Basiswerte)
--
--   The area key is maintained once and serves every mixed rule. A part column
--   on verteilungsschluessel_basiswert would instead duplicate the same square
--   metres per rule — and would change a shipped table's unique index. This
--   migration touches no existing table.
--
-- No nesting. A part must not itself be 'gemischt', so resolution is exactly
--   one level deep, recursion is finite, and no one can build a cycle.
--
-- What the law requires (§ 7 Abs. 1 S. 1 HeizKV, § 8 Abs. 1 for hot water):
--   at least 50 and at most 70 percent by recorded consumption, the rest by
--   floor area or enclosed space (§ 7 Abs. 1 S. 5). Not waivable. § 7 Abs. 1
--   S. 2 makes it exactly 70 for buildings below the 1994 insulation standard
--   with oil or gas heating and mostly insulated pipes.
--
--   That corridor is NOT a check constraint on gewicht: 50–70 applies to
--   heating costs, not to mixed rules as such. A mixed rule for something else
--   may well be 50/50. It hangs off verteilungsschluessel_version.parameter —
--   the jsonb column whose own comment in 0056 anticipated exactly this.
--
-- Risk posture:
--   - Additive. No existing table, policy or index changes. The only rewrite is
--     `create or replace` on the 0060 allocation helper, which gains a branch
--     where it previously raised 0A000; every other branch is untouched.
--   - Fail-closed preserved: a part with a missing Basiswert makes the INNER
--     call raise 23514, which propagates — the rule never quietly allocates on
--     the remaining part alone.
--   - The 0A000 branch stays, for types still unknown.
--   - Agent writes blocked, audit events, RLS as in 0056/0061/0062/0063/0065.

-- ---------------------------------------------------------------------------
-- 1. Teile eines gemischten Schluessels
-- ---------------------------------------------------------------------------

create table if not exists public.verteilungsschluessel_teil (
  id                                uuid primary key default gen_random_uuid(),
  tenant_id                         uuid not null default public.tenant_id()
                                    references public.tenant(id) on delete restrict,
  verteilungsschluessel_version_id  uuid not null,
  teil_version_id                   uuid not null,
  gewicht                           numeric(6, 3) not null
                                    check (gewicht > 0 and gewicht <= 100),
  created_at                        timestamptz not null default now(),
  updated_at                        timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, verteilungsschluessel_version_id, teil_version_id),
  constraint verteilungsschluessel_teil_version_fk
    foreign key (tenant_id, verteilungsschluessel_version_id)
    references public.verteilungsschluessel_version(tenant_id, id)
    on delete cascade,
  -- Ein Schluessel, den eine gemischte Regel benutzt, darf nicht verschwinden.
  constraint verteilungsschluessel_teil_teil_fk
    foreign key (tenant_id, teil_version_id)
    references public.verteilungsschluessel_version(tenant_id, id)
    on delete restrict,
  constraint verteilungsschluessel_teil_nicht_sich_selbst
    check (verteilungsschluessel_version_id <> teil_version_id)
);

comment on table public.verteilungsschluessel_teil is
  'One weighted component of a mixed allocation rule (typ = gemischt). Parts reference ordinary key versions, so their Basiswerte are maintained once and reused.';
comment on column public.verteilungsschluessel_teil.gewicht is
  'Percent of the cost this part carries. All parts of a version must sum to exactly 100, checked per statement — so the parts of one rule are written in a single statement.';

create index if not exists verteilungsschluessel_teil_version_idx
  on public.verteilungsschluessel_teil (tenant_id, verteilungsschluessel_version_id);
create index if not exists verteilungsschluessel_teil_teil_idx
  on public.verteilungsschluessel_teil (tenant_id, teil_version_id);

-- ---------------------------------------------------------------------------
-- 2. RLS (Muster aus 0056/0061/0062/0063/0065)
-- ---------------------------------------------------------------------------

alter table public.verteilungsschluessel_teil enable row level security;
alter table public.verteilungsschluessel_teil force row level security;
revoke all on public.verteilungsschluessel_teil
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.verteilungsschluessel_teil to authenticated;

create policy verteilungsschluessel_teil_select_own_tenant
  on public.verteilungsschluessel_teil for select to authenticated
  using (tenant_id = (select public.tenant_id()));

create policy verteilungsschluessel_teil_insert_own_tenant
  on public.verteilungsschluessel_teil for insert to authenticated
  with check (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
    )
  );

create policy verteilungsschluessel_teil_update_own_tenant
  on public.verteilungsschluessel_teil for update to authenticated
  using (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
    )
  )
  with check (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
    )
  );

create policy verteilungsschluessel_teil_delete_own_tenant
  on public.verteilungsschluessel_teil for delete to authenticated
  using (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Agent-Guard und Audit
-- ---------------------------------------------------------------------------

drop trigger if exists verteilungsschluessel_teil_block_agent_writes
  on public.verteilungsschluessel_teil;
create trigger verteilungsschluessel_teil_block_agent_writes
  before insert or update or delete on public.verteilungsschluessel_teil
  for each row execute function public.tg_finance_allocation_block_agent_writes();

drop trigger if exists verteilungsschluessel_teil_audit_emit
  on public.verteilungsschluessel_teil;
create trigger verteilungsschluessel_teil_audit_emit
  after insert or update or delete on public.verteilungsschluessel_teil
  for each row execute function audit_writer.tg_emit_audit_event();

-- ---------------------------------------------------------------------------
-- 4. Zeilenweise Struktur: wer darf Teil wovon sein
-- ---------------------------------------------------------------------------

create or replace function public.tg_verteilungsschluessel_teil_validate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eltern_typ text;
  v_eltern_weg uuid;
  v_teil_typ text;
  v_teil_weg uuid;
begin
  select kv.typ, k.weg_id
    into v_eltern_typ, v_eltern_weg
    from public.verteilungsschluessel_version kv
    join public.verteilungsschluessel k
      on k.tenant_id = kv.tenant_id
     and k.id = kv.verteilungsschluessel_id
   where kv.tenant_id = new.tenant_id
     and kv.id = new.verteilungsschluessel_version_id;

  if v_eltern_typ is distinct from 'gemischt' then
    raise exception 'Nur ein gemischter Verteilungsschlüssel kann Teile haben.'
      using errcode = '23514';
  end if;

  select kv.typ, k.weg_id
    into v_teil_typ, v_teil_weg
    from public.verteilungsschluessel_version kv
    join public.verteilungsschluessel k
      on k.tenant_id = kv.tenant_id
     and k.id = kv.verteilungsschluessel_id
   where kv.tenant_id = new.tenant_id
     and kv.id = new.teil_version_id;

  -- Keine Verschachtelung. Das haelt die Aufloesung im Generator bei genau
  -- einer Ebene und macht einen Zyklus unmoeglich.
  if v_teil_typ is not distinct from 'gemischt' then
    raise exception 'Ein gemischter Verteilungsschlüssel kann nicht Teil eines anderen sein.'
      using errcode = '23514';
  end if;

  if v_teil_weg is distinct from v_eltern_weg then
    raise exception 'Der Teil gehört zu einer anderen WEG.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.tg_verteilungsschluessel_teil_validate()
  from public, anon, authenticated, service_role;

drop trigger if exists verteilungsschluessel_teil_validate
  on public.verteilungsschluessel_teil;
create trigger verteilungsschluessel_teil_validate
  before insert or update on public.verteilungsschluessel_teil
  for each row execute function public.tg_verteilungsschluessel_teil_validate();

-- ---------------------------------------------------------------------------
-- 5. Summe und HeizKV-Korridor
-- ---------------------------------------------------------------------------
--
-- Geprueft wird je STATEMENT, nicht je Zeile: nach der ersten eingefuegten
-- Zeile ist die Summe nie 100, ein Row-Trigger machte das Anlegen jeder
-- gemischten Regel unmoeglich. Die Teile einer Regel werden deshalb in EINER
-- Anweisung geschrieben — so arbeitet auch das Formular, das den ganzen Satz
-- ersetzt.
--
-- Die naheliegende Alternative waere ein `deferrable initially deferred`
-- Constraint-Trigger. Der wurde verworfen, weil er erst beim COMMIT feuert:
-- pgTAP-Vertraege laufen ausschliesslich in einer Transaktion mit `rollback`,
-- und `throws_ok` kann einen Fehler aus `set constraints ... immediate` nicht
-- abfangen — er reisst die ganze Transaktion ab. Jeder Fehlerpfad waere
-- ungetestet geblieben. Nachgemessen, nicht vermutet.

create or replace function private._verteilungsschluessel_teil_pruefe(
  p_tenant_id uuid,
  p_version_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_regelwerk text;
  v_anzahl integer;
  v_summe numeric(9, 3);
  v_verbrauch_gewicht numeric(6, 3);
  v_rest_typ text;
begin
  select kv.parameter ->> 'regelwerk'
    into v_regelwerk
    from public.verteilungsschluessel_version kv
   where kv.tenant_id = p_tenant_id
     and kv.id = p_version_id;

  -- Die Version selbst ist weg: dies ist die Kaskade aus ihrem Loeschen, und
  -- es gibt nichts mehr zu pruefen. Ohne diesen Ausstieg waere eine Version
  -- mit Teilen nicht loeschbar (die Falle aus 0063, siehe 0066).
  if not found then
    return;
  end if;

  select count(*), coalesce(sum(t.gewicht), 0)
    into v_anzahl, v_summe
    from public.verteilungsschluessel_teil t
   where t.tenant_id = p_tenant_id
     and t.verteilungsschluessel_version_id = p_version_id;

  -- Gar keine Teile ist erlaubt: so kann der Verwalter alles loeschen und neu
  -- anfangen. Die Regel ist dann unbrauchbar, und der Generator sagt das beim
  -- naechsten Zugriff (23514) — statt hier das Aufraeumen zu verbieten.
  if v_anzahl = 0 then
    return;
  end if;

  if v_summe <> 100 then
    raise exception 'Die Gewichte eines gemischten Verteilungsschlüssels müssen zusammen 100 ergeben, sind aber %.',
      v_summe
      using errcode = '23514';
  end if;

  if v_regelwerk is null or v_regelwerk = 'frei' then
    return;
  end if;

  -- Ab hier: HeizKV. § 7 Abs. 1 bzw. § 8 Abs. 1 verlangen genau zwei Groessen —
  -- einen Verbrauchsanteil im Korridor und den Rest nach Flaeche.
  if v_anzahl <> 2 then
    raise exception 'Eine Verteilung nach HeizkostenV besteht aus genau zwei Teilen: Verbrauch und Fläche.'
      using errcode = '23514';
  end if;

  select t.gewicht
    into v_verbrauch_gewicht
    from public.verteilungsschluessel_teil t
    join public.verteilungsschluessel_version kv
      on kv.tenant_id = t.tenant_id
     and kv.id = t.teil_version_id
   where t.tenant_id = p_tenant_id
     and t.verteilungsschluessel_version_id = p_version_id
     and kv.typ = 'verbrauch';

  if not found then
    raise exception 'Eine Verteilung nach HeizkostenV braucht einen Teil vom Typ "Verbrauch".'
      using errcode = '23514';
  end if;

  select kv.typ
    into v_rest_typ
    from public.verteilungsschluessel_teil t
    join public.verteilungsschluessel_version kv
      on kv.tenant_id = t.tenant_id
     and kv.id = t.teil_version_id
   where t.tenant_id = p_tenant_id
     and t.verteilungsschluessel_version_id = p_version_id
     and kv.typ <> 'verbrauch';

  if v_rest_typ is distinct from 'flaeche' then
    raise exception 'Der nicht verbrauchsabhängige Teil ist nach Wohn- oder Nutzfläche zu verteilen (§ 7 Abs. 1 Satz 5 HeizkostenV).'
      using errcode = '23514';
  end if;

  if v_regelwerk = 'heizkv_waerme_70' then
    -- § 7 Abs. 1 Satz 2: kein Korridor, sondern ein Punkt.
    if v_verbrauch_gewicht <> 70 then
      raise exception 'Für dieses Gebäude schreibt § 7 Abs. 1 Satz 2 HeizkostenV genau 70 Prozent nach Verbrauch vor, eingetragen sind %.',
        v_verbrauch_gewicht
        using errcode = '23514';
    end if;

    return;
  end if;

  if v_regelwerk in ('heizkv_waerme', 'heizkv_warmwasser') then
    if v_verbrauch_gewicht < 50 or v_verbrauch_gewicht > 70 then
      raise exception 'Nach HeizkostenV sind mindestens 50 und höchstens 70 Prozent nach Verbrauch zu verteilen, eingetragen sind %.',
        v_verbrauch_gewicht
        using errcode = '23514';
    end if;

    return;
  end if;

  raise exception 'Unbekanntes Regelwerk "%" am Verteilungsschlüssel.', v_regelwerk
    using errcode = '23514';
end;
$$;

revoke all on function private._verteilungsschluessel_teil_pruefe(uuid, uuid)
  from public, anon, authenticated, service_role;

comment on function private._verteilungsschluessel_teil_pruefe(uuid, uuid) is
  'Internal validator for one mixed rule: weights must sum to 100, and if the version carries a HeizKV regelwerk, the consumption share must sit in the statutory corridor with the remainder allocated by area.';

-- Drei Trigger, weil ein Trigger mit Uebergangstabellen nur fuer genau ein
-- Ereignis definiert sein darf.

create or replace function public.tg_verteilungsschluessel_teil_summe_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
begin
  for v_row in
    select distinct tenant_id, verteilungsschluessel_version_id from neu
  loop
    perform private._verteilungsschluessel_teil_pruefe(
      v_row.tenant_id, v_row.verteilungsschluessel_version_id);
  end loop;

  return null;
end;
$$;

create or replace function public.tg_verteilungsschluessel_teil_summe_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
begin
  -- Beide Seiten: eine Zeile kann von einer Version zu einer anderen wandern,
  -- dann sind zwei Regeln betroffen.
  for v_row in
    select distinct tenant_id, verteilungsschluessel_version_id from neu
    union
    select distinct tenant_id, verteilungsschluessel_version_id from alt
  loop
    perform private._verteilungsschluessel_teil_pruefe(
      v_row.tenant_id, v_row.verteilungsschluessel_version_id);
  end loop;

  return null;
end;
$$;

create or replace function public.tg_verteilungsschluessel_teil_summe_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
begin
  for v_row in
    select distinct tenant_id, verteilungsschluessel_version_id from alt
  loop
    perform private._verteilungsschluessel_teil_pruefe(
      v_row.tenant_id, v_row.verteilungsschluessel_version_id);
  end loop;

  return null;
end;
$$;

revoke all on function public.tg_verteilungsschluessel_teil_summe_insert()
  from public, anon, authenticated, service_role;
revoke all on function public.tg_verteilungsschluessel_teil_summe_update()
  from public, anon, authenticated, service_role;
revoke all on function public.tg_verteilungsschluessel_teil_summe_delete()
  from public, anon, authenticated, service_role;

drop trigger if exists verteilungsschluessel_teil_summe_insert
  on public.verteilungsschluessel_teil;
create trigger verteilungsschluessel_teil_summe_insert
  after insert on public.verteilungsschluessel_teil
  referencing new table as neu
  for each statement execute function public.tg_verteilungsschluessel_teil_summe_insert();

drop trigger if exists verteilungsschluessel_teil_summe_update
  on public.verteilungsschluessel_teil;
create trigger verteilungsschluessel_teil_summe_update
  after update on public.verteilungsschluessel_teil
  referencing old table as alt new table as neu
  for each statement execute function public.tg_verteilungsschluessel_teil_summe_update();

drop trigger if exists verteilungsschluessel_teil_summe_delete
  on public.verteilungsschluessel_teil;
create trigger verteilungsschluessel_teil_summe_delete
  after delete on public.verteilungsschluessel_teil
  referencing old table as alt
  for each statement execute function public.tg_verteilungsschluessel_teil_summe_delete();

-- ---------------------------------------------------------------------------
-- 6. Der Generator lernt 'gemischt'
-- ---------------------------------------------------------------------------
--
-- Unveraendert gegenueber 0060 bis auf den neuen Zweig vor dem 0A000. Die
-- uebrigen Zweige sind byte-gleich uebernommen, damit sich an mea, einheit,
-- flaeche, verbrauch und manuell nichts aendert.

create or replace function private._verteilungsschluessel_version_unit_shares(
  p_tenant_id uuid,
  p_version_id uuid,
  p_weg_id uuid,
  p_reference_date date
)
returns table(unit_id uuid, anteil numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_typ text;
  v_unit_count integer;
  v_mea_sum numeric;
  v_basiswert_sum numeric(18, 6);
  v_missing_units integer;
begin
  select kv.typ
    into v_typ
    from public.verteilungsschluessel_version as kv
   where kv.tenant_id = p_tenant_id
     and kv.id = p_version_id;

  if not found then
    raise exception 'Verteilungsschlüssel-Version nicht gefunden.'
      using errcode = 'P0002';
  end if;

  if v_typ = 'mea' then
    select sum(u.mea_zaehler::numeric / u.mea_nenner::numeric)
      into v_mea_sum
      from public.unit as u
     where u.tenant_id = p_tenant_id
       and u.weg_id = p_weg_id;

    if v_mea_sum is null or v_mea_sum <= 0 then
      raise exception 'WEG hat keine Einheiten mit Miteigentumsanteilen.'
        using errcode = '23514';
    end if;

    return query
    select u.id, ((u.mea_zaehler::numeric / u.mea_nenner::numeric) / v_mea_sum)
      from public.unit as u
     where u.tenant_id = p_tenant_id
       and u.weg_id = p_weg_id;
    return;
  end if;

  if v_typ = 'einheit' then
    select count(*)
      into v_unit_count
      from public.unit as u
     where u.tenant_id = p_tenant_id
       and u.weg_id = p_weg_id;

    if v_unit_count = 0 then
      raise exception 'WEG hat keine Einheiten für die Gleichverteilung.'
        using errcode = '23514';
    end if;

    return query
    select u.id, (1::numeric / v_unit_count)
      from public.unit as u
     where u.tenant_id = p_tenant_id
       and u.weg_id = p_weg_id;
    return;
  end if;

  if v_typ in ('flaeche', 'verbrauch', 'manuell') then
    select count(*)
      into v_missing_units
      from public.unit as u
     where u.tenant_id = p_tenant_id
       and u.weg_id = p_weg_id
       and not exists (
         select 1
           from public.verteilungsschluessel_basiswert as b
          where b.tenant_id = p_tenant_id
            and b.verteilungsschluessel_version_id = p_version_id
            and b.unit_id = u.id
            and b.gueltig_ab <= p_reference_date
            and (b.gueltig_bis is null or b.gueltig_bis >= p_reference_date)
       );

    if v_missing_units > 0 then
      raise exception 'Es fehlen Basiswerte für % Einheit(en) zum Stichtag %.',
        v_missing_units, p_reference_date
        using errcode = '23514';
    end if;

    select sum(b.wert)
      into v_basiswert_sum
      from public.unit as u
      join public.verteilungsschluessel_basiswert as b
        on b.tenant_id = p_tenant_id
       and b.verteilungsschluessel_version_id = p_version_id
       and b.unit_id = u.id
       and b.gueltig_ab <= p_reference_date
       and (b.gueltig_bis is null or b.gueltig_bis >= p_reference_date)
     where u.tenant_id = p_tenant_id
       and u.weg_id = p_weg_id;

    if v_basiswert_sum is null or v_basiswert_sum <= 0 then
      raise exception 'Die Summe der Basiswerte muss größer als 0 sein.'
        using errcode = '23514';
    end if;

    return query
    select u.id, (b.wert / v_basiswert_sum)
      from public.unit as u
      join public.verteilungsschluessel_basiswert as b
        on b.tenant_id = p_tenant_id
       and b.verteilungsschluessel_version_id = p_version_id
       and b.unit_id = u.id
       and b.gueltig_ab <= p_reference_date
       and (b.gueltig_bis is null or b.gueltig_bis >= p_reference_date)
     where u.tenant_id = p_tenant_id
       and u.weg_id = p_weg_id;
    return;
  end if;

  if v_typ = 'gemischt' then
    -- Kein Teil = keine Regel. Fail closed, wie ueberall in dieser Funktion.
    if not exists (
      select 1
        from public.verteilungsschluessel_teil as t
       where t.tenant_id = p_tenant_id
         and t.verteilungsschluessel_version_id = p_version_id
    ) then
      raise exception 'Der gemischte Verteilungsschlüssel hat keine Teile.'
        using errcode = '23514';
    end if;

    -- Jeder Teil liefert Anteile, die sich auf 1 summieren; gewichtet und
    -- addiert ergibt das wieder 1. Fehlt einem Teil ein Basiswert, scheitert
    -- der INNERE Aufruf mit 23514 und reisst die ganze Regel mit — nie wird
    -- still auf dem verbleibenden Teil allein verteilt.
    return query
    select teil.unit_id, sum(teil.anteil * teil.gewicht / 100)
      from (
        select t.gewicht, s.unit_id, s.anteil
          from public.verteilungsschluessel_teil as t
          cross join lateral private._verteilungsschluessel_version_unit_shares(
            p_tenant_id, t.teil_version_id, p_weg_id, p_reference_date) as s
         where t.tenant_id = p_tenant_id
           and t.verteilungsschluessel_version_id = p_version_id
      ) as teil
     group by teil.unit_id;
    return;
  end if;

  raise exception 'Verteilungsschlüssel-Typ "%" wird vom Sollstellung-Generator noch nicht unterstützt.',
    v_typ
    using errcode = '0A000';
end;
$$;

revoke all on function private._verteilungsschluessel_version_unit_shares(uuid, uuid, uuid, date)
  from public, anon, authenticated, service_role;

comment on function private._verteilungsschluessel_version_unit_shares(uuid, uuid, uuid, date) is
  'Internal generator helper. Returns fractional per-unit shares summing to 1 for one allocation key version. Normalizes mea by the WEG MEA total. Resolves typ=gemischt one level deep through verteilungsschluessel_teil. Fails closed for missing basis-value coverage (23514) and for still-unknown types (0A000) instead of silently mis-allocating.';

notify pgrst, 'reload schema';
