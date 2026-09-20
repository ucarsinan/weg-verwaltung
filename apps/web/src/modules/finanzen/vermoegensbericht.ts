/**
 * Vermoegensbericht — Aufbereitung der fuenf Abschnitte (§ 28 Abs. 4 WEG).
 *
 * Die Zahlen kommen aus `vermoegensbericht_position` (Migration 0065), wo sie
 * beim Erstellen eingefroren wurden. Hier geht es nur ums Summieren und ums
 * Deuten.
 *
 * Eine Besonderheit praegt jede Funktion in dieser Datei: **eine Position darf
 * ohne Betrag stehen.** Der Bericht ist keine Bilanz; bewegliche Sachen werden
 * genannt, nicht bewertet. Ein fehlender Betrag ist deshalb nirgends eine Null,
 * sondern eine Position, die in keine Summe eingeht.
 *
 * Wie in den uebrigen Modulen wird in Cent gerechnet.
 */

import type {
  VermoegensberichtAbschnitt,
  VermoegensberichtStatus,
} from "@/lib/supabase/database.types";

export interface BerichtsPosition {
  abschnitt: VermoegensberichtAbschnitt;
  bezeichnung: string;
  betragAnfang: number | null;
  betrag: number | null;
}

export interface AbschnittsSumme {
  abschnitt: VermoegensberichtAbschnitt;
  /** Summe der Positionen mit Betrag. */
  summe: number;
  anzahl: number;
  /** Positionen ohne Betrag — genannt, aber nicht bewertet. */
  anzahlOhneBetrag: number;
}

const CENT = 100;

function inCent(betrag: number): number {
  return Math.round((betrag + Number.EPSILON) * CENT);
}

/** Die Abschnitte in der Reihenfolge, in der sie im Bericht stehen. */
export const VERMOEGENSBERICHT_ABSCHNITTE: readonly VermoegensberichtAbschnitt[] =
  ["konto", "ruecklage", "forderung", "verbindlichkeit", "sachwert"] as const;

export const VERMOEGENSBERICHT_ABSCHNITT_LABEL: Record<
  VermoegensberichtAbschnitt,
  string
> = {
  konto: "Bestand der gemeinschaftlichen Konten",
  ruecklage: "Rücklagenbestand",
  forderung: "Forderungen",
  verbindlichkeit: "Verbindlichkeiten",
  sachwert: "Sonstige Vermögensgegenstände",
};

export const VERMOEGENSBERICHT_STATUS_LABEL: Record<
  VermoegensberichtStatus,
  string
> = {
  entwurf: "Entwurf",
  erstellt: "Erstellt",
  abgeloest: "Abgelöst",
};

/** Summiert einen Abschnitt; Positionen ohne Betrag zaehlen nur mit. */
export function summiereAbschnitt(
  positionen: readonly BerichtsPosition[],
  abschnitt: VermoegensberichtAbschnitt,
): AbschnittsSumme {
  let summeCent = 0;
  let anzahl = 0;
  let anzahlOhneBetrag = 0;

  for (const position of positionen) {
    if (position.abschnitt !== abschnitt) continue;
    anzahl += 1;

    if (position.betrag === null) {
      anzahlOhneBetrag += 1;
      continue;
    }

    summeCent += inCent(position.betrag);
  }

  return { abschnitt, summe: summeCent / CENT, anzahl, anzahlOhneBetrag };
}

export function summiereAlleAbschnitte(
  positionen: readonly BerichtsPosition[],
): AbschnittsSumme[] {
  return VERMOEGENSBERICHT_ABSCHNITTE.map((abschnitt) =>
    summiereAbschnitt(positionen, abschnitt),
  );
}

/**
 * Konten + Forderungen − Verbindlichkeiten.
 *
 * Der Ruecklagenbestand bleibt bewusst **draussen**: die Ruecklage liegt auf
 * einem der Konten, die hier schon gezaehlt werden. Sie zusaetzlich zu addieren
 * wuerde dasselbe Geld doppelt ausweisen. Sachwerte bleiben ebenfalls draussen,
 * weil sie gar nicht bewertet sind.
 */
export function berechneNettovermoegen(
  positionen: readonly BerichtsPosition[],
): number {
  const konten = summiereAbschnitt(positionen, "konto");
  const forderungen = summiereAbschnitt(positionen, "forderung");
  const verbindlichkeiten = summiereAbschnitt(positionen, "verbindlichkeit");

  return (
    (inCent(konten.summe) +
      inCent(forderungen.summe) -
      inCent(verbindlichkeiten.summe)) /
    CENT
  );
}

/**
 * Abschnitte, die der Verwalter selbst fuellen muss und noch nicht gefuellt hat.
 *
 * Kein Fehler, sondern ein Pruefsignal. Die Praxisempfehlung lautet, im Zweifel
 * eher mehr aufzulisten als weniger — ein leerer Konten-Abschnitt ist deshalb
 * fast immer ein Versehen, ein leerer Sachwert-Abschnitt dagegen oft richtig.
 */
export function offeneAbschnitte(
  positionen: readonly BerichtsPosition[],
): VermoegensberichtAbschnitt[] {
  const manuellZuFuellen: VermoegensberichtAbschnitt[] = [
    "konto",
    "verbindlichkeit",
    "sachwert",
  ];

  return manuellZuFuellen.filter(
    (abschnitt) => summiereAbschnitt(positionen, abschnitt).anzahl === 0,
  );
}
