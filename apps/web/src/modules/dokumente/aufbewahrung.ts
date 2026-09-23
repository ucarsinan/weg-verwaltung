import type { DocTyp, FristHerkunft } from "@/lib/supabase/database.types";

export const DOC_TYP_LABEL: Record<DocTyp, string> = {
  beschluss: "Beschluss",
  protokoll: "Protokoll",
  doku: "Sonstige Unterlage",
  rechnung: "Rechnung",
  vertrag: "Vertrag",
  bescheid: "Bescheid",
  korrespondenz: "Korrespondenz",
};

/** Kein Fristende heisst dauerhaft — nicht "unbekannt". */
export function istDauerhaft(aufzubewahrenBis: string | null): boolean {
  return aufzubewahrenBis === null;
}

/**
 * Wandelt ein ISO-Datum (YYYY-MM-DD) in deutsche Schreibweise. Bewusst ohne
 * `Date`: `new Date("2027-01-01")` liegt auf UTC-Mitternacht, und
 * `toLocaleDateString` formatiert in der lokalen Zeitzone — westlich von UTC
 * würde das Datum um einen Tag zurückfallen (bei Jahreswechseln sogar ins
 * Vorjahr). Ein reiner Stringzugriff auf die drei ISO-Teile ist unabhängig
 * davon, wo Server oder Browser stehen.
 */
function isoZuDeutschemDatum(isoDatum: string): string {
  const [jahr, monat, tag] = isoDatum.split("-");
  return `${tag}.${monat}.${jahr}`;
}

/**
 * Die Frist wird NICHT hier gerechnet. Sie kommt aus der Sicht
 * `dokument_uebersicht`; diese Funktion formatiert nur.
 *
 * Der Zusatz "(Vorschlag)" beim gesetzlichen Rueckfall gilt fuer JEDES
 * Ergebnis dieser Herkunft, auch fuer "dauerhaft" — Migration 0069 haelt
 * ausdruecklich fest, dass der Rueckfall in der Anzeige nicht wie eine
 * Entscheidung des Verwalters aussehen darf. Ein Rueckfall-"dauerhaft" (z. B.
 * bei Protokoll/Beschluss) ist ebenso ein Systemvorschlag wie ein
 * Rueckfall-Datum; ohne den Zusatz waere es von einer bewusst gesetzten
 * Mandantenregel "dauerhaft" nicht zu unterscheiden — und genau diese
 * Unterscheidung ist der Zweck von `frist_herkunft`.
 */
export function formatAufbewahrung(
  aufzubewahrenBis: string | null,
  herkunft: FristHerkunft,
): string {
  const basis = istDauerhaft(aufzubewahrenBis)
    ? "dauerhaft"
    : `bis ${isoZuDeutschemDatum(aufzubewahrenBis as string)}`;

  return herkunft === "gesetzlicher_rueckfall" ? `${basis} (Vorschlag)` : basis;
}
