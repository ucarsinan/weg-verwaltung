/**
 * Die "nächster Schritt"-Leiter der WEG-Detailseite.
 *
 * Bis 2026-09-28 stand diese Logik als verschachteltes Ternär im Rumpf der
 * Server Component und war damit nicht importierbar und nicht testbar. Sie
 * liegt hier aus demselben Grund wie `wegs/address.ts`: reine Logik neben den
 * Seiten, mit eigenem Test.
 *
 * Die Reihenfolge ist keine Geschmacksfrage. Nach § 28 Abs. 1 WEG stellt der
 * Verwalter den Wirtschaftsplan auf, und die Eigentümer beschliessen ueber die
 * Vorschuesse — seit dem WEMoG ausdruecklich nur noch ueber die Zahlungen, nicht
 * mehr ueber den Plan selbst. Der Plan ist die Beschlussvorlage. Deshalb steht
 * er in dieser Leiter VOR der Versammlung: ohne Vorlage kann die Versammlung
 * nicht beschliessen.
 */

export type NaechsterSchrittTon = "default" | "success" | "warning";

export interface NaechsterSchritt {
  title: string;
  description: string;
  href: string;
  label: string;
  tone: NaechsterSchrittTon;
}

export interface WegFortschritt {
  wegId: string;
  hatEinheiten: boolean;
  hatPersonen: boolean;
  /**
   * `null` heisst "nicht ermittelbar", nicht "keiner vorhanden".
   *
   * Scheitert die Abfrage, darf die Seite nicht behaupten, die WEG habe keinen
   * Wirtschaftsplan — sie wuerde sonst eine Gemeinschaft, die laengst plant,
   * zum Neuanlegen auffordern. Bei `null` faellt der Schritt aus und die Leiter
   * verhaelt sich wie vorher. Dieselbe Unterscheidung wie bei `getClaims()` im
   * Dashboard-Layout: ein Fehler ist nicht dasselbe wie ein leeres Ergebnis.
   */
  hatWirtschaftsplan: boolean | null;
  hatVersammlungen: boolean;
  /** ID der aeltesten noch offenen Versammlung, sonst `null`. */
  offeneVersammlungId: string | null;
}

export function naechsterSchritt(stand: WegFortschritt): NaechsterSchritt {
  const { wegId } = stand;

  if (!stand.hatEinheiten) {
    return {
      title: "Wohneinheiten anlegen",
      description:
        "Damit Eigentümerschaften und Stimmrechte historisch korrekt abgebildet werden können.",
      href: `/wegs/${wegId}/einheiten/new`,
      label: "Einheit anlegen",
      tone: "warning",
    };
  }

  if (!stand.hatPersonen) {
    return {
      title: "Personen erfassen",
      description:
        "Für Einladungen, Eigentümerschaften und Abstimmungen fehlen noch Kontakte.",
      href: `/wegs/${wegId}/personen/new`,
      label: "Person anlegen",
      tone: "warning",
    };
  }

  // Bewusst `=== false`: `null` bedeutet "nicht ermittelbar" und ueberspringt
  // den Schritt (siehe WegFortschritt.hatWirtschaftsplan).
  if (stand.hatWirtschaftsplan === false) {
    return {
      title: "Wirtschaftsplan aufstellen",
      description:
        "Die Versammlung beschließt über die Vorschüsse — der Wirtschaftsplan ist die Vorlage dafür (§ 28 Abs. 1 WEG).",
      href: `/wegs/${wegId}/finanzen/new`,
      label: "Wirtschaftsplan anlegen",
      tone: "default",
    };
  }

  if (!stand.hatVersammlungen) {
    return {
      title: "Erste Versammlung vorbereiten",
      description:
        "Die Grundlagen sind angelegt. Jetzt kann der erste Versammlungsprozess starten.",
      href: `/wegs/${wegId}/versammlungen/new`,
      label: "Versammlung anlegen",
      tone: "default",
    };
  }

  if (stand.offeneVersammlungId) {
    return {
      title: "Offene Versammlung fortführen",
      description:
        "Es gibt einen laufenden oder vorbereiteten Versammlungsprozess.",
      href: `/versammlungen/${stand.offeneVersammlungId}`,
      label: "Versammlung öffnen",
      tone: "default",
    };
  }

  return {
    title: "Nächste Versammlung planen",
    description:
      "Die WEG-Grundlagen stehen. Planen Sie den nächsten Verwaltungstermin.",
    href: `/wegs/${wegId}/versammlungen/new`,
    label: "Versammlung anlegen",
    tone: "success",
  };
}
