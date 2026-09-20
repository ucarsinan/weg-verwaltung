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

describe("0067 gemischte Verteilungsschlüssel", () => {
  const migration = readMigration("0067_gemischte_verteilungsschluessel.sql");
  const executableSql = stripComments(migration).toLowerCase();

  it("touches no existing table — composition instead of a second value column", () => {
    for (const forbidden of [
      "alter table public.verteilungsschluessel_basiswert",
      "alter table public.verteilungsschluessel_version",
      "alter table public.verteilungsschluessel ",
      "drop index",
      "drop table",
    ]) {
      expect(executableSql).not.toContain(forbidden);
    }
  });

  it("forbids nesting, so resolution stays one level deep", () => {
    // Ohne dieses Verbot waere die Rekursion im Generator unbegrenzt und ein
    // Zyklus baubar.
    expect(migration).toContain(
      "Ein gemischter Verteilungsschlüssel kann nicht Teil eines anderen sein.",
    );
    expect(migration).toContain("verteilungsschluessel_teil_nicht_sich_selbst");
  });

  it("checks the weight sum per statement, not per row", () => {
    // Je Zeile geprueft waere die Summe nach der ersten Zeile nie 100 — keine
    // gemischte Regel liesse sich anlegen.
    expect(migration).toContain("for each statement execute function");
    expect(migration).toContain("referencing new table as neu");
    expect(migration).toContain("referencing old table as alt");
    // Nur im ausführbaren Teil: der Kommentar erklärt ausdrücklich, warum ein
    // aufgeschobener Constraint-Trigger hier verworfen wurde.
    expect(executableSql).not.toContain("deferrable initially deferred");
  });

  it("keeps the HeizKV corridor off the weight column itself", () => {
    // 50–70 gilt fuer Heizkosten, nicht fuer gemischte Regeln ueberhaupt.
    expect(migration).toContain("check (gewicht > 0 and gewicht <= 100)");
    expect(migration).not.toMatch(/check\s*\([^)]*gewicht\s*>=\s*50/i);
    expect(migration).toContain("parameter ->> 'regelwerk'");
  });

  it("encodes both HeizKV cases: the corridor and the fixed 70", () => {
    expect(migration).toContain("v_verbrauch_gewicht < 50 or v_verbrauch_gewicht > 70");
    expect(migration).toContain("heizkv_waerme_70");
    expect(migration).toContain("v_verbrauch_gewicht <> 70");
  });

  it("requires the non-consumption part to go by area", () => {
    expect(migration).toContain("v_rest_typ is distinct from 'flaeche'");
    expect(migration).toContain("§ 7 Abs. 1 Satz 5 HeizkostenV");
  });

  it("allows a rule to be emptied so it can be rebuilt", () => {
    expect(migration).toContain("if v_anzahl = 0 then");
  });

  it("survives the cascade when the version itself is deleted", () => {
    // Dieselbe Falle wie in 0063: der Guard laeuft, wenn die Elternzeile schon
    // weg ist.
    const fnStart = migration.indexOf(
      "function private._verteilungsschluessel_teil_pruefe",
    );
    expect(fnStart).toBeGreaterThan(-1);
    expect(migration.slice(fnStart)).toContain("if not found then\n    return;");
  });

  it("resolves a mixed key through its parts and weights them", () => {
    const fnStart = migration.indexOf(
      "function private._verteilungsschluessel_version_unit_shares",
    );
    const fn = migration.slice(fnStart);

    expect(fn).toContain("if v_typ = 'gemischt' then");
    expect(fn).toContain("sum(teil.anteil * teil.gewicht / 100)");
    expect(fn).toContain("cross join lateral private._verteilungsschluessel_version_unit_shares(");
  });

  it("fails closed for a mixed key without parts", () => {
    expect(migration).toContain(
      "Der gemischte Verteilungsschlüssel hat keine Teile.",
    );
  });

  it("keeps the 0A000 branch for types still unknown", () => {
    // gemischt ist geloest — der Zweig bleibt fuer den naechsten neuen Typ.
    expect(migration).toContain("errcode = '0A000'");
    const fnStart = migration.indexOf(
      "function private._verteilungsschluessel_version_unit_shares",
    );
    const fn = migration.slice(fnStart);
    expect(fn.indexOf("if v_typ = 'gemischt' then")).toBeLessThan(
      fn.indexOf("errcode = '0A000'"),
    );
  });

  it("blocks agent writes and emits audit events", () => {
    expect(migration).toContain(
      "public.tg_finance_allocation_block_agent_writes()",
    );
    expect(migration).toContain("audit_writer.tg_emit_audit_event()");
  });

  it("keeps the internal validator off the public surface", () => {
    expect(migration).toContain(
      "revoke all on function private._verteilungsschluessel_teil_pruefe(uuid, uuid)",
    );
  });
});
