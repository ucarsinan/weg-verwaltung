import { describe, expect, it } from "vitest";

import {
  parseDokumentForm,
  parseLoescheDokumentForm,
  parseNeueVersionForm,
  parseRegelForm,
} from "../form";

function fd(entries: Record<string, string | File>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

const WEG_ID = "22222222-2222-4222-8222-222222222222";
const DOC_ID = "33333333-3333-4333-8333-333333333333";
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

describe("parseNeueVersionForm", () => {
  it("nimmt eine vollstaendige Eingabe an", () => {
    const r = parseNeueVersionForm(
      fd({ weg_id: WEG_ID, dokument_id: DOC_ID, datei: PDF }),
    );
    expect("input" in r).toBe(true);
    if ("input" in r) {
      expect(r.input).toEqual({ wegId: WEG_ID, dokumentId: DOC_ID, datei: PDF });
    }
  });

  it("verlangt eine Datei", () => {
    const r = parseNeueVersionForm(fd({ weg_id: WEG_ID, dokument_id: DOC_ID }));
    expect("errors" in r).toBe(true);
    if ("errors" in r) expect(r.errors.errors?.datei).toBeDefined();
  });

  it("lehnt eine zu grosse Datei ab, wie pruefeDatei es auch fuer den Erst-Upload tut", () => {
    const gross = new File(["x"], "gross.pdf", { type: "application/pdf" });
    Object.defineProperty(gross, "size", { value: 11 * 1024 * 1024 });

    const r = parseNeueVersionForm(
      fd({ weg_id: WEG_ID, dokument_id: DOC_ID, datei: gross }),
    );
    expect("errors" in r).toBe(true);
    if ("errors" in r) expect(r.errors.errors?.datei).toBeDefined();
  });

  it("lehnt eine ungueltige Dokument-ID ab, bevor eine Datenbank gefragt wird", () => {
    const r = parseNeueVersionForm(
      fd({ weg_id: WEG_ID, dokument_id: "nope", datei: PDF }),
    );
    expect("errors" in r).toBe(true);
    if ("errors" in r) expect(r.errors.errors?._form).toBeDefined();
  });
});

describe("parseRegelForm", () => {
  // Testfaelle wortgetreu aus dem Task-4-Brief — die Mehrdeutigkeit von "0"
  // ist der Kern dieser Funktion: Number("") ist 0, ohne die Leerstring-
  // Pruefung zuerst wuerde ein leeres Feld unbemerkt als "0 Jahre" durchgehen
  // und die Frist stillschweigend auf sofort setzen, statt auf dauerhaft.
  it("nimmt eine Jahreszahl an", () => {
    const r = parseRegelForm(fd({ doc_typ: "rechnung", jahre: "10" }));
    expect("input" in r).toBe(true);
    if ("input" in r) expect(r.input.jahre).toBe(10);
  });

  it("deutet ein leeres Feld als dauerhaft", () => {
    const r = parseRegelForm(fd({ doc_typ: "protokoll", jahre: "" }));
    expect("input" in r).toBe(true);
    if ("input" in r) expect(r.input.jahre).toBeNull();
  });

  it("lehnt 0 ab statt sie als dauerhaft zu deuten", () => {
    const r = parseRegelForm(fd({ doc_typ: "rechnung", jahre: "0" }));
    expect("errors" in r).toBe(true);
  });

  it("lehnt eine unsinnig lange Frist ab", () => {
    expect(
      "errors" in parseRegelForm(fd({ doc_typ: "rechnung", jahre: "500" })),
    ).toBe(true);
  });

  it("lehnt eine unbekannte Dokumentart ab", () => {
    const r = parseRegelForm(fd({ doc_typ: "quittung", jahre: "10" }));
    expect("errors" in r).toBe(true);
  });

  it("deutet fehlende Rechtsgrundlage/Notiz als null, nicht als leerer String", () => {
    const r = parseRegelForm(fd({ doc_typ: "rechnung", jahre: "10" }));
    expect("input" in r).toBe(true);
    if ("input" in r) {
      expect(r.input.rechtsgrundlage).toBeNull();
      expect(r.input.notiz).toBeNull();
    }
  });

  it("nimmt Rechtsgrundlage und Notiz an, wenn beide ausgefuellt sind", () => {
    const r = parseRegelForm(
      fd({
        doc_typ: "rechnung",
        jahre: "8",
        rechtsgrundlage: "§ 147 Abs. 3 Nr. 4 AO",
        notiz: "Standardfrist uebernommen",
      }),
    );
    expect("input" in r).toBe(true);
    if ("input" in r) {
      expect(r.input.rechtsgrundlage).toBe("§ 147 Abs. 3 Nr. 4 AO");
      expect(r.input.notiz).toBe("Standardfrist uebernommen");
    }
  });

  it("lehnt eine nicht-ganzzahlige Jahresangabe ab", () => {
    const r = parseRegelForm(fd({ doc_typ: "rechnung", jahre: "10.5" }));
    expect("errors" in r).toBe(true);
  });
});

describe("parseLoescheDokumentForm", () => {
  it("nimmt eine vollstaendige Eingabe an", () => {
    const r = parseLoescheDokumentForm(
      fd({ weg_id: WEG_ID, dokument_id: DOC_ID }),
    );
    expect(r).toEqual({ input: { wegId: WEG_ID, dokumentId: DOC_ID } });
  });

  it("lehnt eine ungueltige WEG-ID ab", () => {
    const r = parseLoescheDokumentForm(
      fd({ weg_id: "nope", dokument_id: DOC_ID }),
    );
    expect("errors" in r).toBe(true);
    if ("errors" in r) expect(r.errors.errors?._form).toBeDefined();
  });
});
