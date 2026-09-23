import fs from "node:fs";
import path from "node:path";

import { test, expect, type Page } from "@playwright/test";
import { getSupabaseRequestContext } from "./helpers/fixtures";
import { createWegFixture } from "./helpers/weg";

// Dokumentenablage (Tasks 3+4, Migrationen 0069–0071) — durch die Oberflaeche.
//
// Testgegenstand von Test 3 ist die Kernbehauptung des Features: die
// Aufbewahrungsfrist ist eine Regel in der Datenbank, keine Konstante im
// Code. Tests 1 und 2 decken den restlichen sichtbaren Vertrag der Ablage ab
// (Upload, Versionierung, Entfernen aus der Liste), den Test 3 voraussetzt.
//
// Serial-Modus + eigene WEG je Test: dasselbe Muster wie personen.spec.ts /
// finanzen-ausgaben.spec.ts. `workers: 1` in playwright.config.ts macht
// Parallelitaet ohnehin unmoeglich; serial bleibt hier trotzdem gesetzt, weil
// Test 3 eine mandantenweite Einstellung (aufbewahrungsregel) veraendert und
// das nie mit einem anderen, zeitgleich laufenden Test kollidieren darf.
//
// Datenresiduum — PERMANENT, nicht nur "noch nicht aufgeraeumt": jeder
// vollstaendige Lauf (alle drei Tests) hinterlaesst im Cloud-Tenant
// nachgezaehlt 3 weg-Zeilen, 3 document-Zeilen (eine davon — Test 2 — ueber
// dokument_entfernen soft-geloescht, die Zeile bleibt aber in der Tabelle
// stehen), 4 document_version-Zeilen und 4 Objekte im Storage-Bucket
// `weg-docs` (je ~346 Byte, die Groesse von e2e/fixtures/test.pdf). Test 3
// loescht per REST vorab/danach genau eine `aufbewahrungsregel`-Zeile
// (setzeRechnungRegelZurueck) — das ist die einzige Stelle in dieser Datei,
// die je etwas entfernt, und betrifft nur diese eine Tabelle.
//
// Das ist kein Cleanup-Versaeumnis, sondern strukturell erzwungen (0015):
// `document_version` ist append-only per Trigger
// (tg_document_version_append_only, BEFORE UPDATE/DELETE, blockt
// bedingungslos), und `document_version_document_fk` steht auf
// `on delete restrict` — ein `document` mit mindestens einer Version kann
// deshalb ueberhaupt nicht mehr geloescht werden, auch nicht mit
// `service_role`/BYPASSRLS. `document_weg_fk` ist ebenfalls `on delete
// restrict`, also wird auch die `weg`-Zeile selbst unloeschbar, sobald sie
// ein Dokument traegt — zusaetzlich zu `weg`s eigener, schon seit 0008
// bewusst fehlender DELETE-Policy. Diese drei Tests reihen sich damit in
// denselben Befund ein wie die 331 kategorisch unloeschbaren E2E-WEGs aus
// docs/agent-reports/2026-07-14-worker-general-cloud-e2e-first-run.md (dort:
// `sollstellung`/`verteilungsschluessel`, `unit`, `vote`,
// `beschluss_sammlung_entry`) — hier von Anfang an bekannt, nicht erst am
// Ende einer Aufraeumaktion entdeckt.
//
// `apps/web/scripts/cleanup-e2e-residue.mjs` enthaelt seit kurzem einen
// `document`-Loeschversuch (`bulkStep("document", …)`), der aus genau diesem
// Grund fuer jedes hier erzeugte Dokument mit "BLOCKED" endet, sobald das
// Skript laeuft — `document_version` und die Storage-Objekte selbst versucht
// es gar nicht erst zu entfernen. Kein Cleanup-Mechanismus ist hier
// vorgesehen und keiner sollte gebaut werden: er muesste genau die
// Sicherheitseigenschaft umgehen, die 0015 bewusst durchsetzt (siehe
// `docs/specs/2026-09-22-dokumentenablage-design.md`, Abschnitt "Verwaiste
// Dateien").
test.describe.configure({ mode: "serial" });

const stamp = () => Date.now();

const TEST_PDF_PATH = path.resolve(__dirname, "fixtures", "test.pdf");
// formatDateiGroesse() in .../wegs/[id]/dokumente/page.tsx rendert Bytes < 1024
// als "<n> B" ohne Rundung — die Fixture ist mit 346 Bytes weit darunter,
// die erwartete Beschriftung wird deshalb aus der tatsaechlichen Dateigroesse
// abgeleitet statt als Literal dupliziert.
const TEST_PDF_SIZE_LABEL = `${fs.statSync(TEST_PDF_PATH).size} B`;

interface HochgeladenesDokument {
  titel: string;
  dokumentId: string;
}

