import { test, expect, Page } from "@playwright/test";
import { activateWirtschaftsplan } from "./helpers/finanzen";
import {
  createUnitFixture,
  createWirtschaftsplanFixture,
  getSupabaseRequestContext,
} from "./helpers/fixtures";
import { createWegFixture } from "./helpers/weg";

/**
 * Positionen-Pfad (Migration 0060) — Ende zu Ende durch die Oberflaeche.
 *
 * Testgegenstand ist bewusst die Kette Formular -> Server Action -> Generator:
 * pgTAP belegt die SQL-Seite, Unit-Tests die Actions, aber nichts davon
 * beweist, dass ein Mensch im Browser zu korrekten Betraegen kommt. Das ist
 * die einzige Stelle im Produkt, an der ein Eingabefehler unmittelbar in
 * unveraenderliche Geldbetraege muendet (Sollstellungen sind insert-only).
 *
 * Vorbedingungen (WEG, Einheiten, Plan) kommen ueber den REST-Seam; das UI
 * wird nur fuer den eigentlichen Testgegenstand bedient. Jeder Test legt seine
 * eigene WEG an, damit die bekannte Reihenfolge-Fragilitaet der Suite
 * (docs/agent-reports/2026-07-14-...) hier nicht greift.
 */

async function createWegWithTwoUnits(
  page: Page,
  label: string,
): Promise<{ wegId: string; unitA: string; unitB: string }> {
  const wegId = await createWegFixture(
    page,
    `E2E Pos ${label} ${Date.now()}`,
    { street: "Positionenweg" },
  );

  const bezeichnungA = `Whg A ${label}`;
  const bezeichnungB = `Whg B ${label}`;

  await createUnitFixture(page, wegId, {
    bezeichnung: bezeichnungA,
    meaZaehler: 400,
    meaNenner: 1000,
  });
  await createUnitFixture(page, wegId, {
    bezeichnung: bezeichnungB,
    meaZaehler: 600,
    meaNenner: 1000,
  });

  return { wegId, unitA: bezeichnungA, unitB: bezeichnungB };
}

/** Legt einen Verteilungsschluessel ueber das Formular an. */
async function createKeyViaUi(
  page: Page,
  wegId: string,
  input: { name: string; typ: string; quelle?: string },
): Promise<void> {
  await page.goto(`/wegs/${wegId}/finanzen/verteilungsschluessel/new`);
  await page.getByLabel("Name").fill(input.name);
  await page.getByLabel("Verteilungsart").selectOption(input.typ);
  await page.getByLabel("Rechtsgrundlage").selectOption(input.quelle ?? "beschluss");
  await page.getByLabel("Gültig ab").fill("2020-01-01");
  await page.getByRole("button", { name: /^Speichern$/ }).click();
}

async function readSollstellungen(
  page: Page,
  planId: string,
): Promise<Array<{ unit_id: string; monat: number; betrag: number }>> {
  const { token, url, key } = await getSupabaseRequestContext(page);
  const res = await page.request.get(
    `${url}/rest/v1/sollstellung?wirtschaftsplan_id=eq.${planId}&select=unit_id,monat,betrag`,
    { headers: { apikey: key, Authorization: `Bearer ${token}` } },
  );
  expect(res.ok(), `sollstellung read failed: ${res.status()}`).toBe(true);

  const rows = (await res.json()) as Array<{
    unit_id: string;
    monat: number;
    betrag: number | string;
  }>;
  return rows.map((row) => ({ ...row, betrag: Number(row.betrag) }));
}

