import { describe, expect, it } from "vitest";

import { DOC_TYP_LABEL, formatAufbewahrung, istDauerhaft } from "../aufbewahrung";

describe("formatAufbewahrung", () => {
  it("nennt ein Fristende im deutschen Format", () => {
    expect(formatAufbewahrung("2027-12-31", "mandantenregel")).toBe(
      "bis 31.12.2027",
    );
  });

  it("sagt dauerhaft statt ein Datum zu erfinden", () => {
    expect(formatAufbewahrung(null, "gesetzlicher_rueckfall")).toBe("dauerhaft");
  });

  it("markiert den gesetzlichen Rueckfall als Vorschlag", () => {
    // Ein Rueckfallwert darf nicht aussehen wie eine Entscheidung des
    // Verwalters — sonst haelt er ihn fuer geprueft.
    expect(formatAufbewahrung("2027-12-31", "gesetzlicher_rueckfall")).toContain(
      "Vorschlag",
    );
  });
});

describe("istDauerhaft", () => {
  it("erkennt dauerhafte Aufbewahrung am fehlenden Fristende", () => {
    expect(istDauerhaft(null)).toBe(true);
    expect(istDauerhaft("2027-12-31")).toBe(false);
  });
});

describe("DOC_TYP_LABEL", () => {
  it("benennt alle sieben Arten", () => {
    expect(Object.keys(DOC_TYP_LABEL)).toHaveLength(7);
    expect(DOC_TYP_LABEL.rechnung).toBe("Rechnung");
  });
});