/**
 * Laedt ein Dokument ueber das echte Formular hoch (apps/web/.../dokumente/neu/
 * upload-form.tsx). Kein REST-Fixture verfuegbar: ein Dokument entsteht mit
 * einer echten Datei im Storage-Bucket `weg-docs`, nicht nur einer
 * Datenbankzeile — anders als z. B. createPersonFixture in helpers/fixtures.ts
 * gibt es dafuer keinen reinen REST-Seam. Fuer Tests 2 und 3 ist dieser Upload
 * Vorbedingung, nicht Testgegenstand.
 */
async function uploadDokumentUeberUi(
  page: Page,
  wegId: string,
  input: { titel: string; art: string; dokumentDatum: string },
): Promise<HochgeladenesDokument> {
  await page.goto(`/wegs/${wegId}/dokumente/neu`);
  await page.getByLabel("Titel").fill(input.titel);
  await page.getByLabel("Art").selectOption({ label: input.art });
  await page.getByLabel("Dokumentdatum").fill(input.dokumentDatum);
  await page.getByLabel("Datei").setInputFiles(TEST_PDF_PATH);
  await page.getByRole("button", { name: "Hochladen" }).click();

  await expect(page).toHaveURL(new RegExp(`/wegs/${wegId}/dokumente$`), {
    timeout: 15_000,
  });

  const zeile = page.getByRole("row").filter({ hasText: input.titel });
  await expect(zeile).toBeVisible({ timeout: 15_000 });
  const href = await zeile.getByRole("link").first().getAttribute("href");
  expect(href, "Titel-Link fehlt in der Dokumentenliste").toBeTruthy();
  const treffer = href!.match(/\/dokumente\/([0-9a-f-]{36})$/i);
  expect(treffer, `unerwartetes Href-Format: ${href}`).toBeTruthy();

  return { titel: input.titel, dokumentId: treffer![1] };
}

/**
 * Setzt eine bestehende Mandantenregel fuer `doc_typ = 'rechnung'` zurueck,
 * bevor Test 3 seine Vorbedingung aufbaut.
 *
 * Ohne diesen Schritt waere der Test nur beim ersten Lauf richtig: Zeilen
 * akkumulieren in der Cloud-DB des dedizierten E2E-Tenants (siehe
 * helpers/fixtures.ts-Kopfkommentar), und Test 3 selbst legt am Ende eine
 * 10-Jahre-Regel fuer 'rechnung' an — ein zweiter Lauf faende diese Regel
 * schon vor, und die erste Zusicherung ("bis 31.12.2027", gesetzlicher
 * Rueckfall von 8 Jahren) waere von Anfang an falsch, ohne dass das Produkt
 * einen Fehler haette. delete ueber REST statt UI: RLS scoped auf den
 * eingeloggten Mandanten (aufbewahrungsregel_delete_own_tenant, 0069), ein
 * expliziter tenant_id-Filter ist deshalb nicht noetig.
 */
async function setzeRechnungRegelZurueck(page: Page): Promise<void> {
  const { token, url, key } = await getSupabaseRequestContext(page);
  const response = await page.request.delete(
    `${url}/rest/v1/aufbewahrungsregel?doc_typ=eq.rechnung`,
    { headers: { apikey: key, Authorization: `Bearer ${token}` } },
  );
  expect(
    response.ok(),
    `Zuruecksetzen der Rechnung-Regel fehlgeschlagen: ${response.status()}`,
  ).toBe(true);
}

