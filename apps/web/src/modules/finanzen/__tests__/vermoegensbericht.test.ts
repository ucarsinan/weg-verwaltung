import { describe, expect, it } from "vitest";

import {
  berechneNettovermoegen,
  offeneAbschnitte,
  summiereAbschnitt,
  summiereAlleAbschnitte,
} from "../vermoegensbericht";
import type { BerichtsPosition } from "../vermoegensbericht";

/** Ein vollstaendiger Bericht, wie ihn der pgTAP-Vertrag 0065 erzeugt. */
const POSITIONEN: BerichtsPosition[] = [
  {
    abschnitt: "konto",
    bezeichnung: "Girokonto",
    betragAnfang: 2500,
    betrag: 3479,
  },
  {
    abschnitt: "konto",
    bezeichnung: "Tagesgeld",
    betragAnfang: 18590,
    betrag: 11100,
  },
  {
    abschnitt: "ruecklage",
    bezeichnung: "Erhaltungsrücklage",
    betragAnfang: 1000,
    betrag: 1300,
  },
  {
    abschnitt: "forderung",
    bezeichnung: "Rückständige Hausgeldvorschüsse Whg A",
    betragAnfang: null,
    betrag: 4400,
  },
  {
    abschnitt: "forderung",
    bezeichnung: "Nachschuss Jahresabrechnung 2090 Whg A",
    betragAnfang: null,
    betrag: 200,
  },
  {
    abschnitt: "verbindlichkeit",
    bezeichnung: "Guthaben Jahresabrechnung 2090 Whg B",
    betragAnfang: null,
    betrag: 200,
  },
  {
    // Genannt, nicht bewertet — der Fall, um den sich dieses Modul dreht.
    abschnitt: "sachwert",
    bezeichnung: "Aufsitzrasenmäher",
    betragAnfang: null,
    betrag: null,
  },
];

describe("summiereAbschnitt", () => {
  it("summiert die Konten", () => {
    expect(summiereAbschnitt(POSITIONEN, "konto").summe).toBe(14579);
  });

  it("zählt eine Position ohne Betrag mit, summiert sie aber nicht als Null", () => {
    const sachwerte = summiereAbschnitt(POSITIONEN, "sachwert");

    expect(sachwerte.anzahl).toBe(1);
    expect(sachwerte.anzahlOhneBetrag).toBe(1);
    expect(sachwerte.summe).toBe(0);
  });

  it("liefert einen leeren Abschnitt ohne Positionen zurück", () => {
    const leer = summiereAbschnitt([], "forderung");

    expect(leer.anzahl).toBe(0);
    expect(leer.anzahlOhneBetrag).toBe(0);
    expect(leer.summe).toBe(0);
  });

  it("rundet auf Cent, statt Gleitkommareste durchzureichen", () => {
    const krumm: BerichtsPosition[] = [
      {
        abschnitt: "forderung",
        bezeichnung: "A",
        betragAnfang: null,
        betrag: 0.1,
      },
      {
        abschnitt: "forderung",
        bezeichnung: "B",
        betragAnfang: null,
        betrag: 0.2,
      },
    ];

    expect(summiereAbschnitt(krumm, "forderung").summe).toBe(0.3);
  });
});

describe("summiereAlleAbschnitte", () => {
  it("liefert alle fünf Abschnitte in der Reihenfolge des Berichts", () => {
    expect(summiereAlleAbschnitte(POSITIONEN).map((s) => s.abschnitt)).toEqual([
      "konto",
      "ruecklage",
      "forderung",
      "verbindlichkeit",
      "sachwert",
    ]);
  });
});

describe("berechneNettovermoegen", () => {
  it("rechnet Konten plus Forderungen minus Verbindlichkeiten", () => {
    // 14.579 + 4.600 − 200
    expect(berechneNettovermoegen(POSITIONEN)).toBe(18979);
  });

  it("zählt die Rücklage nicht zusätzlich — sie liegt auf den Konten", () => {
    const ohneRuecklage = POSITIONEN.filter((p) => p.abschnitt !== "ruecklage");

    expect(berechneNettovermoegen(ohneRuecklage)).toBe(
      berechneNettovermoegen(POSITIONEN),
    );
  });

  it("lässt unbewertete Sachwerte außen vor", () => {
    const ohneSachwert = POSITIONEN.filter((p) => p.abschnitt !== "sachwert");

    expect(berechneNettovermoegen(ohneSachwert)).toBe(
      berechneNettovermoegen(POSITIONEN),
    );
  });
});

describe("offeneAbschnitte", () => {
  it("meldet nichts, wenn alle manuellen Abschnitte gefüllt sind", () => {
    expect(offeneAbschnitte(POSITIONEN)).toEqual([]);
  });

  it("meldet die manuell zu füllenden Abschnitte eines frischen Entwurfs", () => {
    // So sieht ein Bericht direkt nach dem Erstellen aus: nur Abgeleitetes.
    const frisch = POSITIONEN.filter(
      (p) => p.abschnitt === "ruecklage" || p.abschnitt === "forderung",
    );

    expect(offeneAbschnitte(frisch)).toEqual([
      "konto",
      "verbindlichkeit",
      "sachwert",
    ]);
  });

  it("meldet abgeleitete Abschnitte nicht — die füllt niemand von Hand", () => {
    expect(offeneAbschnitte([])).not.toContain("ruecklage");
    expect(offeneAbschnitte([])).not.toContain("forderung");
  });
});
