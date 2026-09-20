import { test, expect, Page } from "@playwright/test";
import {
  activateWirtschaftsplanFixture,
  createUnitFixture,
  createWirtschaftsplanFixture,
  getSupabaseRequestContext,
} from "./helpers/fixtures";
import { createWegFixture } from "./helpers/weg";

/**
 * Gemischte Verteilungsschluessel und HeizkostenV (Migration 0067).
 *
 * Bis hierher brach jede Rechnung mit einem gemischten Schluessel bewusst ab.
 * Getestet wird die Kette: zwei einfache Schluessel mit Basiswerten → eine
 * 70/30-Regel daraus → Wirtschaftsplan aktivieren → die Sollstellungen treffen
 * die von Hand gerechneten Betraege.
 *
 * Verbrauch A 1.400 / B 600, Flaeche A 60 / B 40:
 *   A = 0,7 · 0,70 + 0,3 · 0,60 = 0,67  →  12.000 · 0,67 / 12 = 670,00
 *   B = 0,7 · 0,30 + 0,3 · 0,40 = 0,33  →  12.000 · 0,33 / 12 = 330,00
 */

const JAHR = 2087;

async function wegMitZweiSchluesseln(
  page: Page,
  label: string,
): Promise<{ wegId: string; unitA: string; unitB: string }> {
  const wegId = await createWegFixture(page, `E2E Mix ${label} ${Date.now()}`, {
    street: "Heizungsweg",
  });

  const unitA = await createUnitFixture(page, wegId, {
    bezeichnung: "Whg A",
    meaZaehler: 50,
    meaNenner: 100,
  });
  const unitB = await createUnitFixture(page, wegId, {
    bezeichnung: "Whg B",
    meaZaehler: 50,
    meaNenner: 100,
  });

  // Zwei einfache Schluessel, jeder mit eigenen Basiswerten.
  for (const schluessel of [
    { name: "Heizverbrauch", typ: "verbrauch", einheit: "kWh", a: "1400", b: "600" },
    { name: "Wohnfläche", typ: "flaeche", einheit: "m²", a: "60", b: "40" },
  ]) {
    await page.goto(`/wegs/${wegId}/finanzen/verteilungsschluessel/new`);
    await page.getByLabel("Name").fill(schluessel.name);
    await page.getByLabel("Verteilungsart").selectOption(schluessel.typ);
    await page.getByLabel("Rechtsgrundlage").selectOption("gesetz");
    await page.getByLabel("Gültig ab").fill("2020-01-01");
    await page.getByRole("button", { name: /^Speichern$/ }).click();

    // Ein Typ mit Basiswerten fuehrt direkt auf die Detailseite.
    await page.waitForURL(
      new RegExp(`/wegs/${wegId}/finanzen/verteilungsschluessel/[0-9a-f-]+$`),
      { timeout: 20_000 },
    );

    await page.getByLabel("Maßeinheit").fill(schluessel.einheit);
    await page.getByLabel(/Whg A/).fill(schluessel.a);
    await page.getByLabel(/Whg B/).fill(schluessel.b);
    await page.getByRole("button", { name: /^Basiswerte speichern$/ }).click();
    await expect(page.getByText("Basiswerte gespeichert")).toBeVisible({
      timeout: 20_000,
    });
  }

  return { wegId, unitA, unitB };
}

async function legeGemischtenSchluesselAn(
  page: Page,
  wegId: string,
  regelwerk: string,
): Promise<void> {
  await page.goto(`/wegs/${wegId}/finanzen/verteilungsschluessel/new`);
  await page.getByLabel("Name").fill("Heizung 70/30");
  await page.getByLabel("Verteilungsart").selectOption("gemischt");
  await page.getByLabel("Regelwerk").selectOption(regelwerk);
  await page.getByLabel("Rechtsgrundlage").selectOption("gesetz");
  await page.getByLabel("Gültig ab").fill("2020-01-01");
  await page.getByRole("button", { name: /^Speichern$/ }).click();

  await page.waitForURL(
    new RegExp(`/wegs/${wegId}/finanzen/verteilungsschluessel/[0-9a-f-]+$`),
    { timeout: 20_000 },
  );
}

async function readSollstellungen(
  page: Page,
  planId: string,
): Promise<Array<{ unit_id: string; betrag: number }>> {
  const { token, url, key } = await getSupabaseRequestContext(page);
  const res = await page.request.get(
    `${url}/rest/v1/sollstellung?wirtschaftsplan_id=eq.${planId}&select=unit_id,betrag`,
    { headers: { apikey: key, Authorization: `Bearer ${token}` } },
  );
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as Array<{ unit_id: string; betrag: number }>;
}

