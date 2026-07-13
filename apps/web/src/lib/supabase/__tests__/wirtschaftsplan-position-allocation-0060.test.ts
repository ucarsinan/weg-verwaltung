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

describe("Wirtschaftsplan position allocation migration (0060)", () => {
  const migration0060 = readMigration(
    "0060_wirtschaftsplan_position_allocation.sql",
  );

  it("does not touch the lifecycle RPCs, RLS, or agent guards", () => {
    expect(migration0060).not.toContain(
      "create or replace function public.activate_wirtschaftsplan",
    );
    expect(migration0060).not.toContain(
      "create or replace function public.archive_wirtschaftsplan",
    );
    expect(migration0060).not.toContain(
      "create or replace function public.create_nachtragsplan",
    );
    expect(migration0060).not.toContain("create policy");
    expect(migration0060).not.toContain("tg_finance_allocation_block_agent_writes");
  });

  it("falls back to the unchanged MEA/gesamtkosten calculation when a plan has no positions", () => {
    expect(migration0060).toContain("if not v_has_positions then");
    expect(migration0060).toContain(
      "when u.mea_nenner <= 0 or u.mea_zaehler <= 0 then 0::numeric(12, 2)",
    );
    expect(migration0060).toContain(
      "((u.mea_zaehler::numeric / u.mea_nenner::numeric) * v_gesamtkosten) / 12.0",
    );
  });

  it("sums position allocations per unit before splitting into monthly installments", () => {
    expect(migration0060).toContain("sum(wpp.jahresbetrag * shares.anteil)");
    expect(migration0060).toContain(
      "pg_catalog.round(totals.jahresbetrag_gesamt / 12.0, 2)",
    );
    expect(migration0060).toContain(
      "cross join lateral private._verteilungsschluessel_version_unit_shares(",
    );
  });

  it("fails closed for typ=gemischt instead of guessing an allocation", () => {
    expect(migration0060).toContain(
      "wird vom Sollstellung-Generator noch nicht unterstützt",
    );
    expect(migration0060).toContain("errcode = '0A000'");
  });

  it("fails closed when a unit is missing a basis value for a value-based key", () => {
    expect(migration0060).toContain("v_missing_units > 0");
    expect(migration0060).toContain("Es fehlen Basiswerte für");
    expect(migration0060).toContain("errcode = '23514'");
  });

  it("keeps the internal helper functions unreachable from API roles", () => {
    expect(migration0060).toContain(
      "revoke all on function private._verteilungsschluessel_version_unit_shares(uuid, uuid, uuid, date)\n  from public, anon, authenticated, service_role;",
    );
    expect(migration0060).toContain(
      "revoke all on function private._generate_sollstellungen_for_plan(uuid, integer)\n  from public, anon, authenticated, service_role;",
    );
  });

  it("preserves the insert-only conflict target for initial Sollstellungen", () => {
    const onConflictOccurrences = migration0060.match(
      /on conflict \(tenant_id, wirtschaftsplan_id, unit_id, monat\)/g,
    );
    const doNothingOccurrences = migration0060.match(/\bdo nothing;/g);
    expect(onConflictOccurrences).toHaveLength(2);
    expect(doNothingOccurrences).toHaveLength(2);
    expect(migration0060.match(/where buchungstyp = 'initial'/g)).toHaveLength(2);
  });

  it("keeps this a schema/logic-only migration with no RLS or grant changes to existing tables", () => {
    expect(migration0060).not.toContain("alter table");
    expect(migration0060).not.toContain("grant ");
    expect(migration0060).toContain("notify pgrst, 'reload schema'");
  });
});
