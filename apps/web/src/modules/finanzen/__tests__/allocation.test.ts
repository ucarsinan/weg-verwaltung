import { describe, expect, it } from "vitest";

import { berechneAnteile, berechneMonatsvorschau } from "../allocation";
import type { UnitMea } from "../allocation";

/** WEG deren MEA sich exakt auf 1 summieren. */
const UNITS_VOLL: UnitMea[] = [
  { id: "unit-a", meaZaehler: 400, meaNenner: 1000 },
  { id: "unit-b", meaZaehler: 600, meaNenner: 1000 },
];

/** WEG deren MEA sich nur auf 0.6 summieren (im Schema nicht verboten). */
const UNITS_UNVOLLSTAENDIG: UnitMea[] = [
  { id: "unit-a", meaZaehler: 300, meaNenner: 1000 },
  { id: "unit-b", meaZaehler: 300, meaNenner: 1000 },
];

function summeDerAnteile(ergebnis: ReturnType<typeof berechneAnteile>): number {
  if (!ergebnis.ok) throw new Error("Anteile wurden nicht berechnet.");
  return ergebnis.anteile.reduce((summe, a) => summe + a.anteil, 0);
}

describe("berechneAnteile", () => {
  it("verteilt nach MEA, wenn sich die MEA auf 1 summieren", () => {
    const ergebnis = berechneAnteile("mea", UNITS_VOLL);

    expect(ergebnis).toEqual({
      ok: true,
      anteile: [
        { unitId: "unit-a", anteil: 0.4 },
        { unitId: "unit-b", anteil: 0.6 },
      ],
    });
  });

  it("normalisiert MEA, die sich nicht auf 1 summieren, statt Geld unverteilt zu lassen", () => {
    const ergebnis = berechneAnteile("mea", UNITS_UNVOLLSTAENDIG);

    // Ohne Normalisierung waeren es 0.3 / 0.3 — 40 % des Betrags blieben offen.
    expect(ergebnis).toEqual({
      ok: true,
      anteile: [
        { unitId: "unit-a", anteil: 0.5 },
        { unitId: "unit-b", anteil: 0.5 },
      ],
    });
    expect(summeDerAnteile(ergebnis)).toBeCloseTo(1, 10);
  });

  it("verteilt bei typ=einheit gleichmaessig", () => {
    const ergebnis = berechneAnteile("einheit", UNITS_VOLL);

    expect(ergebnis).toEqual({
      ok: true,
      anteile: [
        { unitId: "unit-a", anteil: 0.5 },
        { unitId: "unit-b", anteil: 0.5 },
      ],
    });
  });

  it("verteilt nach Basiswerten und normalisiert auf deren Summe", () => {
    const ergebnis = berechneAnteile("flaeche", UNITS_VOLL, [
      { unitId: "unit-a", wert: 75 },
      { unitId: "unit-b", wert: 25 },
    ]);

    expect(ergebnis).toEqual({
      ok: true,
      anteile: [
        { unitId: "unit-a", anteil: 0.75 },
        { unitId: "unit-b", anteil: 0.25 },
      ],
    });
  });

  it("lehnt gemischt ab, statt eine Aufteilung zu raten", () => {
    expect(berechneAnteile("gemischt", UNITS_VOLL)).toEqual({
      ok: false,
      fehler: { grund: "gemischt_nicht_unterstuetzt" },
    });
  });

  it("nennt die Einheiten ohne Basiswert, statt teilweise zu verteilen", () => {
    const ergebnis = berechneAnteile("verbrauch", UNITS_VOLL, [
      { unitId: "unit-a", wert: 75 },
    ]);

    expect(ergebnis).toEqual({
      ok: false,
      fehler: { grund: "basiswerte_fehlen", fehlendeUnitIds: ["unit-b"] },
    });
  });

  it("lehnt eine Basiswert-Summe von 0 ab", () => {
    const ergebnis = berechneAnteile("manuell", UNITS_VOLL, [
      { unitId: "unit-a", wert: 0 },
      { unitId: "unit-b", wert: 0 },
    ]);

    expect(ergebnis).toEqual({
      ok: false,
      fehler: { grund: "basiswert_summe_nicht_positiv" },
    });
  });

  it("lehnt eine WEG ohne Einheiten ab", () => {
    expect(berechneAnteile("mea", [])).toEqual({
      ok: false,
      fehler: { grund: "keine_einheiten" },
    });
  });
});

describe("berechneMonatsvorschau", () => {
  it("rechnet Jahres- und Monatsbetrag wie der Generator (round(total / 12, 2))", () => {
    const anteile = [
      { unitId: "unit-a", anteil: 0.4 },
      { unitId: "unit-b", anteil: 0.6 },
    ];

    expect(berechneMonatsvorschau(12000, anteile)).toEqual([
      { unitId: "unit-a", jahresbetrag: 4800, monatsbetrag: 400 },
      { unitId: "unit-b", jahresbetrag: 7200, monatsbetrag: 600 },
    ]);
  });

  it("rundet den Monatsbetrag auf Cent", () => {
    const vorschau = berechneMonatsvorschau(1000, [
      { unitId: "unit-a", anteil: 1 / 3 },
    ]);

    // 1000 / 3 / 12 = 27.777... => 27.78
    expect(vorschau[0]?.monatsbetrag).toBe(27.78);
  });
});
