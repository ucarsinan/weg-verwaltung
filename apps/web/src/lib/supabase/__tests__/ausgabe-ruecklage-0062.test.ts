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

describe("0062 Ausgaben und Erhaltungsrücklage", () => {
  const migration = readMigration("0062_ausgabe_und_ruecklage.sql");
  const executableSql = stripComments(migration).toLowerCase();

  it("is purely additive — it touches no existing table", () => {
    for (const forbidden of [
      "alter table public.sollstellung",
      "alter table public.zahlung",
      "alter table public.wirtschaftsplan",
      "alter table public.verteilungsschluessel",
      "drop table",
    ]) {
      expect(executableSql).not.toContain(forbidden);
    }
  });

  it("forces every expense to carry an allocation key", () => {
    // Ohne Schlüssel liesse sich die Ausgabe in der Jahresabrechnung nicht
    // verteilen — deshalb not null, nicht optional.
    expect(migration).toContain(
      "verteilungsschluessel_version_id  uuid not null",
    );
  });

  it("checks an Entnahme against the balance at its own value date", () => {
    // Die Stichtagsbetrachtung ist der Kern: eine Gesamtsumme würde eine
    // Entnahme durchlassen, die erst durch spätere Zuführungen gedeckt wäre.
    expect(migration).toContain("b.datum <= new.datum");
    expect(migration).toContain("if v_bestand - new.betrag < 0 then");
    expect(migration).toContain("errcode = '23514'");
  });

  it("excludes the row being written from its own balance check", () => {
    expect(migration).toContain("b.id is distinct from new.id");
  });

  it("allows exactly one opening balance per WEG", () => {
    expect(migration).toContain(
      "create unique index if not exists ruecklage_bewegung_eine_eroeffnung_idx",
    );
    expect(migration).toContain("where richtung = 'anfangsbestand'");
  });

  it("rejects cross-WEG allocation keys and cross-WEG linked expenses", () => {
    expect(migration).toContain("v_key_weg_id is distinct from new.weg_id");
    expect(migration).toContain("v_ausgabe_weg_id is distinct from new.weg_id");
  });

  it("blocks agent writes and emits audit events on both tables", () => {
    for (const table of ["ausgabe", "ruecklage_bewegung"]) {
      expect(migration).toContain(`create trigger ${table}_block_agent_writes`);
      expect(migration).toContain(`create trigger ${table}_audit_emit`);
    }
    expect(migration).toContain(
      "execute function public.tg_finance_allocation_block_agent_writes()",
    );
  });

  it("enables and forces RLS on both tables", () => {
    for (const table of ["ausgabe", "ruecklage_bewegung"]) {
      expect(migration).toContain(
        `alter table public.${table} enable row level security`,
      );
      expect(migration).toContain(
        `alter table public.${table} force row level security`,
      );
    }
  });

  it("derives the reserve balance through a security_invoker view", () => {
    expect(migration).toContain(
      "create or replace view public.ruecklage_entwicklung",
    );
    expect(migration).toContain("with (security_invoker = on)");
    // Kein gespeicherter Bestand als Spalte — sonst könnten Ledger und Saldo
    // auseinanderlaufen. Die PL/pgSQL-Variable `v_bestand` ist etwas anderes,
    // deshalb der Zeilenanfang im Muster.
    expect(migration).not.toMatch(/^\s+bestand\s+numeric/m);
  });

  it("keeps the opening balance out of the year's Zuführungen", () => {
    // anfangsbestand = Endbestand − Zuführungen + Entnahmen, damit ein
    // eingebuchter Eröffnungsbestand im Anfang seines eigenen Jahres steht.
    expect(migration).toContain("- zufuehrungen + entnahmen)::numeric(12, 2) as anfangsbestand");
  });

  it("keeps `camt` available so the import slice needs no migration", () => {
    expect(migration).toContain("check (quelle in ('manuell', 'camt'))");
  });
});
