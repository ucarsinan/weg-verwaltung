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

describe("Wirtschaftsplan lifecycle guard hotfix migration", () => {
  const migration0047 = readMigration("0047_wirtschaftsplan_lifecycle.sql");
  const migration0048 = readMigration(
    "0048_wirtschaftsplan_lifecycle_guard_fix.sql",
  );

  it("fails closed when the lifecycle manager GUC is NULL or empty", () => {
    expect(migration0048).toContain(
      "nullif(pg_catalog.current_setting('app.wirtschaftsplan_lifecycle_manager', true), '')",
    );
    expect(migration0048).toContain("v_manager is distinct from '1'");
    expect(migration0048).not.toContain("v_manager <> '1'");
  });

  it("blocks direct lifecycle status changes without the RPC manager flag", () => {
    expect(migration0048).toContain(
      "old.status is distinct from new.status",
    );
    expect(migration0048).toContain(
      "old.aktiviert_am is distinct from new.aktiviert_am",
    );
    expect(migration0048).toContain(
      "old.abgeloest_am is distinct from new.abgeloest_am",
    );
    expect(migration0048).toContain(
      "old.archiviert_am is distinct from new.archiviert_am",
    );
    expect(migration0048).toContain(
      "Wirtschaftsplan lifecycle transitions must use lifecycle RPCs.",
    );
  });

  it("keeps lifecycle RPC transitions allowed through the manager flag", () => {
    expect(migration0047).toContain(
      "create or replace function public.activate_wirtschaftsplan",
    );
    expect(migration0047).toContain(
      "create or replace function public.archive_wirtschaftsplan",
    );
    expect(migration0047).toContain(
      "perform pg_catalog.set_config('app.wirtschaftsplan_lifecycle_manager', '1', true)",
    );
    expect(migration0047).toContain(
      "create or replace function public.create_nachtragsplan",
    );
    expect(migration0047).toContain("status,\n    version_nr");
    expect(migration0047).toContain("'entwurf',");
    expect(migration0048).toContain(
      "create or replace function public.tg_wirtschaftsplan_lifecycle_guard()",
    );
    expect(migration0048).toContain("notify pgrst, 'reload schema'");
  });
});
