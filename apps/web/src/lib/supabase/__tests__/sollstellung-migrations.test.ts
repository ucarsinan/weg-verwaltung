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

describe("Sollstellung ledger migrations", () => {
  const migration0039 = readMigration(
    "0039_sollstellung_recalculation_triggers.sql",
  );
  const migration0040 = readMigration("0040_lock_down_sollstellung_writes.sql");
  const migration0042 = readMigration("0042_security_hotfix_0039_0040.sql");
  const migration0047 = readMigration("0047_wirtschaftsplan_lifecycle.sql");

  it("0039 generates initial ledger rows without rewriting historical rows", () => {
    expect(migration0039).toContain("on delete restrict");
    expect(migration0039).toContain(
      "buchungstyp text not null default 'initial'",
    );
    expect(migration0039).toContain("where buchungstyp = 'initial'");
    expect(migration0039).toContain("for update");
    expect(migration0039).toContain("do nothing");
    expect(migration0039).not.toMatch(/on conflict[\s\S]*do update/i);
    expect(migration0039).not.toMatch(/delete\s+from\s+public\.sollstellung/i);
  });

  it("0039 keeps the public RPC tenant-checked and unavailable to service_role", () => {
    expect(migration0039).toContain("v_request_tenant_id is null");
    expect(migration0039).toContain(
      "v_tenant_id is distinct from v_request_tenant_id",
    );
    expect(migration0039).toContain("Agents cannot generate Sollstellungen.");
    expect(migration0039).not.toContain("pg_catalog.coalesce");
    expect(migration0039).toContain(
      "revoke execute on function public.generate_sollstellungen(uuid) from service_role",
    );
  });

  it("0039 keeps the internal generator outside the public RPC surface", () => {
    expect(migration0039).toContain(
      "create or replace function private._generate_sollstellungen_for_plan",
    );
    expect(migration0039).toContain(
      "drop function if exists public._generate_sollstellungen_for_plan(uuid)",
    );
    expect(migration0039).toContain(
      "from public, anon, authenticated, service_role",
    );
    expect(migration0039).not.toContain(
      "create or replace function public._generate_sollstellungen_for_plan",
    );
  });

  it("0040 blocks direct writes without granting generated writes to public", () => {
    expect(migration0040).toContain(
      "revoke insert, update, delete on public.sollstellung",
    );
    expect(migration0040).toContain(
      "create trigger sollstellung_enforce_insert_only",
    );
    expect(migration0040).toContain(
      "Direct writes to Sollstellungen are not allowed.",
    );
    expect(migration0040).not.toMatch(
      /on public\.sollstellung for (insert|update|delete) to public/i,
    );
  });

  it("0040 blocks indirect rewrites through Wirtschaftsplan and Unit changes", () => {
    expect(migration0040).toContain(
      "create trigger wirtschaftsplan_prevent_posted_rewrite_update",
    );
    expect(migration0040).toContain(
      "before update of weg_id, jahr, gesamtkosten on public.wirtschaftsplan",
    );
    expect(migration0040).toContain(
      "create trigger unit_prevent_posted_mea_rewrite_update",
    );
    expect(migration0040).toContain(
      "before update of weg_id, mea_zaehler, mea_nenner on public.unit",
    );
  });

  it("0042 applies the cloud hotfix without re-opening public/internal RPC access", () => {
    expect(migration0042).toContain(
      "create or replace function private._generate_sollstellungen_for_plan",
    );
    expect(migration0042).toContain(
      "drop function if exists public._generate_sollstellungen_for_plan(uuid)",
    );
    expect(migration0042).toContain(
      "revoke all on function private._generate_sollstellungen_for_plan(uuid)",
    );
    expect(migration0042).toContain(
      "revoke all on function public.generate_sollstellungen(uuid)",
    );
    expect(migration0042).toContain(
      "grant execute on function public.generate_sollstellungen(uuid) to authenticated",
    );
    expect(migration0042).not.toContain("pg_catalog.coalesce");
  });

  it("0042 makes audit HMAC fail closed instead of falling back", () => {
    expect(migration0042).toContain("select decrypted_secret");
    expect(migration0042).toContain("extensions.hmac(v_input, v_key, 'sha256')");
    expect(migration0042).toContain("DO NOT SHIP TO PROD");
    expect(migration0042).not.toMatch(/falling back to unkeyed sha256/i);
    expect(migration0042).not.toMatch(/pg_catalog\.sha256\(v_input\)/i);
    expect(migration0042).not.toContain("decoded_secret");
  });

  it("0047 introduces an explicit Wirtschaftsplan lifecycle", () => {
    expect(migration0047).toContain("status text not null default 'entwurf'");
    expect(migration0047).toContain(
      "status in ('entwurf', 'aktiv', 'abgeloest', 'archiviert')",
    );
    expect(migration0047).toContain("aktiviert_am timestamptz");
    expect(migration0047).toContain("abgeloest_am timestamptz");
    expect(migration0047).toContain("archiviert_am timestamptz");
    expect(migration0047).toContain("version_nr integer not null default 1");
    expect(migration0047).toContain("vorgaenger_wirtschaftsplan_id uuid");
    expect(migration0047).toContain("wirksam_ab_monat integer");
  });

  it("0047 allows multiple drafts but only one active plan per WEG year", () => {
    expect(migration0047).toContain(
      "drop constraint if exists wirtschaftsplan_tenant_id_weg_id_jahr_key",
    );
    expect(migration0047).toContain(
      "create unique index wirtschaftsplan_one_active_per_year_idx",
    );
    expect(migration0047).toContain("where status = 'aktiv'");
    expect(migration0047).toContain(
      "create unique index wirtschaftsplan_effective_version_idx",
    );
    expect(migration0047).toContain("where status <> 'entwurf'");
  });

  it("0047 disables insert-time generation and closes the old public generator RPC", () => {
    expect(migration0047).toContain(
      "drop trigger if exists wirtschaftsplan_generate_missing_sollstellungen",
    );
    expect(migration0047).toContain(
      "drop function if exists public.tg_wirtschaftsplan_generate_missing_sollstellungen()",
    );
    expect(migration0047).toContain(
      "Sollstellungen are generated only by activate_wirtschaftsplan().",
    );
    expect(migration0047).toContain(
      "revoke all on function public.generate_sollstellungen(uuid)",
    );
    expect(migration0047).not.toMatch(
      /create trigger wirtschaftsplan_generate_missing_sollstellungen/i,
    );
  });

  it("0047 activation serializes WEG/year, replaces active plans, and posts rows transactionally", () => {
    expect(migration0047).toContain(
      "create or replace function public.activate_wirtschaftsplan",
    );
    expect(migration0047).toContain("Agents cannot activate Wirtschaftspläne.");
    expect(migration0047).toContain("pg_advisory_xact_lock");
    expect(migration0047).toContain("set status = 'abgeloest'");
    expect(migration0047).toContain("set status = 'aktiv'");
    expect(migration0047).toContain(
      "private._generate_sollstellungen_for_plan(v_plan.id, v_start_month)",
    );
    expect(migration0047).toContain(
      "grant execute on function public.activate_wirtschaftsplan(uuid) to authenticated",
    );
  });

  it("0047 prevents direct lifecycle changes and effective plan rewrites", () => {
    expect(migration0047).toContain(
      "create trigger wirtschaftsplan_lifecycle_guard_update",
    );
    expect(migration0047).toContain(
      "Wirtschaftsplan lifecycle transitions must use lifecycle RPCs.",
    );
    expect(migration0047).toContain(
      "create trigger wirtschaftsplan_prevent_effective_rewrite",
    );
    expect(migration0047).toContain(
      "Effective Wirtschaftspläne cannot be rewritten.",
    );
  });
});