test.describe("dokumentenablage", () => {
  test("Dokument hochladen — erscheint in der Liste mit Titel, Art, Datum, Version und Größe", async ({
    page,
  }) => {
    const wegId = await createWegFixture(page, `E2E Dokumente ${stamp()}`, {
      street: "Dokumentenweg",
    });

    const titel = `Vertrag Hausmeister ${stamp()}`;
    await uploadDokumentUeberUi(page, wegId, {
      titel,
      art: "Vertrag",
      dokumentDatum: "2022-06-01",
    });

    // Jede Spalte einzeln und exakt pruefen — ein toContainText("1") auf die
    // ganze Zeile waere vakuos, weil Datum und Groesse fast immer irgendwo
    // eine "1" enthalten, unabhaengig davon, ob die Versions-Spalte stimmt.
    const zeile = page.getByRole("row").filter({ hasText: titel });
    const zellen = zeile.getByRole("cell");
    await expect(zellen.nth(1)).toHaveText("Vertrag");
    await expect(zellen.nth(2)).toHaveText("01.06.2022");
    await expect(zellen.nth(3)).toHaveText("1");
    await expect(zellen.nth(4)).toHaveText(TEST_PDF_SIZE_LABEL);
  });

  test("Neue Version hochladen und Dokument aus der Liste entfernen", async ({
    page,
  }) => {
    const wegId = await createWegFixture(page, `E2E Dokumente ${stamp()}`, {
      street: "Dokumentenweg",
    });

    const titel = `Beschluss Sanierung ${stamp()}`;
    const { dokumentId } = await uploadDokumentUeberUi(page, wegId, {
      titel,
      art: "Beschluss",
      dokumentDatum: "2023-01-10",
    });

    await page.goto(`/wegs/${wegId}/dokumente/${dokumentId}`);
    await expect(page).toHaveURL(
      new RegExp(`/wegs/${wegId}/dokumente/${dokumentId}$`),
    );

    // Vor der neuen Version: genau eine Version mit echtem Download-Link —
    // die Datei liegt wirklich im Storage (echter Upload oben), das Signieren
    // kann also tatsaechlich fehlschlagen, wenn der Pfad falsch waere.
    const versionsZeilen = page.locator("table tbody tr");
    await expect(versionsZeilen).toHaveCount(1);
    await expect(
      page.getByRole("link", { name: "Version 1 herunterladen" }),
    ).toBeVisible();

    // Neue Version hochladen (neue-version-form.tsx) — ersetzt nichts,
    // ergaenzt die Liste.
    await page.getByLabel("Neue Version").setInputFiles(TEST_PDF_PATH);
    await page
      .getByRole("button", { name: "Neue Version hochladen" })
      .click();

    await expect(versionsZeilen).toHaveCount(2, { timeout: 15_000 });
    const neuesteZeile = versionsZeilen.first();
    await expect(neuesteZeile.getByRole("cell").first()).toHaveText("2");
    await expect(
      page.getByRole("link", { name: "Version 2 herunterladen" }),
    ).toBeVisible();
    // Die urspruengliche Version bleibt unveraendert lesbar.
    await expect(
      page.getByRole("link", { name: "Version 1 herunterladen" }),
    ).toBeVisible();

    // Aus der Liste entfernen (entferne-dokument-button.tsx) — Soft-Delete,
    // Datei und Versionen bleiben im Storage; der aria-label ist die
    // stabile, vom Pending-Text unabhaengige Bezeichnung.
    await page
      .getByRole("button", { name: "Dokument aus der Liste entfernen" })
      .click();

    await expect(page).toHaveURL(new RegExp(`/wegs/${wegId}/dokumente$`), {
      timeout: 15_000,
    });
    await expect(page.getByText(titel)).not.toBeVisible();
  });

  test("eine geänderte Fristregel schlägt auf die Dokumentenliste durch", async ({
    page,
  }) => {
    await setzeRechnungRegelZurueck(page);

    const wegId = await createWegFixture(page, `E2E Dokumente ${stamp()}`, {
      street: "Dokumentenweg",
    });

    // 1. Rechnung mit Dokumentdatum 2019-03-15 hochladen. Gesetzlicher
    //    Rueckfall fuer 'rechnung': 8 Jahre (0069/0071) — Frist beginnt zum
    //    Schluss des Kalenderjahrs 2019, also 31.12.2019 + 8 Jahre.
    const titel = `Rechnung Heizungswartung ${stamp()}`;
    await uploadDokumentUeberUi(page, wegId, {
      titel,
      art: "Rechnung",
      dokumentDatum: "2019-03-15",
    });

    await expect(page.getByText("bis 31.12.2027")).toBeVisible();

    // 2. In den Einstellungen die Mandantenregel fuer 'rechnung' auf 10 Jahre
    //    stellen (regel-form.tsx: Feld-IDs sind "aufbewahrung-jahre-<doc_typ>").
    await page.goto("/einstellungen/aufbewahrung");
    const rechnungFormular = page
      .locator("form")
      .filter({ has: page.locator("#aufbewahrung-jahre-rechnung") });
    await rechnungFormular.locator("#aufbewahrung-jahre-rechnung").fill("10");
    await rechnungFormular
      .getByRole("button", { name: "Speichern" })
      .click();

    // Wartepunkt ist ein WERT, keine Meldung: "Aktuell: …" haengt direkt an
    // aufbewahrung_effektiv.jahre/-herkunft (0071). Der "(Vorschlag)"-Zusatz
    // entfaellt nur, wenn aus dem gesetzlichen Rueckfall eine echte
    // Mandantenregel wurde — andere Dokumentarten mit demselben
    // Rueckfallwert (bescheid/vertrag/doku: ebenfalls 10 Jahre) behalten den
    // Zusatz, die verankerte Regex bleibt also eindeutig auf 'rechnung'.
    await expect(page.getByText(/^Aktuell: 10 Jahre$/)).toBeVisible({
      timeout: 15_000,
    });

    // 3. Zurueck zur Liste: dieselbe Rechnung zeigt jetzt die neue Frist.
    //    Synchronisiert wird auf den GEAENDERTEN WERT, nicht auf einen
    //    Meldungstext.
    await page.goto(`/wegs/${wegId}/dokumente`);
    await expect(page.getByText("bis 31.12.2029")).toBeVisible();
    await expect(page.getByText("bis 31.12.2027")).not.toBeVisible();
  });
});
