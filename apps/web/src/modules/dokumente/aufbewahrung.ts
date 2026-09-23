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
 * Die Frist wird NICHT hier gerechnet. Sie kommt aus der Sicht
 * `dokument_uebersicht`; diese Funktion formatiert nur.
 *
 * Der Zusatz "Vorschlag" beim gesetzlichen Rueckfall ist kein Schmuck: ohne
 * ihn sieht ein gegriffener Wert aus wie eine gepruefte Entscheidung. Er
 * haengt nur an einem tatsaechlich errechneten Datum — bei "dauerhaft" gibt
 * es keinen Termin, der als Vorschlag markiert werden muesste (Rueckfall
 * protokoll/beschluss ist ebenfalls dauerhaft, siehe Sicht 0069).
 */
export function formatAufbewahrung(
  aufzubewahrenBis: string | null,
  herkunft: FristHerkunft,
): string {
  if (istDauerhaft(aufzubewahrenBis)) {
    return "dauerhaft";
  }

  const basis = `bis ${new Date(aufzubewahrenBis as string).toLocaleDateString("de-DE")}`;
  return herkunft === "gesetzlicher_rueckfall" ? `${basis} (Vorschlag)` : basis;
}
