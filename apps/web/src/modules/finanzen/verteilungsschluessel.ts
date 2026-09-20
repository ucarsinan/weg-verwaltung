/**
 * Verteilungsschluessel — Typen, Labels und Guards.
 *
 * § 16 Abs. 2 WEG macht die Miteigentumsanteile zum gesetzlichen Regelfall und
 * laesst die Eigentuemer je Kostenposition oder Kostenart einen abweichenden
 * Schluessel beschliessen. `quelle` haelt genau diese Rechtsgrundlage fest.
 */

import type {
  VerteilungsschluesselQuelle,
  VerteilungsschluesselRegelwerk,
  VerteilungsschluesselTyp,
} from "@/lib/supabase/database.types";

export const VERTEILUNGSSCHLUESSEL_TYPEN: readonly VerteilungsschluesselTyp[] = [
  "mea",
  "einheit",
  "flaeche",
  "verbrauch",
  "manuell",
  "gemischt",
] as const;

export const VERTEILUNGSSCHLUESSEL_QUELLEN: readonly VerteilungsschluesselQuelle[] =
  ["gesetz", "teilungserklaerung", "gemeinschaftsordnung", "beschluss", "manuell"] as const;

export const VERTEILUNGSSCHLUESSEL_TYP_LABEL: Record<
  VerteilungsschluesselTyp,
  string
> = {
  mea: "Miteigentumsanteile (MEA)",
  einheit: "Pro Einheit (gleich)",
  flaeche: "Wohnfläche",
  verbrauch: "Verbrauch",
  manuell: "Manuelle Anteile",
  gemischt: "Gemischt (z. B. Heizung 70/30)",
};

export const VERTEILUNGSSCHLUESSEL_QUELLE_LABEL: Record<
  VerteilungsschluesselQuelle,
  string
> = {
  gesetz: "Gesetz (§ 16 Abs. 2 WEG)",
  teilungserklaerung: "Teilungserklärung",
  gemeinschaftsordnung: "Gemeinschaftsordnung",
  beschluss: "Beschluss",
  manuell: "Manuell",
};

/**
 * Typen, fuer die je Einheit ein Basiswert hinterlegt sein muss. `mea` und
 * `einheit` leiten ihre Anteile aus den Stammdaten ab.
 */
export const TYPEN_MIT_BASISWERTEN: readonly VerteilungsschluesselTyp[] = [
  "flaeche",
  "verbrauch",
  "manuell",
] as const;

/**
 * Seit 0067 loest der Generator jeden Typ auf.
 *
 * `gemischt` kommt dabei nicht ueber eigene Basiswerte, sondern ueber Teile:
 * eine gemischte Regel verweist auf andere, einfache Schluesselversionen und
 * gewichtet sie. Der Flaechenschluessel wird so einmal gepflegt und dient
 * allen gemischten Regeln.
 *
 * Die Liste spiegelt die Zweige in `_verteilungsschluessel_version_unit_shares`
 * (0067). Zur Zeit deckt sie jeden Typ ab — sie bleibt, weil ein kuenftiger Typ
 * im Schema stehen kann, bevor der Generator ihn aufloest. Fuer genau den Fall
 * ist auch der 0A000-Zweig im SQL stehen geblieben.
 */
export const GENERATOR_TYPEN: readonly VerteilungsschluesselTyp[] = [
  "mea",
  "einheit",
  "flaeche",
  "verbrauch",
  "manuell",
  "gemischt",
] as const;

export function isGeneratorUnterstuetzt(typ: VerteilungsschluesselTyp): boolean {
  return GENERATOR_TYPEN.includes(typ);
}

export function brauchtBasiswerte(typ: VerteilungsschluesselTyp): boolean {
  return TYPEN_MIT_BASISWERTEN.includes(typ);
}

/** Eine gemischte Regel wird nicht ueber Basiswerte gefuellt, sondern ueber Teile. */
export function brauchtTeile(typ: VerteilungsschluesselTyp): boolean {
  return typ === "gemischt";
}

/**
 * Regelwerke, denen eine gemischte Regel unterliegen kann.
 *
 * `frei` heisst: nur die Summenregel. Der 50/70-Korridor gilt fuer Heizkosten,
 * nicht fuer gemischte Regeln ueberhaupt — eine gemischte Regel fuer etwas
 * anderes darf 50/50 sein.
 */
export const VERTEILUNGSSCHLUESSEL_REGELWERKE: readonly VerteilungsschluesselRegelwerk[] =
  ["frei", "heizkv_waerme", "heizkv_warmwasser", "heizkv_waerme_70"] as const;

