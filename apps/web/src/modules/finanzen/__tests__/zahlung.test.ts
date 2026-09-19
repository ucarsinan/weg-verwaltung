import { describe, expect, it } from "vitest";

import { pruefeZuordnungen, verteileAufAeltesteOffen } from "../zahlung";
import type { OffenerPosten } from "../zahlung";

const POSTEN: OffenerPosten[] = [
  {
    sollstellungId: "soll-jan",
    unitBezeichnung: "Whg 1",
    jahr: 2060,
    monat: 1,
    sollBetrag: 400,
    offenBetrag: 400,
  },
  {
    sollstellungId: "soll-feb",
    unitBezeichnung: "Whg 1",
    jahr: 2060,
    monat: 2,
    sollBetrag: 400,
    offenBetrag: 250,
  },
  {
    sollstellungId: "soll-maerz",
    unitBezeichnung: "Whg 1",
    jahr: 2060,
    monat: 3,
    sollBetrag: 400,
    offenBetrag: 0,
  },
];

describe("pruefeZuordnungen", () => {
  it("akzeptiert eine vollständig zugeordnete Zahlung", () => {
    const ergebnis = pruefeZuordnungen(650, POSTEN, [
      { sollstellungId: "soll-jan", betrag: 400 },
      { sollstellungId: "soll-feb", betrag: 250 },
    ]);

    expect(ergebnis).toEqual({ ok: true, summe: 650, restbetrag: 0 });
  });

  it("lässt einen Restbetrag zu — eine Zahlung muss nicht voll zugeordnet werden", () => {
    const ergebnis = pruefeZuordnungen(500, POSTEN, [
      { sollstellungId: "soll-jan", betrag: 400 },
    ]);

    expect(ergebnis).toEqual({ ok: true, summe: 400, restbetrag: 100 });
  });

  it("lehnt mehr ab, als der Posten noch offen hat", () => {
    const ergebnis = pruefeZuordnungen(500, POSTEN, [
      { sollstellungId: "soll-feb", betrag: 300 },
    ]);

    expect(ergebnis).toEqual({
      ok: false,
      fehler: {
        grund: "posten_ueberzahlt",
        sollstellungId: "soll-feb",
        offen: 250,
        gewuenscht: 300,
      },
    });
  });

  it("lehnt eine Summe über dem Zahlbetrag ab", () => {
    const ergebnis = pruefeZuordnungen(500, POSTEN, [
      { sollstellungId: "soll-jan", betrag: 400 },
      { sollstellungId: "soll-feb", betrag: 250 },
    ]);

    expect(ergebnis).toEqual({
      ok: false,
      fehler: { grund: "zahlung_ueberschritten", zahlbetrag: 500, summe: 650 },
    });
  });

  it("lehnt einen unbekannten Posten ab", () => {
    const ergebnis = pruefeZuordnungen(500, POSTEN, [
      { sollstellungId: "soll-fremd", betrag: 100 },
    ]);

    expect(ergebnis).toEqual({
      ok: false,
      fehler: { grund: "posten_unbekannt", sollstellungId: "soll-fremd" },
    });
  });

  it("lehnt eine Zuordnung ohne Betrag ab", () => {
    const ergebnis = pruefeZuordnungen(500, POSTEN, [
      { sollstellungId: "soll-jan", betrag: 0 },
    ]);

    expect(ergebnis).toEqual({ ok: false, fehler: { grund: "kein_betrag" } });
  });

  it("rechnet in Cent, damit Gleitkomma-Reste keine Grenze reißen", () => {
    const posten: OffenerPosten[] = [
      {
        sollstellungId: "soll-a",
        unitBezeichnung: "Whg 1",
        jahr: 2060,
        monat: 1,
        sollBetrag: 0.3,
        offenBetrag: 0.3,
      },
    ];

    // 0.1 + 0.2 ist in Gleitkomma 0.30000000000000004 — ohne Cent-Rundung
    // würde das als Überzahlung gelten.
    const ergebnis = pruefeZuordnungen(0.1 + 0.2, posten, [
      { sollstellungId: "soll-a", betrag: 0.1 + 0.2 },
    ]);

    expect(ergebnis.ok).toBe(true);
  });
});

describe("verteileAufAeltesteOffen", () => {
  it("bedient die ältesten Posten zuerst", () => {
    expect(verteileAufAeltesteOffen(650, POSTEN)).toEqual([
      { sollstellungId: "soll-jan", betrag: 400 },
      { sollstellungId: "soll-feb", betrag: 250 },
    ]);
  });

  it("erzeugt eine Teilzahlung, wenn der Betrag nicht reicht", () => {
    expect(verteileAufAeltesteOffen(500, POSTEN)).toEqual([
      { sollstellungId: "soll-jan", betrag: 400 },
      { sollstellungId: "soll-feb", betrag: 100 },
    ]);
  });

  it("überspringt bereits ausgeglichene Posten", () => {
    const verteilung = verteileAufAeltesteOffen(2000, POSTEN);

    expect(verteilung.map((w) => w.sollstellungId)).toEqual([
      "soll-jan",
      "soll-feb",
    ]);
  });

  it("ordnet nichts zu, wenn kein Posten offen ist", () => {
    const ausgeglichen = POSTEN.map((p) => ({ ...p, offenBetrag: 0 }));
    expect(verteileAufAeltesteOffen(500, ausgeglichen)).toEqual([]);
  });
});
