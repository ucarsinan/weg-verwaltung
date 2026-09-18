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

/**
 * Drops `--` line comments. The 0060 header names the lifecycle RPCs it
 * deliberately does NOT touch, so "is this object modified?" assertions have to
 * look at executable SQL only.
 */
function stripComments(sql: string) {
  return sql.replace(/--[^\n]*/g, "");
}

describe("0060 Wirtschaftsplan position allocation", () => {
  const migration0047 = readMigration("0047_wirtschaftsplan_lifecycle.sql");
  const migration0060 = readMigration(
    "0060_wirtschaftsplan_position_allocation.sql",
  );

  it("keeps the allocation helper internal and unreachable for app roles", () => {
    expect(migration0060).toContain(
      "create or replace function private._verteilungsschluessel_version_unit_shares",
    );
    expect(migration0060).toContain(
      "revoke all on function private._verteilungsschluessel_version_unit_shares(uuid, uuid, uuid, date)\n  from public, anon, authenticated, service_role;",
    );
    // The helper must never become a public RPC surface.
    expect(migration0060).not.toMatch(
      /create or replace function public\._verteilungsschluessel/i,
    );
  });

  it("fails closed for gemischt instead of guessing a mixed allocation", () => {
    expect(migration0060).toContain("errcode = '0A000'");
    // The mixed branch must not be silently treated as one of the simple types.
    expect(migration0060).not.toMatch(
      /if v_typ in \([^)]*'gemischt'[^)]*\)/i,
    );
  });

  it("fails closed when basis values do not cover every unit", () => {
    expect(migration0060).toContain("v_missing_units > 0");
    expect(migration0060).toContain("errcode = '23514'");
    expect(migration0060).toContain(
      "v_basiswert_sum is null or v_basiswert_sum <= 0",
    );
  });

  it("normalizes mea shares by the WEG total so a position is fully allocated", () => {
    expect(migration0060).toContain(
      "select sum(u.mea_zaehler::numeric / u.mea_nenner::numeric)",
    );
    expect(migration0060).toContain(
      "select u.id, ((u.mea_zaehler::numeric / u.mea_nenner::numeric) / v_mea_sum)",
    );
    expect(migration0060).toContain("v_mea_sum is null or v_mea_sum <= 0");
  });

  it("filters basis values by the reference date on both bounds", () => {
    const boundedLookups = migration0060.match(
      /b\.gueltig_ab <= p_reference_date\s*\n\s*and \(b\.gueltig_bis is null or b\.gueltig_bis >= p_reference_date\)/g,
    );
    // Once for the coverage check, once for the sum, once for the share query.
    expect(boundedLookups).toHaveLength(3);
  });

  it("reproduces the 0047 fallback verbatim when the plan has no positions", () => {
    // The pre-0060 arithmetic must survive byte-for-byte, including the /12.0
    // divisor that keeps the monthly rate stable for partial-year plans.
    const fallbackArithmetic = `case
          when u.mea_nenner <= 0 or u.mea_zaehler <= 0 then 0::numeric(12, 2)
          else pg_catalog.round(
            ((u.mea_zaehler::numeric / u.mea_nenner::numeric) * v_gesamtkosten) / 12.0,
            2
          )::numeric(12, 2)
        end as betrag`;

    // Same expression as 0047, only re-indented by one level inside the branch.
    expect(migration0060).toContain(fallbackArithmetic);
    expect(migration0047).toContain(fallbackArithmetic.replace(/^ {2}/gm, ""));
    expect(migration0060).toContain("if not v_has_positions then");
    expect(migration0060).toContain(
      "cross join pg_catalog.generate_series(v_start_month, 12) as months(monat)",
    );
  });

  it("keeps the Sollstellung ledger insert-only and never rewrites history", () => {
    expect(migration0060).toContain(
      "on conflict (tenant_id, wirtschaftsplan_id, unit_id, monat)",
    );
    expect(migration0060).toContain("where buchungstyp = 'initial'");
    expect(migration0060).toContain("do nothing");
    expect(migration0060).not.toMatch(/on conflict[\s\S]*?do update/i);
    expect(migration0060).not.toMatch(/delete\s+from\s+public\.sollstellung/i);
    expect(migration0060).not.toMatch(/update\s+public\.sollstellung/i);
  });

  it("leaves the lifecycle RPCs, RLS and agent guards untouched", () => {
    const executableSql = stripComments(migration0060).toLowerCase();

    for (const untouched of [
      "activate_wirtschaftsplan",
      "archive_wirtschaftsplan",
      "create_nachtragsplan",
      "create policy",
      "drop policy",
      "alter table",
      "drop table",
      "create trigger",
      "enable row level security",
    ]) {
      expect(executableSql).not.toContain(untouched);
    }
  });

  it("locks the wirtschaftsplan row and keeps the generator signature", () => {
    expect(migration0060).toContain(
      "create or replace function private._generate_sollstellungen_for_plan(\n  p_wirtschaftsplan_id uuid,\n  p_start_month integer\n)",
    );
    expect(migration0060).toContain("for update");
    expect(migration0060).toContain("set search_path = ''");
    expect(migration0060).toContain(
      "revoke all on function private._generate_sollstellungen_for_plan(uuid, integer)\n  from public, anon, authenticated, service_role;",
    );
  });

  it("uses 1 January of the plan year as the basis-value reference date", () => {
    expect(migration0060).toContain(
      "v_reference_date := pg_catalog.make_date(v_jahr, 1, 1);",
    );
  });
});
