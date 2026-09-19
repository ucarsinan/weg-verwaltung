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

describe("0063 Jahresabrechnung", () => {
  const migration = readMigration("0063_jahresabrechnung.sql");
  const executableSql = stripComments(migration).toLowerCase();

  it("is additive — it rewrites no existing table", () => {
    for (const forbidden of [
      "alter table public.sollstellung",
      "alter table public.ausgabe",
      "alter table public.wirtschaftsplan",
      "drop table",
    ]) {
      expect(executableSql).not.toContain(forbidden);
    }
  });

  it("computes the Spitze against the resolved advances, never against payments", () => {
    // Der Kern der Rechtslage: Rückstände bleiben aus dem Wirtschaftsplan
    // geschuldet. Käme `zahlung` oder `zahlungszuordnung` in der View vor,
    // wäre genau das gebrochen.
    const viewStart = migration.indexOf("create or replace view public.abrechnung_spitze");
    expect(viewStart).toBeGreaterThan(-1);
    const view = migration.slice(viewStart);

    expect(view).toContain("from public.sollstellung s");
    expect(view).not.toContain("zahlungszuordnung");
    expect(view).not.toContain("public.zahlung");
  });

  it("counts only advances from plans that left the draft state", () => {
    expect(migration).toContain("wp.status <> 'entwurf'");
  });

  it("reuses the 0060 allocation helper so plan and statement cannot diverge", () => {
    expect(migration).toContain(
      "private._verteilungsschluessel_version_unit_shares(",
    );
  });

  it("guards the lifecycle with `is distinct from`, not `<>`", () => {
    // `NULL <> '1'` ist NULL, nicht TRUE — mit `<>` greift der Guard nie.
    expect(migration).toContain("v_manager is distinct from '1'");
    expect(migration).not.toMatch(/v_manager\s*<>\s*'1'/);
  });

  it("allows exactly one resolved statement per WEG and year", () => {
    expect(migration).toContain(
      "create unique index if not exists abrechnung_eine_beschlossene_idx",
    );
    expect(migration).toContain("where status = 'beschlossen'");
  });

  it("supersedes the predecessor before setting the new statement", () => {
    // Andernfalls schlägt der partielle Unique-Index beim Zweitbeschluss zu.
    const rpcStart = migration.indexOf("function public.beschliesse_abrechnung");
    const rpc = migration.slice(rpcStart);
    const abloesen = rpc.indexOf("set status = 'abgeloest'");
    const setzen = rpc.indexOf("set status = 'beschlossen'");

    expect(abloesen).toBeGreaterThan(-1);
    expect(setzen).toBeGreaterThan(abloesen);
  });

  it("freezes cost lines and shares once the statement is resolved", () => {
    expect(migration).toContain(
      "create or replace function public.tg_abrechnung_kind_draft_only",
    );
    expect(migration).toContain("v_status is distinct from 'entwurf'");
    expect(migration).toContain(
      "create trigger abrechnung_kostenposition_draft_only",
    );
    expect(migration).toContain("create trigger abrechnung_anteil_draft_only");
  });

  it("blocks agent writes and emits audit events on all three tables", () => {
    expect(migration).toContain(
      "public.tg_finance_allocation_block_agent_writes()",
    );
    expect(migration).toContain("audit_writer.tg_emit_audit_event()");
    expect(migration).toContain("'abrechnung', 'abrechnung_kostenposition', 'abrechnung_anteil'");
  });

  it("keeps the Spitze derived rather than stored", () => {
    // Beide Summanden sind bereits unveränderlich; eine gespeicherte Kopie
    // könnte nur noch abweichen.
    expect(migration).not.toMatch(/^\s+spitze\s+numeric/m);
    expect(migration).toContain("with (security_invoker = on)");
  });

  it("records the resolution date, which decides the debtor", () => {
    expect(migration).toContain("beschlossen_am            date");
    expect(migration).toContain("abrechnung_beschluss_vollstaendig");
  });
});
