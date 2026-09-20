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

describe("0065 Vermögensbericht", () => {
  const migration = readMigration("0065_vermoegensbericht.sql");
  const executableSql = stripComments(migration).toLowerCase();

  it("is additive — it rewrites no existing table or view", () => {
    for (const forbidden of [
      "alter table public.sollstellung",
      "alter table public.zahlung",
      "alter table public.ausgabe",
      "alter table public.ruecklage_bewegung",
      "alter table public.abrechnung",
      "create or replace view public.offener_posten",
      "drop table",
    ]) {
      expect(executableSql).not.toContain(forbidden);
    }
  });

  it("reads arrears as of the Stichtag, not as of today", () => {
    // Der fachliche Kern: public.offener_posten zieht jede Zuordnung ab,
    // unabhängig vom Wertstellungsdatum. Für einen Bericht auf den 31.12.,
    // der im März geschrieben wird, wäre das falsch.
    const helperStart = migration.indexOf(
      "function private._offene_posten_zum_stichtag",
    );
    expect(helperStart).toBeGreaterThan(-1);
    const helper = migration.slice(helperStart);

    expect(helper).toContain("za.wert_datum <= p_stichtag");
    expect(helper).toContain(
      "pg_catalog.make_date(wp.jahr, s.monat, 1) <= p_stichtag",
    );
    expect(helper).toContain("wp.status <> 'entwurf'");
  });

  it("does not fall back to the as-of-today view when building a report", () => {
    const rpcStart = migration.indexOf(
      "function public.erstelle_vermoegensbericht",
    );
    const rpc = migration.slice(rpcStart);

    expect(rpc).toContain("private._offene_posten_zum_stichtag(");
    expect(rpc).not.toContain("public.offener_posten");
  });

  it("reads the reserve from the ledger, so a quiet year still shows a balance", () => {
    // ruecklage_entwicklung liefert nur Zeilen für Jahre MIT Bewegungen — eine
    // WEG ohne Bewegung im Berichtsjahr hätte dort keine.
    expect(migration).toContain(
      "function private._ruecklage_bestand_zum_stichtag",
    );
    expect(migration).toContain("b.datum <= p_stichtag");

    const rpcStart = migration.indexOf(
      "function public.erstelle_vermoegensbericht",
    );
    expect(migration.slice(rpcStart)).not.toContain(
      "public.ruecklage_entwicklung",
    );
  });

  it("pins the Stichtag to the end of the calendar year", () => {
    expect(migration).toContain("vermoegensbericht_stichtag_jahresende");
    expect(migration).toContain("pg_catalog.make_date(jahr, 12, 31)");
  });

  it("lets a Sachwert stand without a figure, and nothing else", () => {
    // "Die Bestandteile des Vermögens bedürfen keiner Bewertung" — aber eine
    // Forderung ohne Betrag wäre wertlos.
    expect(migration).toContain(
      "vermoegensbericht_position_betrag_nur_sachwert_optional",
    );
    expect(migration).toContain("betrag is not null or abschnitt = 'sachwert'");
  });

  it("keeps an opening balance to the two balance sections", () => {
    expect(migration).toContain(
      "betrag_anfang is null or abschnitt in ('konto', 'ruecklage')",
    );
  });

  it("uses `erstellt`, never `beschlossen` — the report is not resolved", () => {
    expect(migration).toContain(
      "check (status in ('entwurf', 'erstellt', 'abgeloest'))",
    );

    // 'beschlossen' darf hier vorkommen — aber nur als Filter auf die
    // Jahresabrechnung, aus der die Spitzen stammen, nie als Status des
    // Berichts selbst.
    const treffer = stripComments(migration).match(/'beschlossen'/g) ?? [];
    const alsAbrechnungsfilter =
      stripComments(migration).match(/a\.status = 'beschlossen'/g) ?? [];

    expect(treffer).toHaveLength(alsAbrechnungsfilter.length);
    expect(alsAbrechnungsfilter.length).toBeGreaterThan(0);
  });

  it("guards the lifecycle with `is distinct from`, not `<>`", () => {
    // Die Lehre aus 0064: `NULL <> '1'` ist NULL, nicht TRUE.
    expect(migration).toContain("v_manager is distinct from '1'");
    expect(migration).not.toMatch(/v_manager\s*<>\s*'1'/);
  });

  it("allows exactly one finalised report per WEG and year", () => {
    expect(migration).toContain(
      "create unique index if not exists vermoegensbericht_einer_erstellt_idx",
    );
    expect(migration).toContain("where status = 'erstellt'");
  });

  it("supersedes the predecessor before finalising the correction", () => {
    const rpcStart = migration.indexOf(
      "function public.stelle_vermoegensbericht_fertig",
    );
    const rpc = migration.slice(rpcStart);
    const abloesen = rpc.indexOf("set status = 'abgeloest'");
    const setzen = rpc.indexOf("set status = 'erstellt'");

    expect(abloesen).toBeGreaterThan(-1);
    expect(setzen).toBeGreaterThan(abloesen);
  });

  it("keeps a draft deletable while protecting a finalised report", () => {
    // Der Positions-Guard läuft auch in der ON-DELETE-CASCADE, wenn die
    // Kopfzeile schon weg ist. Ohne die Ausnahme wäre kein Entwurf löschbar —
    // genau dieser Fehler steckt noch in 0063.
    expect(migration).toContain("if v_status is null and tg_op = 'DELETE'");
    expect(migration).toContain(
      "create trigger vermoegensbericht_delete_draft_only",
    );
  });

  it("blocks agent writes and emits audit events on both tables", () => {
    expect(migration).toContain(
      "public.tg_finance_allocation_block_agent_writes()",
    );
    expect(migration).toContain("audit_writer.tg_emit_audit_event()");
    expect(migration).toContain(
      "'vermoegensbericht', 'vermoegensbericht_position'",
    );
  });

  it("keeps the internal helpers off the public surface", () => {
    expect(migration).toContain(
      "revoke all on function private._offene_posten_zum_stichtag(uuid, uuid, date)",
    );
    expect(migration).toContain(
      "revoke all on function private._ruecklage_bestand_zum_stichtag(uuid, uuid, date)",
    );
  });
});
