import { describe, expect, it } from "vitest";

import {
  berechneEntwicklung,
  bestandZumStichtag,
  pruefeEntnahme,
} from "../ausgabe";
import type { RuecklagenBewegung } from "../ausgabe";

/** Eröffnung 10.000; 2060 +2.000 / −500; 2061 +3.000 — wie im pgTAP-Vertrag. */
const BEWEGUNGEN: RuecklagenBewegung[] = [
  { datum: "2060-01-01", betrag: 10000, richtung: "anfangsbestand" },
  { datum: "2060-06-01", betrag: 2000, richtung: "zufuehrung" },
  { datum: "2060-09-01", betrag: 500, richtung: "entnahme" },
  { datum: "2061-06-01", betrag: 3000, richtung: "zufuehrung" },
];

describe("berechneEntwicklung", () => {
  it("liefert die vier Größen aus § 28 Abs. 2 je Jahr", () => {
    expect(berechneEntwicklung(BEWEGUNGEN)).toEqual([
      {
        jahr: 2060,
        anfangsbestand: 10000,
        zufuehrungen: 2000,
        entnahmen: 500,
        endbestand: 11500,
      },
      {
        jahr: 2061,
        anfangsbestand: 11500,
        zufuehrungen: 3000,
        entnahmen: 0,
        endbestand: 14500,
      },
    ]);
  });

  it("zählt den Eröffnungsbestand in den Anfangsbestand, nicht in die Zuführungen", () => {
    const [erstesJahr] = berechneEntwicklung(BEWEGUNGEN);

    expect(erstesJahr?.anfangsbestand).toBe(10000);
    expect(erstesJahr?.zufuehrungen).toBe(2000);
  });

  it("überspringt Jahre ohne Bewegung, statt sie mit Nullen zu füllen", () => {
    const mitLuecke: RuecklagenBewegung[] = [
      { datum: "2060-01-01", betrag: 1000, richtung: "anfangsbestand" },
      { datum: "2063-01-01", betrag: 500, richtung: "zufuehrung" },
    ];

    expect(berechneEntwicklung(mitLuecke).map((j) => j.jahr)).toEqual([
      2060, 2063,
    ]);
    expect(berechneEntwicklung(mitLuecke)[1]?.anfangsbestand).toBe(1000);
  });

  it("liefert für eine leere Rücklage keine Zeilen", () => {
    expect(berechneEntwicklung([])).toEqual([]);
  });
});

describe("bestandZumStichtag", () => {
  it("berücksichtigt nur Bewegungen bis zum Stichtag", () => {
    expect(bestandZumStichtag(BEWEGUNGEN, "2060-02-01")).toBe(10000);
    expect(bestandZumStichtag(BEWEGUNGEN, "2060-06-01")).toBe(12000);
    expect(bestandZumStichtag(BEWEGUNGEN, "2061-12-31")).toBe(14500);
  });
});

describe("pruefeEntnahme", () => {
  it("lässt eine gedeckte Entnahme zu", () => {
    expect(
      pruefeEntnahme(BEWEGUNGEN, { datum: "2061-07-01", betrag: 1000 }),
    ).toEqual({ ok: true, bestandDanach: 13500 });
  });

  it("lehnt eine Entnahme ab, die erst durch eine spätere Zuführung gedeckt wäre", () => {
    // Gesamtbestand ist am Ende 14.500 — zum 01.02.2060 aber erst 10.000.
    expect(
      pruefeEntnahme(BEWEGUNGEN, { datum: "2060-02-01", betrag: 11000 }),
    ).toEqual({ ok: false, verfuegbar: 10000 });
  });

  it("lehnt eine Entnahme über den Gesamtbestand hinaus ab", () => {
    expect(
      pruefeEntnahme(BEWEGUNGEN, { datum: "2061-07-01", betrag: 20000 }),
    ).toEqual({ ok: false, verfuegbar: 14500 });
  });

  it("lässt eine Entnahme in exakter Höhe des Bestands zu", () => {
    expect(
      pruefeEntnahme(BEWEGUNGEN, { datum: "2061-07-01", betrag: 14500 }),
    ).toEqual({ ok: true, bestandDanach: 0 });
  });

  it("rechnet in Cent, damit Gleitkomma-Reste keine Grenze reißen", () => {
    const klein: RuecklagenBewegung[] = [
      { datum: "2060-01-01", betrag: 0.3, richtung: "anfangsbestand" },
    ];

    // 0.1 + 0.2 ist 0.30000000000000004 — ohne Cent-Rundung wäre das zu viel.
    expect(
      pruefeEntnahme(klein, { datum: "2060-05-01", betrag: 0.1 + 0.2 }).ok,
    ).toBe(true);
  });
});