test.describe("Feature 8: gemischte Verteilungsschlüssel (0067)", () => {
  test("mix-verteilung: eine 70/30-Regel verteilt 12.000 € auf 670 und 330 im Monat", async ({
    page,
  }) => {
    const { wegId, unitA, unitB } = await wegMitZweiSchluesseln(page, "Verteilung");
    await legeGemischtenSchluesselAn(page, wegId, "heizkv_waerme");

    // Beide Teile wählen und gewichten.
    await page.getByRole("checkbox", { name: /Heizverbrauch/ }).check();
    await page.getByLabel(/Gewicht für Heizverbrauch/).fill("70");
    await page.getByRole("checkbox", { name: /Wohnfläche/ }).check();
    await page.getByLabel(/Gewicht für Wohnfläche/).fill("30");

    // Die Vorschau bestätigt, bevor irgendetwas gespeichert ist.
    await expect(page.getByText(/ergibt zusammen 100 %/)).toBeVisible();

    await page.getByRole("button", { name: /^Teile speichern$/ }).click();
    await expect(page.getByText(/ergibt zusammen 100 %/)).toBeVisible();

    // Plan mit einer Position über den gemischten Schlüssel.
    const planId = await createWirtschaftsplanFixture(page, {
      wegId,
      jahr: JAHR,
      bezeichnung: `Plan ${JAHR}`,
      gesamtkosten: 12000,
    });

    await page.goto(`/wegs/${wegId}/finanzen/${planId}/positionen`);
    await page.getByLabel("Kostenart").fill("Heizung");
    await page.getByLabel("Jahresbetrag (€)").fill("12000");
    // Ueber den Wert, nicht ueber das Label: das Label setzt sich aus Name und
    // Typbezeichnung zusammen und wuerde bei jeder Umbenennung brechen.
    const auswahl = page.getByLabel("Verteilungsschlüssel");
    const versionId = await auswahl
      .getByRole("option", { name: /Heizung 70\/30/ })
      .getAttribute("value");
    expect(versionId).toBeTruthy();
    await auswahl.selectOption(versionId as string);
    await page.getByRole("button", { name: /^Position hinzufügen$/ }).click();
    await expect(
      page.getByRole("row").filter({ hasText: "Heizung" }),
    ).toContainText("12.000,00 €");

    await activateWirtschaftsplanFixture(page, planId);

    const soll = await readSollstellungen(page, planId);
    const betraegeA = new Set(
      soll.filter((s) => s.unit_id === unitA).map((s) => Number(s.betrag)),
    );
    const betraegeB = new Set(
      soll.filter((s) => s.unit_id === unitB).map((s) => Number(s.betrag)),
    );

    expect(soll).toHaveLength(24);
    expect([...betraegeA]).toEqual([670]);
    expect([...betraegeB]).toEqual([330]);
  });

  test("mix-korridor: 80 Prozent nach Verbrauch werden mit Begründung abgelehnt", async ({
    page,
  }) => {
    const { wegId } = await wegMitZweiSchluesseln(page, "Korridor");
    await legeGemischtenSchluesselAn(page, wegId, "heizkv_waerme");

    await page.getByRole("checkbox", { name: /Heizverbrauch/ }).check();
    await page.getByLabel(/Gewicht für Heizverbrauch/).fill("80");
    await page.getByRole("checkbox", { name: /Wohnfläche/ }).check();
    await page.getByLabel(/Gewicht für Wohnfläche/).fill("20");

    // Die Meldung steht schon vor dem Speichern — und nennt die Grenze.
    await expect(page.getByText(/Nach HeizkostenV sind mindestens 50/)).toBeVisible();

    await page.getByRole("button", { name: /^Teile speichern$/ }).click();

    // Auch nach dem Absenden: der Serverpfad lehnt mit derselben Begründung ab.
    await expect(page.getByText(/Nach HeizkostenV sind mindestens 50/)).toBeVisible();
  });

  test("mix-pflichtfall: § 7 Abs. 1 Satz 2 lässt nur genau 70 Prozent zu", async ({
    page,
  }) => {
    const { wegId } = await wegMitZweiSchluesseln(page, "Pflicht");
    await legeGemischtenSchluesselAn(page, wegId, "heizkv_waerme_70");

    await page.getByRole("checkbox", { name: /Heizverbrauch/ }).check();
    await page.getByLabel(/Gewicht für Heizverbrauch/).fill("65");
    await page.getByRole("checkbox", { name: /Wohnfläche/ }).check();
    await page.getByLabel(/Gewicht für Wohnfläche/).fill("35");

    // 65/35 summiert auf 100 und läge im normalen Korridor — hier nicht.
    await expect(page.getByText(/Für dieses Gebäude schreibt/)).toBeVisible();

    await page.getByLabel(/Gewicht für Heizverbrauch/).fill("70");
    await page.getByLabel(/Gewicht für Wohnfläche/).fill("30");
    await expect(page.getByText(/ergibt zusammen 100 %/)).toBeVisible();
  });
});
