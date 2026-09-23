import { describe, expect, it } from "vitest";

import { parseDokumentForm } from "../form";

function fd(entries: Record<string, string | File>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

const PDF = new File(["inhalt"], "wartung.pdf", { type: "application/pdf" });

describe("parseDokumentForm", () => {
  it("nimmt eine vollstaendige Eingabe an", () => {
    const r = parseDokumentForm(
      fd({
        weg_id: "22222222-2222-4222-8222-222222222222",
        titel: "Heizungswartung 2019",
        doc_typ: "rechnung",
        dokument_datum: "2019-03-15",
        datei: PDF,
      }),
    );
    expect("input" in r).toBe(true);
  });

  it("verlangt ein Dokumentdatum", () => {
    // Ohne Datum waere die Aufbewahrungsfrist falsch — deshalb Pflicht, und
    // die Meldung kommt aus dem Formular, nicht als 23502 aus der Datenbank.
    const r = parseDokumentForm(
      fd({
        weg_id: "22222222-2222-4222-8222-222222222222",
        titel: "Ohne Datum",
        doc_typ: "rechnung",
        dokument_datum: "",
        datei: PDF,
      }),
    );
    expect("errors" in r).toBe(true);
    if ("errors" in r) expect(r.errors.errors?.dokument_datum).toBeDefined();
  });

  it("lehnt ein Datum in der Zukunft ab", () => {
    const morgen = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const r = parseDokumentForm(
      fd({
        weg_id: "22222222-2222-4222-8222-222222222222",
        titel: "Von morgen",
        doc_typ: "rechnung",
        dokument_datum: morgen,
        datei: PDF,
      }),
    );
    expect("errors" in r).toBe(true);
  });

  it("lehnt eine unbekannte Dokumentart ab", () => {
    const r = parseDokumentForm(
      fd({
        weg_id: "22222222-2222-4222-8222-222222222222",
        titel: "Falsche Art",
        doc_typ: "quittung",
        dokument_datum: "2019-03-15",
        datei: PDF,
      }),
    );
    expect("errors" in r).toBe(true);
  });

  it("verlangt eine Datei", () => {
    const r = parseDokumentForm(
      fd({
        weg_id: "22222222-2222-4222-8222-222222222222",
        titel: "Ohne Datei",
        doc_typ: "rechnung",
        dokument_datum: "2019-03-15",
      }),
    );
    expect("errors" in r).toBe(true);
  });
});
