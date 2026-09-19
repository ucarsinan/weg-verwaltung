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

/** Drops `--` line comments so "is this object touched?" looks at SQL only. */
function stripComments(sql: string) {
  return sql.replace(/--[^\n]*/g, "");
}

describe("0061 Zahlungen und offene Posten", () => {
  const migration = readMigration("0061_zahlung_und_offene_posten.sql");
  const executableSql = stripComments(migration).toLowerCase();

  it("leaves the Sollstellung ledger completely untouched", () => {
    // A payment must never rewrite a claim — that is the whole point of the
    // separate allocation table.
    for (const forbidden of [
      "alter table public.sollstellung",
      "update public.sollstellung",
      "delete from public.sollstellung",
      "drop table",
    ]) {
      expect(executableSql).not.toContain(forbidden);
    }
  });

  it("guards against over-allocating a payment and over-paying a claim", () => {
    expect(migration).toContain("v_zugeordnet_zahlung + new.betrag > v_zahlung_betrag");
    expect(migration).toContain("v_zugeordnet_soll + new.betrag > v_soll_betrag");
    // Both must fail closed, not clamp.
    const checkViolations = migration.match(/errcode = '23514'/g);
    expect(checkViolations?.length).toBeGreaterThanOrEqual(4);
  });

  it("excludes the row being written from its own sum, so an update is not double counted", () => {
    const selfExclusions = migration.match(/z\.id is distinct from new\.id/g);
    expect(selfExclusions).toHaveLength(2);
  });

  it("locks a payment once something is allocated to it", () => {
    expect(migration).toContain(
      "create or replace function public.tg_zahlung_lock_when_allocated",
    );
    expect(migration).toContain(
      "before update or delete on public.zahlung",
    );
  });

  it("rejects cross-WEG allocations", () => {
    expect(migration).toContain(
      "v_zahlung_weg_id is distinct from v_soll_weg_id",
    );
  });

  it("blocks agent writes on both new tables", () => {
    expect(migration).toContain(
      "create trigger zahlung_block_agent_writes",
    );
    expect(migration).toContain(
      "create trigger zahlungszuordnung_block_agent_writes",
    );
    expect(migration).toContain(
      "execute function public.tg_finance_allocation_block_agent_writes()",
    );
  });

  it("emits audit events for both tables, because this is a money path", () => {
    expect(migration).toContain("create trigger zahlung_audit_emit");
    expect(migration).toContain("create trigger zahlungszuordnung_audit_emit");
  });

  it("enables and forces RLS on both tables", () => {
    for (const table of ["zahlung", "zahlungszuordnung"]) {
      expect(migration).toContain(
        `alter table public.${table} enable row level security`,
      );
      expect(migration).toContain(
        `alter table public.${table} force row level security`,
      );
      expect(migration).toContain(
        `revoke all on public.${table}\n  from public, anon, authenticated, service_role;`,
      );
    }
  });

  it("reads open items through a security_invoker view, not a definer function", () => {
    expect(migration).toContain("create or replace view public.offener_posten");
    expect(migration).toContain("with (security_invoker = on)");
    expect(executableSql).not.toContain("create or replace function public.offener_posten");
  });

  it("derives the open amount instead of storing it", () => {
    expect(migration).toContain(
      "(s.betrag - coalesce(sum(z.betrag), 0))::numeric(12, 2) as offen_betrag",
    );
  });

  it("keeps `camt` available so the import slice needs no migration", () => {
    expect(migration).toContain("check (quelle in ('manuell', 'camt'))");
  });
});
