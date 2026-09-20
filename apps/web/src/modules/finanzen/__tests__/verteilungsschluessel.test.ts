import { describe, expect, it } from "vitest";

import {
  brauchtBasiswerte,
  brauchtTeile,
  isGeneratorUnterstuetzt,
  isVerteilungsschluesselRegelwerk,
  pruefeTeile,
} from "../verteilungsschluessel";
import type { TeilEingabe } from "../verteilungsschluessel";

/** Die 70/30-Regel aus dem pgTAP-Vertrag 0067. */
const HEIZUNG_70_30: TeilEingabe[] = [
  { typ: "verbrauch", gewicht: 70 },
  { typ: "flaeche", gewicht: 30 },
];

describe("brauchtTeile / brauchtBasiswerte", () => {
  it("trennt die beiden Wege, auf denen eine Regel gefüllt wird", () => {
    expect(brauchtTeile("gemischt")).toBe(true);
    expect(brauchtBasiswerte("gemischt")).toBe(false);

    expect(brauchtTeile("flaeche")).toBe(false);
    expect(brauchtBasiswerte("flaeche")).toBe(true);
  });

  it("hält seit 0067 jeden Typ für auflösbar", () => {
    expect(isGeneratorUnterstuetzt("gemischt")).toBe(true);
    expect(isGeneratorUnterstuetzt("mea")).toBe(true);
  });
});

describe("pruefeTeile — Summe", () => {
  it("nimmt 70/30 an", () => {
    expect(pruefeTeile(HEIZUNG_70_30, "heizkv_waerme")).toEqual({ ok: true });
  });

  it("lehnt eine Summe ungleich 100 ab und nennt sie", () => {
    const ergebnis = pruefeTeile(
      [
        { typ: "verbrauch", gewicht: 70 },
        { typ: "flaeche", gewicht: 20 },
      ],
      "frei",
    );

    expect(ergebnis.ok).toBe(false);
    if (!ergebnis.ok) expect(ergebnis.meldung).toContain("90");
  });

  it("lehnt eine leere Regel ab", () => {
    expect(pruefeTeile([], "frei").ok).toBe(false);
  });

  it("verkraftet Drittel ohne an einem Gleitkommarest zu scheitern", () => {
    // 3 × 33,333 = 99,999 — das ist wirklich nicht 100 und muss auffallen.
    const knapp = pruefeTeile(
      [
        { typ: "flaeche", gewicht: 33.333 },
        { typ: "einheit", gewicht: 33.333 },
        { typ: "mea", gewicht: 33.333 },
      ],
      "frei",
    );
    expect(knapp.ok).toBe(false);

    // 33,334 + 33,333 + 33,333 = 100,000 exakt.
    const genau = pruefeTeile(
      [
        { typ: "flaeche", gewicht: 33.334 },
        { typ: "einheit", gewicht: 33.333 },
        { typ: "mea", gewicht: 33.333 },
      ],
      "frei",
    );
    expect(genau).toEqual({ ok: true });
  });
});

describe("pruefeTeile — HeizkostenV", () => {
  it("lässt den Korridor 50 bis 70 zu", () => {
    expect(
      pruefeTeile(
        [
          { typ: "verbrauch", gewicht: 50 },
          { typ: "flaeche", gewicht: 50 },
        ],
        "heizkv_waerme",
      ),
    ).toEqual({ ok: true });
  });

  it("lehnt 80 Prozent nach Verbrauch ab", () => {
    const ergebnis = pruefeTeile(
      [
        { typ: "verbrauch", gewicht: 80 },
        { typ: "flaeche", gewicht: 20 },
      ],
      "heizkv_waerme",
    );

    expect(ergebnis.ok).toBe(false);
    if (!ergebnis.ok) expect(ergebnis.meldung).toContain("höchstens 70");
  });

  it("lehnt 40 Prozent nach Verbrauch ab", () => {
    expect(
      pruefeTeile(
        [
          { typ: "verbrauch", gewicht: 40 },
          { typ: "flaeche", gewicht: 60 },
        ],
        "heizkv_warmwasser",
      ).ok,
    ).toBe(false);
  });

  it("verlangt im Pflichtfall genau 70", () => {
    expect(pruefeTeile(HEIZUNG_70_30, "heizkv_waerme_70")).toEqual({ ok: true });

    const zuWenig = pruefeTeile(
      [
        { typ: "verbrauch", gewicht: 65 },
        { typ: "flaeche", gewicht: 35 },
      ],
      "heizkv_waerme_70",
    );
    expect(zuWenig.ok).toBe(false);
    if (!zuWenig.ok) expect(zuWenig.meldung).toContain("genau 70");
  });

  it("verlangt einen Verbrauchsteil", () => {
    const ergebnis = pruefeTeile(
      [
        { typ: "flaeche", gewicht: 70 },
        { typ: "einheit", gewicht: 30 },
      ],
      "heizkv_waerme",
    );

    expect(ergebnis.ok).toBe(false);
    if (!ergebnis.ok) expect(ergebnis.meldung).toContain("Verbrauch");
  });

  it("verlangt Fläche für den Rest, nicht irgendeinen Schlüssel", () => {
    const ergebnis = pruefeTeile(
      [
        { typ: "verbrauch", gewicht: 70 },
        { typ: "einheit", gewicht: 30 },
      ],
      "heizkv_waerme",
    );

    expect(ergebnis.ok).toBe(false);
    if (!ergebnis.ok) expect(ergebnis.meldung).toContain("Wohn- oder Nutzfläche");
  });

  it("lehnt einen dritten Teil ab", () => {
    expect(
      pruefeTeile(
        [
          { typ: "verbrauch", gewicht: 60 },
          { typ: "flaeche", gewicht: 30 },
          { typ: "einheit", gewicht: 10 },
        ],
        "heizkv_waerme",
      ).ok,
    ).toBe(false);
  });

  it("lässt eine freie Regel außerhalb des Korridors zu", () => {
    // Der Korridor gilt für Heizkosten, nicht für gemischte Regeln überhaupt.
    expect(
      pruefeTeile(
        [
          { typ: "flaeche", gewicht: 90 },
          { typ: "einheit", gewicht: 10 },
        ],
        "frei",
      ),
    ).toEqual({ ok: true });
  });
});

describe("isVerteilungsschluesselRegelwerk", () => {
  it("erkennt die vier Regelwerke und nichts sonst", () => {
    expect(isVerteilungsschluesselRegelwerk("heizkv_waerme_70")).toBe(true);
    expect(isVerteilungsschluesselRegelwerk("frei")).toBe(true);
    expect(isVerteilungsschluesselRegelwerk("heizkv_irgendwas")).toBe(false);
    expect(isVerteilungsschluesselRegelwerk(70)).toBe(false);
  });
});
