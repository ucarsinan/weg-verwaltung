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

describe("0056 finance allocation foundation migration", () => {
  const migration = readMigration("0056_finance_allocation_foundation.sql");
  const normalizedMigration = migration.replace(/\s+/g, " ");

  it("creates the allocation foundation tables", () => {
    expect(migration).toContain(
      "create table if not exists public.verteilungsschluessel",
    );
    expect(migration).toContain(
      "create table if not exists public.verteilungsschluessel_version",
    );
    expect(migration).toContain(
      "create table if not exists public.verteilungsschluessel_basiswert",
    );
    expect(migration).toContain(
      "create table if not exists public.wirtschaftsplan_position",
    );
  });

  it("models versioned allocation keys and basis values", () => {
    expect(migration).toContain("verteilungsschluessel_id   uuid not null");
    expect(migration).toContain(
      "typ                        text not null check (typ in",
    );
    expect(migration).toContain("'gemischt'");
    expect(migration).toContain(
      "parameter                  jsonb not null default '{}'::jsonb",
    );
    expect(migration).toContain("gueltig_ab");
    expect(migration).toContain("gueltig_bis");
    expect(migration).toContain(
      "verteilungsschluessel_version_id  uuid not null",
    );
    expect(migration).toContain("wert                              numeric(18, 6)");
  });

  it("anchors plan lines to draft Wirtschaftspläne and allocation snapshots", () => {
    expect(migration).toContain(
      "constraint wirtschaftsplan_position_plan_fk",
    );
    expect(migration).toContain(
      "constraint wirtschaftsplan_position_version_fk",
    );
    expect(migration).toContain("verteilungsschluessel_snapshot");
    expect(migration).toContain("jsonb not null default '{}'::jsonb");
    expect(migration).toContain(
      "create trigger wirtschaftsplan_position_validate",
    );
    expect(migration).toContain(
      "Wirtschaftsplan positions can only be changed while the plan is a draft.",
    );
  });

  it("enforces tenant RLS and FORCE RLS on all new public tables", () => {
    for (const table of [
      "verteilungsschluessel",
      "verteilungsschluessel_version",
      "verteilungsschluessel_basiswert",
      "wirtschaftsplan_position",
    ]) {
      expect(migration).toContain(
        `alter table public.${table} enable row level security`,
      );
      expect(migration).toContain(
        `alter table public.${table} force row level security`,
      );
      expect(migration).toMatch(
        new RegExp(
          `revoke all on public\\.${table}\\s+from public, anon, authenticated, service_role`,
          "i",
        ),
      );
      expect(migration).toContain(`tenant_id = (select public.tenant_id())`);
    }
  });

  it("limits finance DML policies to manager roles", () => {
    expect(migration).toContain("(select public.has_role('tenant_admin'))");
    expect(migration).toContain(
      "(select public.has_role('verwalter_mitarbeiter'))",
    );
  });

  it("blocks agent writes to finance allocation tables", () => {
    expect(migration).toContain(
      "create or replace function public.tg_finance_allocation_block_agent_writes()",
    );
    expect(migration).toContain(
      "Agents cannot write finance allocation rules or plan positions.",
    );
    expect(migration).toMatch(
      /revoke all on function public\.tg_finance_allocation_block_agent_writes\(\)\s+from public, anon, authenticated, service_role/i,
    );
    expect(migration).toContain(
      "create trigger verteilungsschluessel_block_agent_writes",
    );
    expect(migration).toContain(
      "create trigger verteilungsschluessel_version_block_agent_writes",
    );
    expect(migration).toContain(
      "create trigger verteilungsschluessel_basiswert_block_agent_writes",
    );
    expect(migration).toContain(
      "create trigger wirtschaftsplan_position_block_agent_writes",
    );
  });

  it("enforces same-WEG consistency for versions, basis values, and plan lines", () => {
    expect(migration).toContain(
      "create or replace function public.tg_verteilungsschluessel_version_validate_weg()",
    );
    expect(migration).toMatch(
      /revoke all on function public\.tg_verteilungsschluessel_version_validate_weg\(\)\s+from public, anon, authenticated, service_role/i,
    );
    expect(migration).toContain(
      "Allocation key resolution anchor must belong to the same WEG.",
    );
    expect(migration).toContain(
      "create or replace function public.tg_verteilungsschluessel_basiswert_validate_weg()",
    );
    expect(migration).toMatch(
      /revoke all on function public\.tg_verteilungsschluessel_basiswert_validate_weg\(\)\s+from public, anon, authenticated, service_role/i,
    );
    expect(migration).toContain(
      "Allocation basis value unit must belong to the same WEG as the allocation key.",
    );
    expect(migration).toContain(
      "create or replace function public.tg_wirtschaftsplan_position_validate()",
    );
    expect(migration).toMatch(
      /revoke all on function public\.tg_wirtschaftsplan_position_validate\(\)\s+from public, anon, authenticated, service_role/i,
    );
    expect(migration).toContain(
      "Wirtschaftsplan position allocation key must belong to the same WEG as the plan.",
    );
  });

  it("blocks overlapping validity periods for key versions and basis values", () => {
    expect(migration).toContain(
      "Allocation key versions must not have overlapping validity periods.",
    );
    expect(migration).toContain(
      "Allocation basis values must not have overlapping validity periods per unit.",
    );
    expect(migration).toContain(
      "existing.gueltig_ab <= coalesce(new.gueltig_bis, 'infinity'::date)",
    );
    expect(migration).toContain(
      "new.gueltig_ab <= coalesce(existing.gueltig_bis, 'infinity'::date)",
    );
    expect(normalizedMigration).toContain(
      "before insert or update of verteilungsschluessel_id, resolution_id, gueltig_ab, gueltig_bis on public.verteilungsschluessel_version",
    );
    expect(normalizedMigration).toContain(
      "before insert or update of verteilungsschluessel_version_id, unit_id, gueltig_ab, gueltig_bis on public.verteilungsschluessel_basiswert",
    );
  });

  it("adds audit triggers for all new finance tables", () => {
    expect(migration).toContain("verteilungsschluessel_audit_emit");
    expect(migration).toContain("verteilungsschluessel_version_audit_emit");
    expect(migration).toContain("verteilungsschluessel_basiswert_audit_emit");
    expect(migration).toContain("wirtschaftsplan_position_audit_emit");
    expect(migration).toMatch(
      /execute function audit_writer\.tg_emit_audit_event\(\)/,
    );
  });

  it("does not touch immutable Sollstellung generation or lifecycle RPCs", () => {
    expect(migration).not.toContain("create or replace function public.activate_wirtschaftsplan");
    expect(migration).not.toContain("create or replace function public.generate_sollstellungen");
    expect(migration).not.toContain("alter table public.sollstellung");
    expect(migration).not.toMatch(/update\s+public\.sollstellung/i);
    expect(migration).not.toMatch(/delete\s+from\s+public\.sollstellung/i);
  });
});
