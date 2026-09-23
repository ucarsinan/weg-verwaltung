import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { MAX_UPLOAD_BYTES } from "@/modules/dokumente";

const migrationsDir = path.resolve(
  process.cwd(),
  "../../infra/supabase/migrations",
);

function readMigration(filename: string) {
  return readFileSync(path.join(migrationsDir, filename), "utf-8");
}

describe("0070 weg-docs Bucket-Grenze", () => {
  const migration = readMigration("0070_weg_docs_bucket_limit.sql");

  it("hat den vorgeschriebenen Migrations-Header", () => {
    expect(migration).toMatch(/^-- WEG-Verwaltung migration 0070: /);
  });

  it("aendert ausschliesslich den Bucket weg-docs", () => {
    expect(migration).toContain("update storage.buckets");
    expect(migration).toMatch(/where\s+id\s*=\s*'weg-docs'/);
    // Keine andere Tabelle wird angefasst — die Migration ist ausdruecklich
    // nur eine Grenzangleichung, kein Schema-Wechsel.
    expect(migration).not.toMatch(/alter table|create table|drop table/i);
  });

  it("setzt file_size_limit exakt auf MAX_UPLOAD_BYTES", () => {
    // Dieselbe Zahl soll an drei Stellen stehen: next.config.ts,
    // modules/dokumente/upload.ts und hier. Der Test vergleicht gegen die
    // tatsaechliche Konstante statt gegen ein zweites Literal — sonst
    // koennten beide Stellen unbemerkt auseinanderlaufen.
    expect(MAX_UPLOAD_BYTES).toBe(10_485_760);
    expect(migration).toMatch(
      new RegExp(`file_size_limit\\s*=\\s*${MAX_UPLOAD_BYTES}\\b`),
    );
  });
});
