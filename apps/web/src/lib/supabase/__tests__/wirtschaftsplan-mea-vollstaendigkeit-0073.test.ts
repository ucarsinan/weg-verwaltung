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

describe("0073 MEA-Vollständigkeit bei der Aktivierung", () => {
  const migration = readMigration(
    "0073_wirtschaftsplan_mea_vollstaendigkeit.sql",
  );
  const executableSql = stripComments(migration).toLowerCase();

  it("lässt den Generator unangetastet", () => {
    // Der Alt-Zweig in 0060 ist ein ausdrückliches Versprechen auf
    // byte-identisches Vor-0060-Verhalten. 0073 prüft davor, statt es zu
    // ändern — sonst zahlten bei fehlender Einheit die übrigen deren Anteil.
    for (const forbidden of [
      "create or replace function private._generate_sollstellungen_for_plan",
      "create or replace function private._verteilungsschluessel_version_unit_shares",
      "alter table public.unit",
      "alter table public.sollstellung",
    ]) {
      expect(executableSql).not.toContain(forbidden);
    }
  });

  it("prüft die Summe der Brüche, nicht den Zähler gegen 1000", () => {
    expect(executableSql).toContain(
      "sum(u.mea_zaehler::numeric / u.mea_nenner::numeric)",
    );
    // Ein hart kodierter Nenner wäre falsch: 1000/1000 ist verbreitete Praxis,
    // aber nicht vorgeschrieben.
    expect(executableSql).not.toContain("= 1000");
    expect(executableSql).not.toContain("mea_nenner = 1000");
  });

  it("verwendet 22023, damit die Ursache unterscheidbar bleibt", () => {
    // Jeder 23514 der Aktivierung landet in der Weboberfläche in derselben
    // Sammelmeldung. Ein eigener Code macht die MEA-Ursache benennbar.
    expect(executableSql).toContain("errcode = '22023'");
  });

  it("deckt beide Richtungen und den Leerfall ab", () => {
    expect(executableSql).toContain("v_mea_sum <= 0");
    expect(executableSql).toContain("v_mea_sum > 1 + v_epsilon");
    expect(executableSql).toContain("v_mea_sum < 1 - v_epsilon");
  });

  it("prüft, bevor irgendetwas geschrieben ist", () => {
    const pruefung = executableSql.indexOf("v_mea_sum <= 0");
    const lifecycleManager = executableSql.indexOf(
      "app.wirtschaftsplan_lifecycle_manager",
    );
    const update = executableSql.indexOf("update public.wirtschaftsplan");

    expect(pruefung).toBeGreaterThan(-1);
    expect(pruefung).toBeLessThan(lifecycleManager);
    expect(pruefung).toBeLessThan(update);
  });

  it("lässt die Agenten-Sperre vorrangig", () => {
    const agentGuard = executableSql.indexOf("agents cannot activate");
    const meaGuard = executableSql.indexOf("v_mea_sum <= 0");

    expect(agentGuard).toBeGreaterThan(-1);
    expect(agentGuard).toBeLessThan(meaGuard);
  });

  it("behält die Rechtevergabe der RPC bei", () => {
    expect(executableSql).toContain(
      "revoke all on function public.activate_wirtschaftsplan(uuid)",
    );
    expect(executableSql).toContain(
      "grant execute on function public.activate_wirtschaftsplan(uuid) to authenticated",
    );
  });
});
