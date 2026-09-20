import { test, expect, Page } from "@playwright/test";
import { createWegFixture } from "./helpers/weg";

/**
 * Vermoegensbericht (Migration 0065) — durch die Oberflaeche.
 *
 * Zwei Dinge sollen hier bewiesen werden, die sich im Code leicht behaupten,
 * aber nur am laufenden System zeigen lassen:
 *
 *   1. Der Bericht steht auf dem 31.12. Eine Ruecklagenbewegung aus dem
 *      Folgejahr darf ihn nicht beruehren — auch dann nicht, wenn sie beim
 *      Erstellen laengst gebucht ist.
 *   2. Ein Sachwert darf ohne Betrag stehen und geht in keine Summe ein.
 *      "Die Bestandteile des Vermoegens beduerfen keiner Bewertung."
 *
 * Synchronisiert wird auf Werte, die sich bei jeder Aktion aendern (der
 * ausgewiesene Bestand, die sichtbare Zeile) — nicht auf eine Meldung. Eine
 * Erfolgsmeldung bleibt nach dem ersten Speichern stehen und hat in 0062 schon
 * einmal einen Scheintest erzeugt.
 */

const JAHR = 2086;

async function wegMitRuecklage(page: Page, label: string): Promise<string> {
  const wegId = await createWegFixture(page, `E2E VB ${label} ${Date.now()}`, {
    street: "Vermögensweg",
  });

  // Anfangsbestand 1.000 zum Vorjahresende, +500 im Berichtsjahr und +999 im
  // Folgejahr. Der Bericht fuer JAHR muss 1.000 → 1.500 zeigen.
  await page.goto(`/wegs/${wegId}/finanzen/ruecklage`);
  for (const bewegung of [
    { richtung: "anfangsbestand", betrag: "1000", datum: `${JAHR - 1}-12-31` },
    { richtung: "zufuehrung", betrag: "500", datum: `${JAHR}-06-01` },
    { richtung: "zufuehrung", betrag: "999", datum: `${JAHR + 1}-03-01` },
  ]) {
    await page.getByLabel("Bewegungsart").selectOption(bewegung.richtung);
    await page.getByLabel("Betrag (€)").fill(bewegung.betrag);
    await page.getByLabel("Datum").fill(bewegung.datum);
    await page.getByRole("button", { name: /^Bewegung erfassen$/ }).click();
    // Auf den fortgeschriebenen Bestand warten, nicht auf eine Meldung.
    await expect(
      page.getByRole("row").filter({ hasText: String(bewegung.datum.slice(0, 4)) }),
    ).not.toHaveCount(0);
  }

  return wegId;
}

async function erstelleBericht(page: Page, wegId: string): Promise<void> {
  await page.goto(`/wegs/${wegId}/finanzen/vermoegensberichte`);
  await page.getByLabel("Berichtsjahr").fill(String(JAHR));
  await page
    .getByRole("button", { name: /^Vermögensbericht erstellen$/ })
    .click();
  await page.waitForURL(
    new RegExp(`/wegs/${wegId}/finanzen/vermoegensberichte/[0-9a-f-]+$`),
    { timeout: 20_000 },
  );
}