test.describe("Feature 3b: Wirtschaftsplan-Positionen (0060)", () => {
  test("positionen-flaeche-end-to-end: Schlüssel, Basiswerte und Position über das UI ergeben flächenanteilige Sollstellungen", async ({
    page,
  }) => {
    const { wegId, unitA, unitB } = await createWegWithTwoUnits(page, "E2E");

    // gesamtkosten liegt bewusst weit neben dem Positionsbetrag: taucht es in
    // den Sollstellungen auf, hat der Generator die Positionen ignoriert.
    const planId = await createWirtschaftsplanFixture(page, {
      wegId,
      jahr: 2050,
      bezeichnung: "Plan mit Positionen",
      gesamtkosten: 99999,
    });

    // 1. Schlüssel anlegen — Typ flaeche leitet direkt auf die Detailseite weiter.
    await createKeyViaUi(page, wegId, { name: "Wohnfläche", typ: "flaeche" });
    await page.waitForURL(
      new RegExp(`/wegs/${wegId}/finanzen/verteilungsschluessel/[0-9a-f-]+$`),
      { timeout: 20_000 },
    );

    // 2. Basiswerte je Einheit pflegen: 75 / 25 => Anteile 0,75 / 0,25.
    await page.getByLabel("Maßeinheit").fill("m²");
    await page.getByLabel(unitA, { exact: true }).fill("75");
    await page.getByLabel(unitB, { exact: true }).fill("25");

    // Die Vorschau spiegelt die Generator-Semantik — sie muss vor dem
    // Speichern schon die späteren Anteile zeigen.
    await expect(page.getByRole("row").filter({ hasText: unitA })).toContainText(
      "75,00 %",
    );
    await expect(page.getByRole("row").filter({ hasText: unitB })).toContainText(
      "25,00 %",
    );

    await page.getByRole("button", { name: /^Basiswerte speichern$/ }).click();
    await expect(page.getByRole("status")).toContainText(
      "Basiswerte gespeichert",
    );

    // 3. Position am Wirtschaftsplan anlegen.
    await page.goto(`/wegs/${wegId}/finanzen/${planId}/positionen`);
    await page.getByLabel("Kostenart").fill("Hausreinigung");
    await page.getByLabel("Jahresbetrag (€)").fill("12000");
    await page
      .getByLabel("Verteilungsschlüssel")
      .selectOption({ label: "Wohnfläche — Wohnfläche" });
    await page.getByRole("button", { name: /^Position hinzufügen$/ }).click();

    await expect(
      page.getByRole("row").filter({ hasText: "Hausreinigung" }),
    ).toContainText("12.000,00 €");

    // 4. Aktivieren — erst dadurch entstehen Sollstellungen.
    await activateWirtschaftsplan(page, wegId, planId);

    // 5. Die Beträge müssen der Fläche folgen, nicht den Miteigentumsanteilen.
    //    Flächenanteil: 12000 * 0,75 / 12 = 750,00 bzw. 12000 * 0,25 / 12 = 250,00.
    //    Nach MEA wären es 400,00 / 600,00 gewesen, aus gesamtkosten etwas völlig anderes.
    const rows = await readSollstellungen(page, planId);
    expect(rows).toHaveLength(24);

    const betraege = rows.map((row) => row.betrag);
    expect(betraege.filter((betrag) => betrag === 750)).toHaveLength(12);
    expect(betraege.filter((betrag) => betrag === 250)).toHaveLength(12);
  });

  test("positionen-basiswert-luecke: das Formular verweigert unvollständige Basiswerte", async ({
    page,
  }) => {
    const { wegId, unitA, unitB } = await createWegWithTwoUnits(page, "Lücke");

    await createKeyViaUi(page, wegId, { name: "Verbrauch", typ: "verbrauch" });
    await page.waitForURL(
      new RegExp(`/wegs/${wegId}/finanzen/verteilungsschluessel/[0-9a-f-]+$`),
      { timeout: 20_000 },
    );

    // Nur eine der beiden Einheiten bekommt einen Wert. Der Generator würde das
    // später mit 23514 ablehnen — das Formular muss es vorher abfangen, sonst
    // fällt der Fehler erst bei der Aktivierung auf.
    await page.getByLabel("Maßeinheit").fill("kWh");
    await page.getByLabel(unitA, { exact: true }).fill("120");
    await page.getByLabel(unitB, { exact: true }).fill("");

    await expect(page.getByRole("status")).toContainText(
      "Solange nicht jede Einheit einen Wert hat",
    );

    // Absenden per Klick wird von der HTML-Validierung (required) gestoppt;
    // die Server Action prüft dieselbe Regel noch einmal. Entscheidend ist,
    // dass kein gespeicherter Zustand mit Lücke entsteht.
    await page.getByRole("button", { name: /^Basiswerte speichern$/ }).click();
    await expect(page.getByRole("status")).not.toContainText(
      "Basiswerte gespeichert",
    );
  });

  test("positionen-gemischt-waehlbar: gemischte Schlüssel stehen zur Auswahl", async ({
    page,
  }) => {
    const { wegId } = await createWegWithTwoUnits(page, "Gemischt");
    const planId = await createWirtschaftsplanFixture(page, {
      wegId,
      jahr: 2051,
      bezeichnung: "Plan Gemischt",
      gesamtkosten: 12000,
    });

    await createKeyViaUi(page, wegId, {
      name: "Heizung",
      typ: "gemischt",
      quelle: "gesetz",
    });

    // Seit 0067 fuehrt das Anlegen auf die Detailseite: eine gemischte Regel
    // ist ohne ihre Teile unbrauchbar, genau wie ein Flaechenschluessel ohne
    // Basiswerte.
    await page.waitForURL(
      new RegExp(`/wegs/${wegId}/finanzen/verteilungsschluessel/[0-9a-f-]+$`),
      { timeout: 20_000 },
    );
    await expect(
      page.getByRole("heading", { name: "Zusammensetzung der Regel" }),
    ).toBeVisible();

    // Und im Positionsformular ist er waehlbar — der Generator loest ihn auf.
    await page.goto(`/wegs/${wegId}/finanzen/${planId}/positionen`);
    const select = page.getByLabel("Verteilungsschlüssel");
    await expect(select).toBeVisible();
    await expect(select.getByRole("option", { name: /Heizung/ })).toHaveCount(1);
  });
});
