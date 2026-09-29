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

describe("0074 Beschlussgrundlage der Aktivierung", () => {
  const migration = readMigration(
    "0074_wirtschaftsplan_beschlussgrundlage.sql",
  );
  const executableSql = stripComments(migration).toLowerCase();

  it("verweist auf die Beschluss-Sammlung, nicht auf resolution", () => {
    // Der fachliche Kern: resolution.meeting_id ist not null, ein Verweis
    // darauf würde den Umlaufbeschluss nach § 23 Abs. 3 WEG strukturell
    // ausschließen.
    expect(executableSql).toContain(
      "references public.beschluss_sammlung_entry(tenant_id, id)",
    );
    expect(executableSql).not.toContain("references public.resolution");
    expect(executableSql).not.toContain("add column if not exists resolution_id");
  });

  it("lässt die Signatur (uuid) unverändert und legt keine Überladung an", () => {
    // Ein Parameter mit default erzeugt in Postgres eine Überladung. Genau der
    // Unfall steht seit 0047 in private._generate_sollstellungen_for_plan.
    expect(executableSql).toContain(
      "create or replace function public.activate_wirtschaftsplan(\n  p_wirtschaftsplan_id uuid\n)",
    );
    expect(executableSql).not.toContain("drop function");
    expect(executableSql).not.toContain("p_beschluss");
    expect(executableSql).toContain(
      "revoke all on function public.activate_wirtschaftsplan(uuid)",
    );
    expect(executableSql).toContain(
      "grant execute on function public.activate_wirtschaftsplan(uuid) to authenticated",
    );
  });

  it("hält die Spalte nullable, ohne Check über den Status", () => {
    // Ein not null oder ein Check status='aktiv' -> verweis is not null wäre auf
    // der Cloud nicht migrierbar und würde 0063/0064/0065 rot machen.
    expect(executableSql).toContain(
      "add column if not exists beschluss_sammlung_entry_id uuid",
    );
    expect(executableSql).not.toContain("beschluss_sammlung_entry_id uuid not null");
    expect(executableSql).not.toContain("beschluss_vollstaendig");
  });

  it("nimmt die neue Spalte in den Umschreibe-Schutz auf", () => {
    // Beide Listen des Triggers zählen ihre Spalten namentlich auf. Fehlt die
    // neue in einer, ist die Bindung an einem aktiven Plan austauschbar.
    const trigger = executableSql.slice(
      executableSql.indexOf("create trigger wirtschaftsplan_prevent_effective_rewrite"),
    );
    expect(trigger).toContain(
      "wirksam_ab_monat, beschluss_sammlung_entry_id",
    );
    expect(trigger).toContain(
      "old.beschluss_sammlung_entry_id is distinct from new.beschluss_sammlung_entry_id",
    );
  });

  it("prüft Zugehörigkeit und Zustimmung über eine Positivliste", () => {
    expect(executableSql).toContain(
      "v_beschluss.weg_id is distinct from v_plan.weg_id",
    );
    // Positivliste, damit ein künftiger vierter Typ nicht stillschweigend als
    // Grundlage durchgeht.
    expect(executableSql).toContain(
      "not in ('positiv_beschluss', 'umlaufbeschluss')",
    );
    expect(executableSql).not.toContain("= 'negativ_beschluss'");
  });

  it("prüft das Beschlussdatum NICHT gegen das Planjahr", () => {
    // Ein Beschluss darf spät gefasst werden, auch nach Ablauf des
    // Wirtschaftsjahres. Eine Datumsprüfung wäre fachlich falsch — diese
    // Zusicherung hält fest, dass sie niemand „nachbessert".
    expect(executableSql).not.toContain("v_beschluss.datum");
    expect(executableSql).not.toContain("extract(year from");
  });

  it("wirft für alle Beschluss-Ursachen 22023 und lässt den Generator in Ruhe", () => {
    expect(executableSql).toContain("errcode = '22023'");
    for (const forbidden of [
      "create or replace function private._generate_sollstellungen_for_plan",
      "create or replace function private._verteilungsschluessel_version_unit_shares",
      "alter table public.sollstellung",
      "alter table public.beschluss_sammlung_entry",
    ]) {
      expect(executableSql).not.toContain(forbidden);
    }
  });

  it("prüft die Beschlussgrundlage erst nach den Miteigentumsanteilen", () => {
    // Die Reihenfolge trägt die Aussagekraft der 0073-Verträge: deren
    // Negativfälle sollen weiter an der MEA-Sperre scheitern, nicht an der
    // Beschlussgrundlage.
    const meaIndex = executableSql.indexOf("v_mea_sum < 1 - v_epsilon");
    const beschlussIndex = executableSql.indexOf(
      "v_plan.beschluss_sammlung_entry_id is null",
    );
    expect(meaIndex).toBeGreaterThan(-1);
    expect(beschlussIndex).toBeGreaterThan(meaIndex);
  });

  it("lädt das PostgREST-Schema neu, weil die Spalte neu ist", () => {
    // Ohne Reload antwortet die API auf den Spaltennamen mit PGRST204.
    expect(executableSql).toContain("notify pgrst, 'reload schema'");
  });
});
