import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = path.resolve(
  process.cwd(),
  "../../infra/supabase/migrations",
);

function readMigration(filename: string) {
  return readFileSync(path.join(migrationsDir, filename), "utf-8");
}

function stripComments(sql: string) {
  return sql.replace(/--[^\n]*/g, "");
}

describe("0075 Sichtbarkeit je WEG", () => {
  const migration = readMigration("0075_weg_zugang.sql");
  const executableSql = stripComments(migration).toLowerCase();

  it("bindet Sichtbarkeit an die Mitgliedschaft", () => {
    // Der Kern: Zugang lässt sich nur an Mitglieder des Mandanten vergeben.
    // Ohne diesen Fremdschlüssel könnte ein Admin eine beliebige fremde UUID
    // eintragen — genau die Lücke, die person.user_id heute offen hat.
    expect(executableSql).toContain(
      "references public.tenant_member(tenant_id, user_id)",
    );
  });

  it("schaltet RLS und FORCE RLS auf der neuen Tabelle ein", () => {
    // Ohne beides fällt tests/0000_rls_katalog.sql.
    expect(executableSql).toContain(
      "alter table public.weg_zugang enable row level security",
    );
    expect(executableSql).toContain(
      "alter table public.weg_zugang force row level security",
    );
  });

  it("hält den Helfer STABLE und als SECURITY INVOKER", () => {
    // STABLE erlaubt das InitPlan-Caching in (select ...). Ein SECURITY DEFINER
    // hätte die Policy von weg_zugang umgangen und die FORCE-RLS-Falle geöffnet.
    const helfer = executableSql.slice(
      executableSql.indexOf("create or replace function public.sichtbare_weg_ids"),
      executableSql.indexOf("revoke all on function public.sichtbare_weg_ids"),
    );
    expect(helfer).toContain("stable");
    expect(helfer).toContain("returns setof uuid");
    expect(helfer).not.toContain("security definer");
  });

  it("wertet den Helfer einmal je Anweisung aus, nicht je Zeile", () => {
    // Die Unterabfrage-Form gibt Postgres einen gehashten SubPlan. Die
    // (select …)-Klammer aus 0055 gilt nur für SKALARE Ausdrücke — für eine
    // Menge wäre `= any ((select …))` ein Parserfehler: Postgres liest das als
    // ANY (subquery) und vergleicht uuid gegen uuid[].
    const treffer = executableSql.match(
      /in \(select public\.sichtbare_weg_ids\(\)\)/g,
    );
    expect(treffer).toHaveLength(4);
  });

  it("schränkt als Sperrliste ein, nicht als Positivliste", () => {
    // Eingeschränkt wird genau eine Rolle. Eine Positivliste würde bei nicht
    // registriertem Access-Token-Hook jeden aussperren — derselbe Fehler, den
    // die Claims-Prüfung der Weboberfläche seit PR #33 vermeidet.
    const treffer = executableSql.match(
      /not \(select public\.has_role\('eigentuemer'\)\)/g,
    );
    expect(treffer).toHaveLength(4);
  });

  it("behält das Mandantenprädikat in jeder ersetzten Policy", () => {
    // tests/0056:175-189 verlangt, dass SELECT-Policies tenant_id enthalten.
    // Die Einschränkung kommt additiv dazu, sie ersetzt nichts.
    for (const policy of [
      "weg_select_own_tenant",
      "unit_select_own_tenant",
      "ownership_select_own_tenant",
      "bse_select_own_tenant",
    ]) {
      const ab = executableSql.indexOf(`create policy ${policy}`);
      expect(ab, `${policy} muss neu angelegt werden`).toBeGreaterThan(-1);
      const koerper = executableSql.slice(ab, ab + 400);
      expect(koerper).toContain("tenant_id = (select public.tenant_id())");
    }
  });

  it("riegelt feststellen_resolution gegen die Rolle ab", () => {
    // Die Funktion ist SECURITY INVOKER und zählt ownership und unit. Mit
    // gefilterten Tabellen fiele v_total_eligible auf den eigenen Anteil und
    // der Beschluss würde still falsch festgestellt.
    expect(executableSql).toContain(
      "create or replace function public.feststellen_resolution",
    );
    const funktion = executableSql.slice(
      executableSql.indexOf("create or replace function public.feststellen_resolution"),
    );
    expect(funktion).toContain("if (select public.has_role('eigentuemer')) then");
    // Der Riegel muss vor dem ersten Lesezugriff auf ownership stehen — nicht
    // vor der Deklaration von v_total_eligible, die ohnehin im DECLARE-Block
    // ganz oben steht.
    expect(
      funktion.indexOf("has_role('eigentuemer')"),
      "der Riegel muss greifen, bevor ownership gelesen wird",
    ).toBeLessThan(funktion.indexOf("from public.ownership"));
  });

  it("lässt person und die Finanztabellen unangetastet", () => {
    // person braucht eine Einschränkung auf Spaltenebene (E-Mail und Telefon
    // sind freiwillige Angaben), die Finanztabellen stehen unter einer
    // geschlossenen Welt in tests/0056.
    expect(executableSql).not.toContain("create policy person_select");
    expect(executableSql).not.toContain("create policy wirtschaftsplan_select");
    expect(executableSql).not.toContain("create policy sollstellung_select");
  });

  it("lädt das PostgREST-Schema neu, weil die Tabelle neu ist", () => {
    expect(executableSql).toContain("notify pgrst, 'reload schema'");
  });
});
