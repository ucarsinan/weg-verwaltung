/**
 * Mehrheits-Strategy für WEG-Beschlüsse (§§ 21, 23, 25 WEG).
 *
 * Eingangs-Aggregat ist immer dieselbe Tally-Form (ja/nein/enthaltung +
 * total stimmberechtigt + optional Summe der angegebenen MEA-Stimmen),
 * der Schwellwert-Test variiert per mehrheits_typ.
 *
 * Section-1-Invariante 5: Stimmen sind an `ownership_id` gekoppelt, nie
 * an User. Diese Strategy bekommt nur Aggregate — Identität der Stimmer
 * ist hier nicht relevant.
 *
 * Was hier NICHT abgedeckt ist:
 *  - Stimmverbot § 25 Abs. 4 WEG (Stimmer-Ausschluss) → muss vor Tally
 *    am Vote-Insert gefiltert werden, Resolution.excluded_voter_ids[].
 *  - Ungültige/bedingte Stimmen → werden bereits per Vote.validity
 *    gefiltert, nicht hier.
 */

import type { MehrheitsTyp } from "@/lib/supabase/database.types";

export interface VoteTally {
  /** Anzahl abgegebener Ja-Stimmen */
  ja: number;
  /** Anzahl abgegebener Nein-Stimmen */
  nein: number;
  /** Anzahl Enthaltungen */
  enthaltung: number;
  /**
   * Stimmberechtigte insgesamt (für Allstimmigkeit und für die Frage,
   * ob Nicht-Abgabe als Nein zählt). Optional — wenn nicht bekannt,
   * gehen einige Schwellen-Checks ins "unzureichende Datenlage".
   */
  total_eligible?: number;
  /**
   * Summe der MEA der Ja-Stimmen (für doppelt_qualifiziert). Optional.
   */
  ja_mea_summe?: number;
  /**
   * Summe aller MEA der WEG (für doppelt_qualifiziert). Optional.
   */
  total_mea?: number;
}

export type MajorityOutcome = "positiv_beschluss" | "negativ_beschluss";

export interface MajorityEvaluation {
  outcome: MajorityOutcome;
  /** Menschenlesbare Begründung für den Verwalter (Protokoll-Anhang). */
  reasoning: string;
  /**
   * Falls Eingangs-Daten nicht ausreichten für eine harte Aussage
   * (z.B. doppelt_qualifiziert ohne MEA-Summen) — Fallback wurde
   * angewendet. Verwalter muss prüfen.
   */
  fallback_applied: boolean;
}

/**
 * Wendet die mehrheits_typ-Regel auf den Tally an und gibt
 * "positiv_beschluss" oder "negativ_beschluss" zurück.
 *
 * Enthaltungen zählen NIE als Nein — entspricht st. Rspr. (§ 25 WEG):
 * Mehrheit der "abgegebenen" Stimmen, Enthaltungen sind keine Stimmen.
 */
