import { describe, expect, it } from "vitest";

import {
  DOC_TYP_LABEL,
  FRIST_HERKUNFT_LABEL,
  formatAufbewahrung,
  formatJahreLabel,
  istDauerhaft,
} from "../aufbewahrung";

describe("formatAufbewahrung", () => {
  it("nennt ein Fristende im deutschen Format", () => {
    expect(formatAufbewahrung("2027-12-31", "mandantenregel")).toBe(
      "bis 31.12.2027",
    );
  });

  it("sagt dauerhaft statt ein Datum zu erfinden, markiert es aber als Vorschlag beim gesetzlichen Rueckfall", () => {
    // Ein Rueckfall-"dauerhaft" (z. B. Protokoll/Beschluss) ist genauso ein
    // Systemvorschlag wie ein Rueckfall-Datum — ohne den Zusatz waere es von
    // einer bewusst gesetzten Mandantenregel "dauerhaft" nicht zu
    // unterscheiden.
    expect(formatAufbewahrung(null, "gesetzlicher_rueckfall")).toBe(
      "dauerhaft (Vorschlag)",
    );
  });

  it("laesst eine von der Mandantenregel gesetzte dauerhafte Aufbewahrung ohne Zusatz", () => {
    expect(formatAufbewahrung(null, "mandantenregel")).toBe("dauerhaft");
  });

  it("markiert den gesetzlichen Rueckfall als Vorschlag", () => {
    // Ein Rueckfallwert darf nicht aussehen wie eine Entscheidung des
    // Verwalters — sonst haelt er ihn fuer geprueft.
    expect(formatAufbewahrung("2027-12-31", "gesetzlicher_rueckfall")).toContain(
      "Vorschlag",
    );
  });

  it("bleibt zeitzonenunabhaengig, auch am Jahreswechsel", () => {
    // new Date("2027-01-01") liegt auf UTC-Mitternacht; in Zeitzonen
    // westlich von UTC wuerde toLocaleDateString auf den 31.12.2026
    // zurueckfallen. formatAufbewahrung parst das ISO-Datum als reinen
    // String und ist deshalb unabhaengig von der Serverzeitzone.
    expect(formatAufbewahrung("2027-01-01", "mandantenregel")).toBe(
      "bis 01.01.2027",
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

describe("formatJahreLabel", () => {
  // Fuer public.aufbewahrung_effektiv (0071): dort gibt es nur eine reine
  // Jahresangabe, kein aus einem Dokumentdatum abgeleitetes Enddatum — anders
  // als formatAufbewahrung oben, das ein absolutes Fristende formatiert.
  it("sagt dauerhaft statt eine Jahreszahl zu erfinden", () => {
    expect(formatJahreLabel(null)).toBe("dauerhaft");
  });

  it("formatiert eine Mehrzahl von Jahren", () => {
    expect(formatJahreLabel(8)).toBe("8 Jahre");
  });

  it("formatiert ein einzelnes Jahr im Singular", () => {
    expect(formatJahreLabel(1)).toBe("1 Jahr");
  });
});

describe("FRIST_HERKUNFT_LABEL", () => {
  it("benennt beide Herkuenfte unterscheidbar", () => {
    expect(FRIST_HERKUNFT_LABEL.mandantenregel).toBe("Mandantenregel");
    expect(FRIST_HERKUNFT_LABEL.gesetzlicher_rueckfall).toBe(
      "Gesetzlicher Rückfall",
    );
  });
});