test.describe("Feature 7: Vermögensbericht (0065)", () => {
  test("vermoegensbericht-stichtag: eine Bewegung aus dem Folgejahr bleibt außen vor", async ({
    page,
  }) => {
    const wegId = await wegMitRuecklage(page, "Stichtag");
    await erstelleBericht(page, wegId);

    await expect(page.getByText(`Stichtag 31.12.${JAHR}`)).toBeVisible();

    const ruecklagenZeile = page
      .getByRole("row")
      .filter({ hasText: "Erhaltungsrücklage" });
    await expect(ruecklagenZeile).toContainText("1.000,00 €"); // Anfang
    await expect(ruecklagenZeile).toContainText("1.500,00 €"); // Ende

    // 2.499 wäre der Bestand einschließlich der Zuführung aus dem Folgejahr.
    // Stünde die Zahl irgendwo, wäre der Stichtag wirkungslos.
    await expect(page.getByText("2.499,00 €")).toHaveCount(0);
  });

  test("vermoegensbericht-sachwert: genannt, nicht bewertet — und nicht in der Summe", async ({
    page,
  }) => {
    const wegId = await wegMitRuecklage(page, "Sachwert");
    await erstelleBericht(page, wegId);

    // Ohne Konten ist das Nettovermögen null.
    await expect(page.getByText("0,00 €").first()).toBeVisible();

    // Ein Konto mit Anfangs- und Endbestand.
    await page.getByLabel("Abschnitt").selectOption("konto");
    await page.getByLabel("Bezeichnung").fill("Girokonto");
    await page.getByLabel("Anfangsbestand (€)").fill("2000");
    await page.getByLabel("Endbestand (€)").fill("3000");
    await page.getByRole("button", { name: /^Position hinzufügen$/ }).click();

    // Das Nettovermögen ändert sich mit jeder Buchung — darauf lässt sich
    // synchronisieren, anders als auf eine stehenbleibende Meldung.
    await expect(page.getByText("3.000,00 €").first()).toBeVisible();

    // Ein Sachwert ohne Betrag.
    await page.getByLabel("Abschnitt").selectOption("sachwert");
    await page.getByLabel("Bezeichnung").fill("Aufsitzrasenmäher");
    await page.getByRole("button", { name: /^Position hinzufügen$/ }).click();

    const sachwertZeile = page
      .getByRole("row")
      .filter({ hasText: "Aufsitzrasenmäher" });
    await expect(sachwertZeile).toBeVisible();
    await expect(sachwertZeile).toContainText("ohne Bewertung");

    // Und er verändert das Nettovermögen nicht.
    await expect(page.getByText("3.000,00 €").first()).toBeVisible();
  });

  test("vermoegensbericht-fertigstellen: danach nimmt der Bericht nichts mehr an", async ({
    page,
  }) => {
    const wegId = await wegMitRuecklage(page, "Fertig");
    await erstelleBericht(page, wegId);

    await page.getByLabel("Abschnitt").selectOption("verbindlichkeit");
    await page.getByLabel("Bezeichnung").fill("Offene Rechnung Dachdecker");
    await page.getByLabel("Betrag (€)").fill("1200");
    await page.getByRole("button", { name: /^Position hinzufügen$/ }).click();
    await expect(page.getByText("-1.200,00 €").first()).toBeVisible();

    await page.getByLabel("Datum der Erstellung").fill(`${JAHR + 1}-05-01`);
    await page.getByRole("button", { name: /^Bericht fertigstellen$/ }).click();

    // Beide Formulare verschwinden, der Status steht im Kopf.
    await expect(
      page.getByRole("button", { name: /^Position hinzufügen$/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /^Bericht fertigstellen$/ }),
    ).toHaveCount(0);
    await expect(page.getByText(/Erstellt am/)).toBeVisible();

    // Und "Entfernen" ist weg — die Position ist eingefroren.
    await expect(page.getByRole("button", { name: /Entfernen$/ })).toHaveCount(
      0,
    );
  });

  test("vermoegensbericht-berichtigung: ein zweiter Bericht löst den ersten ab", async ({
    page,
  }) => {
    const wegId = await wegMitRuecklage(page, "Berichtigung");

    await erstelleBericht(page, wegId);
    await page.getByLabel("Datum der Erstellung").fill(`${JAHR + 1}-05-01`);
    await page.getByRole("button", { name: /^Bericht fertigstellen$/ }).click();
    await expect(page.getByText(/Erstellt am/)).toBeVisible();

    await erstelleBericht(page, wegId);
    await page.getByLabel("Datum der Erstellung").fill(`${JAHR + 1}-09-20`);
    await page.getByRole("button", { name: /^Bericht fertigstellen$/ }).click();
    await expect(page.getByText(/Fassung 2/)).toBeVisible();

    await page.goto(`/wegs/${wegId}/finanzen/vermoegensberichte`);
    await expect(page.getByRole("cell", { name: "Erstellt" })).toHaveCount(1);
    await expect(page.getByRole("cell", { name: "Abgelöst" })).toHaveCount(1);
  });
});
