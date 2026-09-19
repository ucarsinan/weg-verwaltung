/**
 * Zuordnung von Zahlungen auf offene Posten.
 *
 * Spiegelt die Regeln, die `tg_zahlungszuordnung_validate` (Migration 0061) in
 * der Datenbank erzwingt: eine Zahlung kann nicht mehr zuordnen als sie
 * betraegt, und eine Sollstellung kann nicht ueberzahlt werden. Autoritativ ist
 * die Datenbank — diese Datei existiert, damit das Formular dieselben Grenzen
 * anzeigt, statt den Nutzer in einen 23514 laufen zu lassen.
 */

export interface OffenerPosten {
  sollstellungId: string;
  unitBezeichnung: string;
  jahr: number;
  monat: number;
  sollBetrag: number;
  offenBetrag: number;
}

export interface Zuordnungswunsch {
  sollstellungId: string;
  betrag: number;
}

export type ZuordnungsFehler =
  | { grund: "kein_betrag" }
  | { grund: "betrag_nicht_positiv"; sollstellungId: string }
  | { grund: "posten_unbekannt"; sollstellungId: string }
  | {
      grund: "posten_ueberzahlt";
      sollstellungId: string;
      offen: number;
      gewuenscht: number;
    }
  | { grund: "zahlung_ueberschritten"; zahlbetrag: number; summe: number };

export type ZuordnungsPruefung =
  | { ok: true; summe: number; restbetrag: number }
  | { ok: false; fehler: ZuordnungsFehler };

const CENT = 100;

/** Cent-genauer Vergleich: vermeidet, dass 0.1 + 0.2 eine Grenze reisst. */
function inCent(betrag: number): number {
  return Math.round((betrag + Number.EPSILON) * CENT);
}

/**
 * Prueft einen Satz Zuordnungen gegen den Zahlbetrag und die offenen Posten.
 *
 * Gibt bei Erfolg die Summe und den verbleibenden Restbetrag der Zahlung
 * zurueck — der Rest darf offen bleiben, eine Zahlung muss nicht vollstaendig
 * zugeordnet werden (Vorauszahlung, Rundungsdifferenz).
 */
export function pruefeZuordnungen(
  zahlbetrag: number,
  posten: readonly OffenerPosten[],
  wuensche: readonly Zuordnungswunsch[],
): ZuordnungsPruefung {
  const relevante = wuensche.filter((wunsch) => inCent(wunsch.betrag) !== 0);

  if (relevante.length === 0) {
    return { ok: false, fehler: { grund: "kein_betrag" } };
  }

  const postenIndex = new Map(posten.map((p) => [p.sollstellungId, p]));
  let summeCent = 0;

  for (const wunsch of relevante) {
    if (inCent(wunsch.betrag) < 0) {
      return {
        ok: false,
        fehler: {
          grund: "betrag_nicht_positiv",
          sollstellungId: wunsch.sollstellungId,
        },
      };
    }

    const posten = postenIndex.get(wunsch.sollstellungId);
    if (!posten) {
      return {
        ok: false,
        fehler: {
          grund: "posten_unbekannt",
          sollstellungId: wunsch.sollstellungId,
        },
      };
    }

    if (inCent(wunsch.betrag) > inCent(posten.offenBetrag)) {
      return {
        ok: false,
        fehler: {
          grund: "posten_ueberzahlt",
          sollstellungId: wunsch.sollstellungId,
          offen: posten.offenBetrag,
          gewuenscht: wunsch.betrag,
        },
      };
    }

    summeCent += inCent(wunsch.betrag);
  }

  if (summeCent > inCent(zahlbetrag)) {
    return {
      ok: false,
      fehler: {
        grund: "zahlung_ueberschritten",
        zahlbetrag,
        summe: summeCent / CENT,
      },
    };
  }

  return {
    ok: true,
    summe: summeCent / CENT,
    restbetrag: (inCent(zahlbetrag) - summeCent) / CENT,
  };
}

/**
 * Verteilt einen Zahlbetrag auf die aeltesten offenen Posten.
 *
 * Entspricht der kaufmaennischen Konvention, dass eine Zahlung ohne
 * ausdrueckliche Tilgungsbestimmung die aelteste Schuld zuerst begleicht. Der
 * letzte bediente Posten bekommt gegebenenfalls nur einen Teilbetrag — genau
 * so entsteht eine Teilzahlung.
 */
export function verteileAufAeltesteOffen(
  zahlbetrag: number,
  posten: readonly OffenerPosten[],
): Zuordnungswunsch[] {
  const sortiert = [...posten]
    .filter((p) => inCent(p.offenBetrag) > 0)
    .sort((a, b) => a.jahr - b.jahr || a.monat - b.monat);

  let restCent = inCent(zahlbetrag);
  const wuensche: Zuordnungswunsch[] = [];

  for (const p of sortiert) {
    if (restCent <= 0) break;

    const anteilCent = Math.min(restCent, inCent(p.offenBetrag));
    wuensche.push({
      sollstellungId: p.sollstellungId,
      betrag: anteilCent / CENT,
    });
    restCent -= anteilCent;
  }

  return wuensche;
}

export function formatMonat(jahr: number, monat: number): string {
  return `${String(monat).padStart(2, "0")}/${jahr}`;
}
