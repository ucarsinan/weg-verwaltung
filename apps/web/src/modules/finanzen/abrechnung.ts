/**
 * Jahresabrechnung — Aufbereitung der Abrechnungsspitze.
 *
 * Die Zahlen selbst kommen aus der Datenbank (View `abrechnung_spitze`,
 * Migration 0063). Hier geht es nur darum, sie fuer die Anzeige zu deuten und
 * eine Plausibilitaet zu pruefen, die ein Leser sonst selbst nachrechnen
 * muesste.
 *
 * Rechnerisch gilt: Spitze = anteilige tatsaechliche Kosten − beschlossene
 * Vorschuesse (Soll). Positiv heisst Nachschuss, negativ Guthaben.
 */

import type { AbrechnungsStatus } from "@/lib/supabase/database.types";

export interface SpitzeZeile {
  unitId: string;
  unitBezeichnung: string;
  kostenanteil: number;
  sollVorschuesse: number;
  spitze: number;
}

export type SpitzenArt = "nachschuss" | "guthaben" | "ausgeglichen";

const CENT = 100;

function inCent(betrag: number): number {
  return Math.round((betrag + Number.EPSILON) * CENT);
}

export function spitzenArt(spitze: number): SpitzenArt {
  const cent = inCent(spitze);
  if (cent > 0) return "nachschuss";
  if (cent < 0) return "guthaben";
  return "ausgeglichen";
}

export const SPITZEN_ART_LABEL: Record<SpitzenArt, string> = {
  nachschuss: "Nachschuss",
  guthaben: "Guthaben",
  ausgeglichen: "ausgeglichen",
};

export const ABRECHNUNGS_STATUS_LABEL: Record<AbrechnungsStatus, string> = {
  entwurf: "Entwurf",
  beschlossen: "Beschlossen",
  abgeloest: "Abgelöst",
};

export interface SpitzenSummen {
  nachschuesse: number;
  guthaben: number;
  /** Nachschüsse minus Guthaben — muss der Differenz aus Kosten und Soll entsprechen. */
  saldo: number;
}

export function summiereSpitzen(zeilen: readonly SpitzeZeile[]): SpitzenSummen {
  let nachschuesseCent = 0;
  let guthabenCent = 0;

  for (const zeile of zeilen) {
    const cent = inCent(zeile.spitze);
    if (cent > 0) nachschuesseCent += cent;
    else guthabenCent += -cent;
  }

  return {
    nachschuesse: nachschuesseCent / CENT,
    guthaben: guthabenCent / CENT,
    saldo: (nachschuesseCent - guthabenCent) / CENT,
  };
}

/**
 * Prueft, ob die verteilten Anteile die Kostenpositionen vollstaendig abdecken.
 *
 * Eine Abweichung ist kein Fehler im Rechtssinn — sie entsteht durch das Runden
 * auf Cent je Einheit — aber sie gehoert sichtbar gemacht, statt sie im
 * Gesamtbetrag verschwinden zu lassen. Toleranz: ein Cent je Einheit und
 * Kostenposition.
 */
export function pruefeVerteilung(input: {
  summeKostenpositionen: number;
  summeAnteile: number;
  anzahlEinheiten: number;
  anzahlKostenpositionen: number;
}): { ok: true } | { ok: false; differenz: number } {
  const differenzCent =
    inCent(input.summeAnteile) - inCent(input.summeKostenpositionen);
  const toleranzCent = Math.max(
    1,
    input.anzahlEinheiten * input.anzahlKostenpositionen,
  );

  if (Math.abs(differenzCent) <= toleranzCent) {
    return { ok: true };
  }

  return { ok: false, differenz: differenzCent / CENT };
}

/**
 * Prueft, ob die Abrechnungsspitze ueberhaupt eine Bezugsgroesse hat.
 *
 * Nach § 28 Abs. 2 WEG beschliessen die Eigentuemer ueber die Spitze — den
 * Saldo aus den nach Wirtschaftsplan geschuldeten Vorschuessen und den
 * tatsaechlichen Kosten. Ohne aktivierten Plan gibt es keine Vorschuesse:
 * `abrechnung_spitze` liefert dann `soll_vorschuesse = 0`, und die vollen
 * Jahreskosten erscheinen als Nachschuss.
 *
 * Das ist nicht zwingend falsch — eine WEG kann ihr erstes Jahr ohne Plan
 * gewirtschaftet haben. Aber dem Wert sieht niemand an, ob er "kein Plan"
 * oder "Plan mit null" bedeutet, und Fehler, die sich auf die Spitze
 * auswirken, sind genau die, an denen ein Beschluss vor Gericht kippt.
 * Deshalb wird die Lage gekennzeichnet statt verhindert.
 */
export function pruefeVorschussBasis(input: {
  hatAktivenWirtschaftsplan: boolean;
  summeSollVorschuesse: number;
}): { ok: true } | { ok: false; grund: "kein_aktiver_plan" } {
  if (input.hatAktivenWirtschaftsplan || inCent(input.summeSollVorschuesse) > 0) {
    return { ok: true };
  }

  return { ok: false, grund: "kein_aktiver_plan" };
}
