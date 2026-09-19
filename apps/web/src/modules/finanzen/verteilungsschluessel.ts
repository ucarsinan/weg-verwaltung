/**
 * Verteilungsschluessel — Typen, Labels und Guards.
 *
 * § 16 Abs. 2 WEG macht die Miteigentumsanteile zum gesetzlichen Regelfall und
 * laesst die Eigentuemer je Kostenposition oder Kostenart einen abweichenden
 * Schluessel beschliessen. `quelle` haelt genau diese Rechtsgrundlage fest.
 */

import type {
  VerteilungsschluesselQuelle,
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
 * `gemischt` ist im Schema (0056) modelliert, aber der Sollstellungs-Generator
 * lehnt ihn in 0060 bewusst mit 0A000 ab: `verteilungsschluessel_basiswert` ist
 * pro (Version, Einheit, Stichtag) eindeutig und hat keine Spalte fuer die
 * Zugehoerigkeit zu einem Teil der Regel — eine 70/30-Regel kann Verbrauch UND
 * Flaeche einer Einheit deshalb nicht speichern. Betrifft insbesondere
 * Heiz-/Warmwasserkosten, die nach HeizKV zwingend gemischt verteilt werden.
 */
export function isGeneratorUnterstuetzt(typ: VerteilungsschluesselTyp): boolean {
  return typ !== "gemischt";
}

export function brauchtBasiswerte(typ: VerteilungsschluesselTyp): boolean {
  return TYPEN_MIT_BASISWERTEN.includes(typ);
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
