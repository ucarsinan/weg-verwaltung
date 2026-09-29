import { describe, expect, it } from "vitest";
import { mapAktivierungsfehler } from "../aktivierungsfehler";

describe("mapAktivierungsfehler", () => {
  it("reicht die Basiswert-Meldung des Generators mit ihren Zahlen durch", () => {
    // Der Kern von Befund 6: Genau dieser Fall wurde bisher als
    // "Der Statuswechsel ist fachlich nicht erlaubt." gemeldet. Nur die
    // Datenbank kennt Anzahl und Stichtag (0067).
    const { text, intern } = mapAktivierungsfehler(
      "23514",
      "Es fehlen Basiswerte für 3 Einheit(en) zum Stichtag 2026-01-01.",
    );

    expect(text).toBe(
      "Es fehlen Basiswerte für 3 Einheit(en) zum Stichtag 2026-01-01.",
    );
    expect(intern).toBe(false);
  });

  it("reicht die MEA-Meldung mit ihren Prozentwerten durch", () => {
    const { text } = mapAktivierungsfehler(
      "22023",
      "Die Miteigentumsanteile ergeben zusammen nur 75.00 % des Ganzen. 25.00 % der Gesamtkosten würden niemandem berechnet — fehlt eine Einheit?",
    );

    expect(text).toContain("75.00 %");
    expect(text).toContain("25.00 %");
  });

  it.each([
    ["Die Summe der Basiswerte muss größer als 0 sein.", "23514"],
    ["Der gemischte Verteilungsschlüssel hat keine Teile.", "23514"],
    ["WEG hat keine Einheiten für die Gleichverteilung.", "23514"],
    ["Diese WEG hat keine Einheiten mit Miteigentumsanteilen.", "22023"],
    ['Verteilungsschlüssel-Typ "neu" wird vom Sollstellung-Generator noch nicht unterstützt.', "0A000"],
    // 0074 — Beschlussgrundlage
    [
      "Dieser Wirtschaftsplan ist keinem Beschluss zugeordnet. Die Vorschüsse entstehen erst durch den Beschluss der Eigentümer (§ 28 Abs. 1 WEG) — bitte den zugehörigen Beschluss der Beschluss-Sammlung zuordnen.",
      "22023",
    ],
    ["Der zugeordnete Beschluss gehört zu einer anderen WEG.", "22023"],
    [
      'Beschluss Nr. 4 ist kein zustimmender Beschluss (Typ "negativ_beschluss"). Nur ein angenommener Beschluss begründet Vorschüsse.',
      "22023",
    ],
  ])("reicht %s durch", (meldung, code) => {
    expect(mapAktivierungsfehler(code, meldung).text).toBe(meldung);
  });

  it("übersetzt den englischen Statussatz statt ihn durchzureichen", () => {
    const { text } = mapAktivierungsfehler(
      "23514",
      "Only draft Wirtschaftspläne can be activated.",
    );

    expect(text).toContain("Nur ein Entwurf kann aktiviert werden");
    expect(text).not.toContain("draft");
  });

  it("übersetzt den Nachtrags-Vorgängersatz", () => {
    const { text } = mapAktivierungsfehler(
      "23514",
      "Nachtragswirtschaftsplan predecessor must be an effective plan in the same WEG and year.",
    );

    expect(text).toContain("Vorgängerplan");
    expect(text).not.toContain("predecessor");
  });

  it("behauptet bei einem Ausfall der Audit-Kette KEINEN MEA-Fehler", () => {
    // Die Korrektur an 0073: Die Audit-Kette wirft fuer HMAC-Ausfaelle ebenfalls
    // 22023 (0045:153,179), und ihre Trigger haengen an wirtschaftsplan und
    // sollstellung. Die Oberflaeche meldete das als Problem der
    // Miteigentumsanteile — eine Diagnose, die den Verwalter stundenlang an der
    // falschen Stelle suchen laesst.
    const { text, intern } = mapAktivierungsfehler(
      "22023",
      "audit_writer.hash_audit_event_v2: audit_hmac_key must be a 32-byte hex string.",
    );

    expect(text).not.toMatch(/Miteigentumsanteile/);
    expect(text).toContain("technische");
    expect(intern).toBe(true);
  });

  it("lässt keine interne Constraint-Meldung an die Oberfläche", () => {
    const { text } = mapAktivierungsfehler(
      "23514",
      'new row for relation "sollstellung" violates check constraint "sollstellung_betrag_ledger_check"',
    );

    expect(text).not.toContain("constraint");
    expect(text).not.toContain("sollstellung");
  });

  it("benennt bei unbekannter Meldung die Ursachen, statt eine zu behaupten", () => {
    // Eine neue Pruefung in einer kuenftigen Migration landet hier. Der Text
    // darf dann nicht mehr "Statuswechsel" behaupten.
    const { text } = mapAktivierungsfehler("23514", "Etwas ganz Neues.");

    expect(text).toContain("Mögliche Ursachen");
    expect(text).toContain("Basiswerte");
  });

  it("meldet einen fremden oder fehlenden Plan als nicht gefunden", () => {
    expect(mapAktivierungsfehler("PGRST116", undefined).text).toContain(
      "nicht gefunden",
    );
  });

  it("verträgt eine fehlende Meldung", () => {
    expect(mapAktivierungsfehler(undefined, undefined).text).toContain(
      "Bitte erneut versuchen",
    );
  });
});
