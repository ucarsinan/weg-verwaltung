/**
 * Fehlermeldungen der Wirtschaftsplan-Aktivierung, nach Ursache getrennt.
 *
 * Das Problem (Befund 6): `activate_wirtschaftsplan` kann fuenf verschiedene
 * Ursachen unter demselben Postgres-Code `23514` melden — Status, fehlender
 * Nachtrags-Vorgaenger, fehlende Basiswerte, Basiswert-Summe 0, gemischte Regel
 * ohne Teile. Die Oberflaeche bildete alle auf "Der Statuswechsel ist fachlich
 * nicht erlaubt." ab. Wer wegen eines fehlenden Basiswerts scheiterte, suchte
 * den Fehler beim Status.
 *
 * Der Hebel: Die Datenbank formuliert einen Teil dieser Meldungen bereits fuer
 * Nutzer. `0067` schreibt "Es fehlen Basiswerte fuer 3 Einheit(en) zum Stichtag
 * 2026-01-01." — praeziser, als es hier je gehen koennte, weil nur die Datenbank
 * die Zahlen kennt. Die Action hat `error.message` bisher verworfen.
 *
 * Deshalb: eine Positivliste der Meldungen, die fuer Nutzer geschrieben sind.
 * Bewusst eine Positivliste und keine Sperrliste — sonst rutscht irgendwann ein
 * interner Satz wie 'violates check constraint "…"' an den Verwalter durch. Was
 * nicht erkannt wird, faellt auf einen Text zurueck, der die moeglichen Ursachen
 * BENENNT, statt eine davon zu behaupten.
 *
 * Die Liste spiegelt SQL in TypeScript und veraltet damit, wenn die Migrationen
 * neue Meldungen bekommen — dasselbe Muster und dieselbe Pflege wie
 * `GENERATOR_TYPEN` in `verteilungsschluessel.ts`. Quellen: `0073` (Lifecycle und
 * MEA), `0067` (`_verteilungsschluessel_version_unit_shares`).
 */

/**
 * Interne Meldungen der Audit-Kette. Schema-qualifiziert, also ein stabiles
 * Merkmal und keine Prosa.
 *
 * Wichtig, weil `0045` fuer Ausfaelle der HMAC-Kette `22023` wirft — denselben
 * Code, den `0073` fuer die Miteigentumsanteile vergibt. Deren Trigger haengen
 * an `wirtschaftsplan` und `sollstellung`, feuern also bei jeder Aktivierung.
 * Ein kaputter Schluessel wurde dadurch als MEA-Problem gemeldet.
 */
const INTERNE_PRAEFIXE = ["audit_writer."] as const;

/** Meldungen, die die Datenbank fuer Nutzer formuliert hat (Praefix-Vergleich). */
const DURCHREICHBARE_PRAEFIXE = [
  // 0073 — MEA-Vorbedingung der Aktivierung, nennt Prozentwerte
  "Diese WEG hat keine Einheiten mit Miteigentumsanteilen",
  "Die Miteigentumsanteile ergeben zusammen",
  // 0067 — Generator, je Position aufgerufen
  "Es fehlen Basiswerte für",
  "Die Summe der Basiswerte",
  "Der gemischte Verteilungsschlüssel hat keine Teile",
  "WEG hat keine Einheiten mit Miteigentumsanteilen",
  "WEG hat keine Einheiten für die Gleichverteilung",
  "Verteilungsschlüssel-Version nicht gefunden",
  "Verteilungsschlüssel-Typ",
] as const;

/**
 * Die zwei englischen Entwicklersaetze aus `0073`. Sie sind die einzigen
 * Lifecycle-Meldungen der Aktivierung und gehoeren uebersetzt, nicht
 * durchgereicht.
 */
const UEBERSETZTE_MELDUNGEN: ReadonlyArray<readonly [string, string]> = [
  [
    "Only draft Wirtschaftspläne can be activated.",
    "Nur ein Entwurf kann aktiviert werden. Dieser Wirtschaftsplan hat seinen Status inzwischen geändert — bitte die Seite neu laden.",
  ],
  [
    "Nachtragswirtschaftsplan predecessor must be an effective plan",
    "Der Nachtragswirtschaftsplan braucht einen wirksamen Vorgängerplan in derselben WEG und demselben Jahr.",
  ],
];

const TECHNISCH =
  "Die Aktivierung ist an einer technischen Prüfung gescheitert. Der Wirtschaftsplan wurde nicht aktiviert und es sind keine Sollstellungen entstanden. Bitte an die Administration wenden.";

const UNBEKANNT =
  "Aktion konnte nicht ausgeführt werden. Bitte erneut versuchen.";

export interface Aktivierungsfehler {
  /** Der Text für die Oberfläche. */
  text: string;
  /**
   * `true`, wenn die Ursache technisch ist und nicht am Wirtschaftsplan liegt.
   * Die Action loggt diese Fälle laut, weil der Nutzer sie nicht beheben kann.
   */
  intern: boolean;
}

/**
 * Bildet die Antwort von `activate_wirtschaftsplan` auf einen Satz ab, der die
 * Ursache benennt.
 */
export function mapAktivierungsfehler(
  code: string | undefined,
  message: string | undefined,
): Aktivierungsfehler {
  const meldung = message?.trim() ?? "";

  if (INTERNE_PRAEFIXE.some((praefix) => meldung.startsWith(praefix))) {
    return { text: TECHNISCH, intern: true };
  }

  for (const [englisch, deutsch] of UEBERSETZTE_MELDUNGEN) {
    if (meldung.startsWith(englisch)) {
      return { text: deutsch, intern: false };
    }
  }

  if (DURCHREICHBARE_PRAEFIXE.some((praefix) => meldung.startsWith(praefix))) {
    return { text: meldung, intern: false };
  }

  // Ab hier ist die Meldung unbekannt — nur noch der Code traegt Information,
  // und der ist mehrdeutig. Deshalb Ursachen benennen, nicht behaupten.
  if (code === "23514") {
    return {
      text: "Der Wirtschaftsplan lässt sich nicht aktivieren. Mögliche Ursachen: Der Status hat sich geändert, einem Verteilungsschlüssel fehlen Basiswerte an einzelnen Einheiten, oder einem Nachtrag fehlt der Vorgängerplan.",
      intern: false,
    };
  }

  if (code === "PGRST116") {
    return { text: "Wirtschaftsplan wurde nicht gefunden.", intern: false };
  }

  if (code === "P0002") {
    return {
      text: "Ein für die Aktivierung benötigter Datensatz wurde nicht gefunden.",
      intern: false,
    };
  }

  if (code === "42501") {
    return {
      text: "Diese Aktion ist für diesen Wirtschaftsplan nicht erlaubt.",
      intern: false,
    };
  }

  if (code === "23505") {
    return {
      text: "Für dieses Jahr ist bereits ein anderer Wirtschaftsplan aktiv.",
      intern: false,
    };
  }

  return { text: UNBEKANNT, intern: code !== undefined };
}
