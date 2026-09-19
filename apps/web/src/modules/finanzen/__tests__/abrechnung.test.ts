import { describe, expect, it } from "vitest";

import { pruefeVerteilung, spitzenArt, summiereSpitzen } from "../abrechnung";
import type { SpitzeZeile } from "../abrechnung";

/** Whg A zahlt nach, Whg B bekommt zurück — wie im pgTAP-Vertrag. */
const ZEILEN: SpitzeZeile[] = [
  {
    unitId: "unit-a",
    unitBezeichnung: "Whg A",
    kostenanteil: 5000,
    sollVorschuesse: 4800,
    spitze: 200,
  },
  {
    unitId: "unit-b",
    unitBezeichnung: "Whg B",
    kostenanteil: 7000,
    sollVorschuesse: 7200,
    spitze: -200,
  },
];

describe("spitzenArt", () => {
  it("deutet eine positive Spitze als Nachschuss", () => {
    expect(spitzenArt(200)).toBe("nachschuss");
  });

  it("deutet eine negative Spitze als Guthaben", () => {
    expect(spitzenArt(-200)).toBe("guthaben");
  });

  it("deutet Null als ausgeglichen", () => {
    expect(spitzenArt(0)).toBe("ausgeglichen");
  });

  it("behandelt Gleitkomma-Reste als ausgeglichen, nicht als Nachschuss", () => {
    // 0.1 + 0.2 - 0.3 ist in Gleitkomma nicht exakt 0.
    expect(spitzenArt(0.1 + 0.2 - 0.3)).toBe("ausgeglichen");
  });
});

describe("summiereSpitzen", () => {
  it("trennt Nachschüsse und Guthaben und bildet den Saldo", () => {
    expect(summiereSpitzen(ZEILEN)).toEqual({
      nachschuesse: 200,
      guthaben: 200,
      saldo: 0,
    });
  });

  it("liefert für eine leere Abrechnung Nullen", () => {
    expect(summiereSpitzen([])).toEqual({
      nachschuesse: 0,
      guthaben: 0,
      saldo: 0,
    });
  });
});

describe("pruefeVerteilung", () => {
  it("akzeptiert eine exakte Verteilung", () => {
    expect(
      pruefeVerteilung({
        summeKostenpositionen: 12000,
        summeAnteile: 12000,
        anzahlEinheiten: 2,
        anzahlKostenpositionen: 2,
      }),
    ).toEqual({ ok: true });
  });

  it("toleriert Rundungsreste in Höhe eines Cents je Einheit und Position", () => {
    // 4 mögliche Rundungen, 3 Cent Abweichung — noch im Rahmen.
    expect(
      pruefeVerteilung({
        summeKostenpositionen: 12000,
        summeAnteile: 12000.03,
        anzahlEinheiten: 2,
        anzahlKostenpositionen: 2,
      }),
    ).toEqual({ ok: true });
  });

  it("meldet eine Abweichung, die über Rundung hinausgeht", () => {
    expect(
      pruefeVerteilung({
        summeKostenpositionen: 12000,
        summeAnteile: 11900,
        anzahlEinheiten: 2,
        anzahlKostenpositionen: 2,
      }),
    ).toEqual({ ok: false, differenz: -100 });
  });
});
