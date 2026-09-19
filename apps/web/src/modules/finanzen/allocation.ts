/**
 * Anteils-Berechnung fuer die UI-Vorschau.
 *
 * Spiegelt bewusst 1:1 die Semantik von
 * `private._verteilungsschluessel_version_unit_shares` (Migration 0060),
 * damit die Vorschau im Formular dieselben Zahlen zeigt wie die spaetere
 * Sollstellung — inklusive derselben Fail-Closed-Faelle.
 *
 * WICHTIG: Autoritativ ist immer die Datenbank. Postgres rechnet in `numeric`
 * (exakte Dezimalarithmetik), JavaScript in `double`. Fuer eine Vorschau in
 * Cent-Groessenordnung ist das unerheblich, fuer die Buchung nicht — deshalb
 * berechnet diese Datei nie etwas, das gespeichert wird.
 */

import type { VerteilungsschluesselTyp } from "@/lib/supabase/database.types";

export interface UnitMea {
  id: string;
  meaZaehler: number;
  meaNenner: number;
}

export interface Basiswert {
  unitId: string;
  wert: number;
}

export interface UnitAnteil {
  unitId: string;
  anteil: number;
}

export type AnteilsFehler =
  | { grund: "gemischt_nicht_unterstuetzt" }
  | { grund: "keine_einheiten" }
  | { grund: "basiswerte_fehlen"; fehlendeUnitIds: string[] }
  | { grund: "basiswert_summe_nicht_positiv" };

export type AnteilsErgebnis =
  | { ok: true; anteile: UnitAnteil[] }
  | { ok: false; fehler: AnteilsFehler };

/**
 * Anteile je Einheit fuer eine einzelne Schluesselversion.
 *
 * `mea` wird — wie in 0060 — auf die MEA-Summe der WEG normalisiert. Nichts im
 * Schema erzwingt, dass sich die MEA einer WEG auf 1 summieren; ohne
 * Normalisierung bliebe ein Teil des Positionsbetrags unverteilt.
 */
export function berechneAnteile(
  typ: VerteilungsschluesselTyp,
  units: readonly UnitMea[],
  basiswerte: readonly Basiswert[] = [],
): AnteilsErgebnis {
  if (typ === "gemischt") {
    return { ok: false, fehler: { grund: "gemischt_nicht_unterstuetzt" } };
  }

  if (units.length === 0) {
    return { ok: false, fehler: { grund: "keine_einheiten" } };
  }

  if (typ === "mea") {
    const meaSumme = units.reduce(
      (summe, unit) => summe + unit.meaZaehler / unit.meaNenner,
      0,
    );

    if (!(meaSumme > 0)) {
      return { ok: false, fehler: { grund: "basiswert_summe_nicht_positiv" } };
    }

    return {
      ok: true,
      anteile: units.map((unit) => ({
        unitId: unit.id,
        anteil: unit.meaZaehler / unit.meaNenner / meaSumme,
      })),
    };
  }

  if (typ === "einheit") {
    return {
      ok: true,
      anteile: units.map((unit) => ({
        unitId: unit.id,
        anteil: 1 / units.length,
      })),
    };
  }

  // flaeche | verbrauch | manuell
  const werte = new Map(basiswerte.map((b) => [b.unitId, b.wert]));
  const fehlendeUnitIds = units
    .filter((unit) => !werte.has(unit.id))
    .map((unit) => unit.id);

  if (fehlendeUnitIds.length > 0) {
    return { ok: false, fehler: { grund: "basiswerte_fehlen", fehlendeUnitIds } };
  }

  const summe = units.reduce((acc, unit) => acc + (werte.get(unit.id) ?? 0), 0);

  if (!(summe > 0)) {
    return { ok: false, fehler: { grund: "basiswert_summe_nicht_positiv" } };
  }

  return {
    ok: true,
    anteile: units.map((unit) => ({
      unitId: unit.id,
      anteil: (werte.get(unit.id) ?? 0) / summe,
    })),
  };
}

export interface MonatsvorschauZeile {
  unitId: string;
  jahresbetrag: number;
  monatsbetrag: number;
}

/**
 * Jahres- und Monatsbetrag je Einheit fuer einen Positionsbetrag.
 *
 * Rundet wie 0060 auf Cent (`round(total / 12, 2)`). Zwoelf Monatsraten muessen
 * sich deshalb nicht exakt auf den Jahresbetrag aufaddieren — das ist bei
 * monatlichen Vorschuessen unvermeidbar und entspricht dem Verhalten vor 0060.
 */
export function berechneMonatsvorschau(
  jahresbetrag: number,
  anteile: readonly UnitAnteil[],
): MonatsvorschauZeile[] {
  return anteile.map((anteil) => {
    const anteiligerJahresbetrag = jahresbetrag * anteil.anteil;

    return {
      unitId: anteil.unitId,
      jahresbetrag: rundeAufCent(anteiligerJahresbetrag),
      monatsbetrag: rundeAufCent(anteiligerJahresbetrag / 12),
    };
  });
}

function rundeAufCent(betrag: number): number {
  return Math.round((betrag + Number.EPSILON) * 100) / 100;
}
