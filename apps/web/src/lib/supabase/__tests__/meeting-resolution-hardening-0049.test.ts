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

describe("meeting resolution hardening migration 0049", () => {
  const migration = readMigration("0049_meeting_resolution_hardening.sql");

  it("introduces the atomic finalization RPC and keeps it tenant scoped", () => {
    expect(migration).toContain(
      "create or replace function public.feststellen_resolution(p_resolution_id uuid)",
    );
    expect(migration).toContain("security invoker");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("for update of r");
    expect(migration).toContain("r.tenant_id = public.tenant_id()");
    expect(migration).toContain(
      "insert into public.beschluss_sammlung_entry as bse",
    );
    expect(migration).toContain(
      "grant execute on function public.feststellen_resolution(uuid) to authenticated",
    );
  });

  it("blocks direct finalization and agent finalization", () => {
    expect(migration).toContain(
      "app.resolution_finalizer', '1', true",
    );
    expect(migration).toContain(
      "Resolution finalization must use public.feststellen_resolution(uuid).",
    );
    expect(migration).toContain(
      "Resolution can only be festgestellt while the meeting is laufend.",
    );
    expect(migration).toContain("v_actor = 'agent'");
    expect(migration).toContain("Agents cannot feststellen resolutions.");
  });

  it("enforces BSE uniqueness and source consistency", () => {
    expect(migration).toContain("bse_resolution_once_idx");
    expect(migration).toContain(
      "on public.beschluss_sammlung_entry (tenant_id, resolution_id)",
    );
    expect(migration).toContain(
      "where resolution_id is not null",
    );
    expect(migration).toContain(
      "Beschluss-Sammlung entry meeting does not match resolution meeting.",
    );
    expect(migration).toContain(
      "Beschluss-Sammlung entry WEG does not match resolution WEG.",
    );
    expect(migration).toContain(
      "Beschluss-Sammlung entries for resolutions must be created by public.feststellen_resolution(uuid).",
    );
  });

  it("does not add unrelated historical uniqueness constraints", () => {
    expect(migration).not.toContain("resolution_one_per_top_idx");
  });

  it("hardens votes against wrong ownerships and post-finalization changes", () => {
    expect(migration).toContain(
      "before insert or update or delete on public.vote",
    );
    expect(migration).toContain(
      "Vote ownership does not belong to the meeting WEG.",
    );
    expect(migration).toContain(
      "Vote ownership is not active at the meeting reference date.",
    );
    expect(migration).toContain(
      "Votes cannot be inserted, changed, or deleted after the resolution has been festgestellt.",
    );
    expect(migration).toContain(
      "Votes can only be inserted, changed, or deleted while the meeting is laufend.",
    );
    expect(migration).toContain(
      "Vote tenant, resolution, and ownership references cannot be changed.",
    );
    expect(migration).toContain("for update of r");
    expect(migration).toContain("Vote validation requires a meeting date.");
  });

  it("requires a deterministic meeting date and does not ignore value voting", () => {
    expect(migration).toContain(
      "Resolution finalization requires a meeting date.",
    );
    expect(migration).toContain("v_stichtag := v_resolution.termin_von::date");
    expect(migration).toContain("v_ja_mea > v_nein_mea");
    expect(migration).toContain("v_ja_mea / (v_ja_mea + v_nein_mea)");
  });

  it("allocates future lfd_nr values per tenant and WEG", () => {
    expect(migration).toContain("alter column lfd_nr drop identity if exists");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("max(bse.lfd_nr), 0) + 1");
    expect(migration).toContain("bse.tenant_id = new.tenant_id");
    expect(migration).toContain("bse.weg_id = new.weg_id");
  });
});