export function evaluateMajority(
  tally: VoteTally,
  mehrheits_typ: MehrheitsTyp,
): MajorityEvaluation {
  const abgegeben = tally.ja + tally.nein;

  switch (mehrheits_typ) {
    case "einfach":
      // § 25 Abs. 1 WEG: Mehrheit der abgegebenen Stimmen.
      // Bei Stimmengleichheit ist der Antrag abgelehnt (h.M.).
      if (tally.ja > tally.nein) {
        return {
          outcome: "positiv_beschluss",
          reasoning: `Einfache Mehrheit erreicht (${tally.ja} ja > ${tally.nein} nein).`,
          fallback_applied: false,
        };
      }
      return {
        outcome: "negativ_beschluss",
        reasoning: `Einfache Mehrheit verfehlt (${tally.ja} ja, ${tally.nein} nein, ${tally.enthaltung} Enthaltung).`,
        fallback_applied: false,
      };

    case "qualifiziert": {
      // Qualifizierte Mehrheit = >= 75% der abgegebenen Ja-Stimmen.
      // Beispiele: bauliche Veränderungen § 20 Abs. 2 WEG a.F. (heute
      // § 21 — abweichende Kostenverteilung), Verwalter-Bestellungen
      // mit qualifizierter Mehrheit gem. Vereinbarung.
      const threshold = abgegeben * 0.75;
      if (abgegeben > 0 && tally.ja >= threshold) {
        return {
          outcome: "positiv_beschluss",
          reasoning: `Qualifizierte Mehrheit (≥ 75 %) erreicht (${tally.ja} von ${abgegeben} abgegebenen Stimmen).`,
          fallback_applied: false,
        };
      }
      return {
        outcome: "negativ_beschluss",
        reasoning: `Qualifizierte Mehrheit (≥ 75 %) verfehlt (${tally.ja} von ${abgegeben} abgegebenen Stimmen).`,
        fallback_applied: false,
      };
    }

    case "doppelt_qualifiziert": {
      // § 21 Abs. 2 Nr. 1 WEG: bauliche Veränderung mit allgemeiner
      // Kostentragung — > 2/3 der abgegebenen Stimmen UND > 1/2 der
      // gesamten MEA.
      const stimmen_ok = abgegeben > 0 && tally.ja / abgegeben > 2 / 3;

      if (tally.ja_mea_summe === undefined || tally.total_mea === undefined) {
        // Fallback: ohne MEA-Daten können wir nur den Stimmen-Teil
        // prüfen. Verwalter muss MEA-Anteil manuell verifizieren.
        return {
          outcome: stimmen_ok ? "positiv_beschluss" : "negativ_beschluss",
          reasoning:
            `MEA-Anteil nicht ermittelt — nur Stimmen-Teil geprüft ` +
            `(${tally.ja}/${abgegeben} > 2/3 = ${stimmen_ok}). ` +
            `MEA-Anteil (> 1/2) bitte manuell verifizieren.`,
          fallback_applied: true,
        };
      }

      const mea_ok = tally.ja_mea_summe / tally.total_mea > 0.5;
      if (stimmen_ok && mea_ok) {
        return {
          outcome: "positiv_beschluss",
          reasoning:
            `Doppelt qualifizierte Mehrheit erreicht: ` +
            `${tally.ja}/${abgegeben} Stimmen (> 2/3) und ` +
            `${tally.ja_mea_summe}/${tally.total_mea} MEA (> 1/2).`,
          fallback_applied: false,
        };
      }
      return {
        outcome: "negativ_beschluss",
        reasoning:
          `Doppelt qualifizierte Mehrheit verfehlt: ` +
          `Stimmen ${stimmen_ok ? "ok" : "nein"}, MEA ${mea_ok ? "ok" : "nein"}.`,
        fallback_applied: false,
      };
    }

    case "allstimmig":
    case "vereinbarungs_aenderung": {
      // Allstimmigkeit = jede stimmberechtigte Einheit hat Ja gesagt.
      // Vereinbarungsänderung braucht ebenfalls Allstimmigkeit
      // (st. Rspr., § 10 Abs. 1 S. 2 WEG).
      if (tally.total_eligible === undefined) {
        return {
          outcome:
            tally.nein === 0 && tally.enthaltung === 0 && tally.ja > 0
              ? "positiv_beschluss"
              : "negativ_beschluss",
          reasoning:
            `Stimmberechtigte gesamt nicht bekannt — Allstimmigkeit konservativ ` +
            `bewertet (nur "ja" ohne Gegenstimmen/Enthaltungen → positiv).`,
          fallback_applied: true,
        };
      }
      if (tally.ja === tally.total_eligible) {
        return {
          outcome: "positiv_beschluss",
          reasoning: `Allstimmigkeit erreicht (${tally.ja} von ${tally.total_eligible} stimmberechtigte Einheiten).`,
          fallback_applied: false,
        };
      }
      return {
        outcome: "negativ_beschluss",
        reasoning:
          `Allstimmigkeit verfehlt: ${tally.ja} ja, ${tally.nein} nein, ` +
          `${tally.enthaltung} Enthaltung von ${tally.total_eligible} stimmberechtigten Einheiten.`,
        fallback_applied: false,
      };
    }
  }
}