export const VERTEILUNGSSCHLUESSEL_REGELWERK_LABEL: Record<
  VerteilungsschluesselRegelwerk,
  string
> = {
  frei: "Frei (nur Summe 100 %)",
  heizkv_waerme: "Heizkosten nach § 7 HeizkostenV (50–70 % Verbrauch)",
  heizkv_warmwasser: "Warmwasser nach § 8 HeizkostenV (50–70 % Verbrauch)",
  heizkv_waerme_70: "Heizkosten, Pflichtfall § 7 Abs. 1 Satz 2 (genau 70 %)",
};

export function isVerteilungsschluesselRegelwerk(
  value: unknown,
): value is VerteilungsschluesselRegelwerk {
  return (
    typeof value === "string" &&
    (VERTEILUNGSSCHLUESSEL_REGELWERKE as readonly string[]).includes(value)
  );
}

export interface TeilEingabe {
  /** Typ der referenzierten Schluesselversion. */
  typ: VerteilungsschluesselTyp;
  gewicht: number;
}

export type TeilePruefung =
  | { ok: true }
  | { ok: false; meldung: string };

/**
 * Spiegelt `private._verteilungsschluessel_teil_pruefe` aus 0067.
 *
 * Die Datenbank ist und bleibt die Instanz, die das erzwingt; diese Funktion
 * existiert nur, damit das Formular denselben Satz sagt, bevor gespeichert wird.
 * Gerechnet wird in Tausendstel-Prozent, weil `gewicht` in der Datenbank
 * `numeric(6,3)` ist — ein Gleitkommarest darf die Summe nicht reissen.
 */
export function pruefeTeile(
  teile: readonly TeilEingabe[],
  regelwerk: VerteilungsschluesselRegelwerk = "frei",
): TeilePruefung {
  if (teile.length === 0) {
    return { ok: false, meldung: "Eine gemischte Regel braucht mindestens einen Teil." };
  }

  const summe = teile.reduce(
    (acc, teil) => acc + Math.round((teil.gewicht + Number.EPSILON) * 1000),
    0,
  );

  if (summe !== 100_000) {
    return {
      ok: false,
      meldung: `Die Gewichte müssen zusammen 100 % ergeben, sind aber ${(summe / 1000).toLocaleString("de-DE")} %.`,
    };
  }

  if (regelwerk === "frei") {
    return { ok: true };
  }

  if (teile.length !== 2) {
    return {
      ok: false,
      meldung:
        "Eine Verteilung nach HeizkostenV besteht aus genau zwei Teilen: Verbrauch und Fläche.",
    };
  }

  const verbrauch = teile.find((teil) => teil.typ === "verbrauch");
  if (!verbrauch) {
    return {
      ok: false,
      meldung: 'Eine Verteilung nach HeizkostenV braucht einen Teil vom Typ "Verbrauch".',
    };
  }

  const rest = teile.find((teil) => teil.typ !== "verbrauch");
  if (rest && rest.typ !== "flaeche") {
    return {
      ok: false,
      meldung:
        "Der nicht verbrauchsabhängige Teil ist nach Wohn- oder Nutzfläche zu verteilen (§ 7 Abs. 1 Satz 5 HeizkostenV).",
    };
  }

  if (regelwerk === "heizkv_waerme_70") {
    if (verbrauch.gewicht !== 70) {
      return {
        ok: false,
        meldung: `Für dieses Gebäude schreibt § 7 Abs. 1 Satz 2 HeizkostenV genau 70 % nach Verbrauch vor, eingetragen sind ${verbrauch.gewicht} %.`,
      };
    }

    return { ok: true };
  }

  if (verbrauch.gewicht < 50 || verbrauch.gewicht > 70) {
    return {
      ok: false,
      meldung: `Nach HeizkostenV sind mindestens 50 und höchstens 70 % nach Verbrauch zu verteilen, eingetragen sind ${verbrauch.gewicht} %.`,
    };
  }

  return { ok: true };
}

export function isVerteilungsschluesselTyp(
  value: unknown,
): value is VerteilungsschluesselTyp {
  return (
    typeof value === "string" &&
    (VERTEILUNGSSCHLUESSEL_TYPEN as readonly string[]).includes(value)
  );
}

export function isVerteilungsschluesselQuelle(
  value: unknown,
): value is VerteilungsschluesselQuelle {
  return (
    typeof value === "string" &&
    (VERTEILUNGSSCHLUESSEL_QUELLEN as readonly string[]).includes(value)
  );
}
