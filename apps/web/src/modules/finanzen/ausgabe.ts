/**
 * Ausgaben und Erhaltungsruecklage.
 *
 * Spiegelt `tg_ruecklage_bewegung_validate` (Migration 0062): eine Entnahme darf
 * den Bestand **zu ihrem eigenen Stichtag** nicht unter null druecken. Das ist
 * strenger als eine Gesamtsumme — Geld, das erst spaeter zugefuehrt wurde, deckt
 * eine frueher datierte Entnahme nicht.
 *
 * Wie in `zahlung.ts` wird in Cent gerechnet: Gleitkomma-Reste duerfen keine
 * Betragsgrenze reissen.
 */

import type { RuecklagenRichtung } from "@/lib/supabase/database.types";

export interface RuecklagenBewegung {
  datum: string;
  betrag: number;
  richtung: RuecklagenRichtung;
}

export interface RuecklagenJahr {
  jahr: number;
  anfangsbestand: number;
  zufuehrungen: number;
  entnahmen: number;
  endbestand: number;
}

const CENT = 100;

function inCent(betrag: number): number {
  return Math.round((betrag + Number.EPSILON) * CENT);
}

function jahrVon(datum: string): number {
  return Number(datum.slice(0, 4));
}

/** Vorzeichenbehafteter Beitrag einer Bewegung zum Bestand. */
function signiert(bewegung: RuecklagenBewegung): number {
  return bewegung.richtung === "entnahme"
    ? -inCent(bewegung.betrag)
    : inCent(bewegung.betrag);
}

/**
 * Bestand zu einem Stichtag, einschliesslich aller Bewegungen bis dahin.
 *
 * ISO-Datumsstrings lassen sich direkt lexikografisch vergleichen.
 */
export function bestandZumStichtag(
  bewegungen: readonly RuecklagenBewegung[],
  stichtag: string,
): number {
  const summe = bewegungen
    .filter((b) => b.datum <= stichtag)
    .reduce((acc, b) => acc + signiert(b), 0);

  return summe / CENT;
}

export type EntnahmePruefung =
  | { ok: true; bestandDanach: number }
  | { ok: false; verfuegbar: number };

/** Prueft eine geplante Entnahme gegen den Bestand zu ihrem Stichtag. */
export function pruefeEntnahme(
  bewegungen: readonly RuecklagenBewegung[],
  entnahme: { datum: string; betrag: number },
): EntnahmePruefung {
  const verfuegbar = bestandZumStichtag(bewegungen, entnahme.datum);

  if (inCent(entnahme.betrag) > inCent(verfuegbar)) {
    return { ok: false, verfuegbar };
  }

  return {
    ok: true,
    bestandDanach: (inCent(verfuegbar) - inCent(entnahme.betrag)) / CENT,
  };
}

/**
 * Die vier Groessen aus § 28 Abs. 2 WEG je Jahr.
 *
 * Spiegelt die View `ruecklage_entwicklung`. Ein Eroeffnungsbestand zaehlt in
 * den Anfangsbestand seines eigenen Jahres, nicht in die Zufuehrungen.
 */
export function berechneEntwicklung(
  bewegungen: readonly RuecklagenBewegung[],
): RuecklagenJahr[] {
  const jahre = [...new Set(bewegungen.map((b) => jahrVon(b.datum)))].sort(
    (a, b) => a - b,
  );

  let laufend = 0;

  return jahre.map((jahr) => {
    const desJahres = bewegungen.filter((b) => jahrVon(b.datum) === jahr);

    const eroeffnung = desJahres
      .filter((b) => b.richtung === "anfangsbestand")
      .reduce((acc, b) => acc + inCent(b.betrag), 0);
    const zufuehrungen = desJahres
      .filter((b) => b.richtung === "zufuehrung")
      .reduce((acc, b) => acc + inCent(b.betrag), 0);
    const entnahmen = desJahres
      .filter((b) => b.richtung === "entnahme")
      .reduce((acc, b) => acc + inCent(b.betrag), 0);

    const anfangsbestand = laufend + eroeffnung;
    laufend = anfangsbestand + zufuehrungen - entnahmen;

    return {
      jahr,
      anfangsbestand: anfangsbestand / CENT,
      zufuehrungen: zufuehrungen / CENT,
      entnahmen: entnahmen / CENT,
      endbestand: laufend / CENT,
    };
  });
}

export const RUECKLAGEN_RICHTUNG_LABEL: Record<RuecklagenRichtung, string> = {
  anfangsbestand: "Anfangsbestand",
  zufuehrung: "Zuführung",
  entnahme: "Entnahme",
};
