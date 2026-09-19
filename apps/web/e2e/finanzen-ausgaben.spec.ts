import { test, expect, Page } from "@playwright/test";
import { createUnitFixture } from "./helpers/fixtures";
import { createWegFixture } from "./helpers/weg";

/**
 * Ausgaben und Erhaltungsruecklage (Migration 0062) — durch die Oberflaeche.
 *
 * Testgegenstand: dass eine erfasste Ausgabe im richtigen Abrechnungsjahr
 * landet (Zufluss-/Abflussprinzip) und dass die Ruecklagen-Entwicklung die vier
 * Groessen aus § 28 Abs. 2 korrekt fortschreibt — inklusive der
 * Stichtagsgrenze, die eine zu frueh datierte Entnahme ablehnt.
 *
 * Jeder Test legt seine eigene WEG an.
 */

async function wegMitSchluessel(
  page: Page,
  label: string,
): Promise<string> {
  const wegId = await createWegFixture(
    page,
    `E2E Ausg ${label} ${Date.now()}`,
    { street: "Ausgabenweg" },
  );

  await createUnitFixture(page, wegId, {
    bezeichnung: `Whg ${label}`,
    meaZaehler: 1000,
    meaNenner: 1000,
  });

  // Verteilungsschluessel ueber das UI, damit die Ausgabe einen waehlbaren
  // Schluessel hat (eine Ausgabe ohne Schluessel gibt es per Schema nicht).
  await page.goto(`/wegs/${wegId}/finanzen/verteilungsschluessel/new`);
  await page.getByLabel("Name").fill("MEA");
  await page.getByLabel("Verteilungsart").selectOption("mea");
  await page.getByLabel("Rechtsgrundlage").selectOption("gesetz");
  await page.getByLabel("Gültig ab").fill("2020-01-01");
  await page.getByRole("button", { name: /^Speichern$/ }).click();
  await page.waitForURL(
    new RegExp(`/wegs/${wegId}/finanzen/verteilungsschluessel$`),
    { timeout: 20_000 },
  );

  return wegId;
}

test.describe("Feature 5: Ausgaben und Erhaltungsrücklage (0062)", () => {
  test("ausgabe-jahr: das Wertstellungsdatum bestimmt das Abrechnungsjahr", async ({
    page,
  }) => {
    const wegId = await wegMitSchluessel(page, "Jahr");

    await page.goto(`/wegs/${wegId}/finanzen/ausgaben`);
    await page.getByLabel("Betrag (€)").fill("250,50");
    await page.getByLabel("Wertstellung").fill("2080-03-01");
    await page.getByLabel("Empfänger").fill("Stadtwerke");
    await page.getByLabel("Kostenart").fill("Allgemeinstrom");
    await page.getByRole("button", { name: /^Ausgabe erfassen$/ }).click();

    // Gruppiert nach Jahr, mit Summe je Jahr.
    await expect(page.getByRole("heading", { name: "2080" })).toBeVisible();
    await expect(
      page.getByRole("row").filter({ hasText: "Stadtwerke" }),
    ).toContainText("250,50 €");
  });

  test("ruecklage-entwicklung: Zuführungen und Entnahmen schreiben den Bestand fort", async ({
    page,
  }) => {
    const wegId = await wegMitSchluessel(page, "Rücklage");

    await page.goto(`/wegs/${wegId}/finanzen/ruecklage`);

    // Anfangsbestand 10.000 zum 01.01.2080.
    await page.getByLabel("Bewegungsart").selectOption("anfangsbestand");
    await page.getByLabel("Betrag (€)").fill("10000");
    await page.getByLabel("Datum").fill("2080-01-01");
    await page.getByRole("button", { name: /^Bewegung erfassen$/ }).click();
    await expect(page.getByRole("status")).toContainText("Bewegung gespeichert");

    // Zuführung 2.000 im selben Jahr.
    await page.getByLabel("Bewegungsart").selectOption("zufuehrung");
    await page.getByLabel("Betrag (€)").fill("2000");
    await page.getByLabel("Datum").fill("2080-06-01");
    await page.getByRole("button", { name: /^Bewegung erfassen$/ }).click();
    await expect(page.getByRole("status")).toContainText("Bewegung gespeichert");

    // Entnahme 500 — danach 11.500.
    await page.getByLabel("Bewegungsart").selectOption("entnahme");
    await page.getByLabel("Betrag (€)").fill("500");
    await page.getByLabel("Datum").fill("2080-09-01");
    await page.getByRole("button", { name: /^Bewegung erfassen$/ }).click();
    await expect(page.getByRole("status")).toContainText("Bewegung gespeichert");

    const zeile2080 = page.getByRole("row").filter({ hasText: "2080" });
    await expect(zeile2080).toContainText("10.000,00 €"); // Anfang
    await expect(zeile2080).toContainText("2.000,00 €"); // Zuführungen
    await expect(zeile2080).toContainText("500,00 €"); // Entnahmen
    await expect(zeile2080).toContainText("11.500,00 €"); // Ende
  });

  test("ruecklage-stichtag: eine zu früh datierte Entnahme wird abgelehnt", async ({
    page,
  }) => {
    const wegId = await wegMitSchluessel(page, "Stichtag");

    await page.goto(`/wegs/${wegId}/finanzen/ruecklage`);

    await page.getByLabel("Bewegungsart").selectOption("anfangsbestand");
    await page.getByLabel("Betrag (€)").fill("1000");
    await page.getByLabel("Datum").fill("2081-01-01");
    await page.getByRole("button", { name: /^Bewegung erfassen$/ }).click();
    await expect(page.getByRole("status")).toContainText("Bewegung gespeichert");

    await page.getByLabel("Bewegungsart").selectOption("zufuehrung");
    await page.getByLabel("Betrag (€)").fill("5000");
    await page.getByLabel("Datum").fill("2081-12-01");
    await page.getByRole("button", { name: /^Bewegung erfassen$/ }).click();
    await expect(page.getByRole("status")).toContainText("Bewegung gespeichert");

    // Bestand am Jahresende: 6.000. Zum 01.02.2081 aber erst 1.000 —
    // eine Entnahme von 3.000 zu diesem Datum darf nicht durchgehen.
    await page.getByLabel("Bewegungsart").selectOption("entnahme");
    await page.getByLabel("Betrag (€)").fill("3000");
    await page.getByLabel("Datum").fill("2081-02-01");

    // Die Vorschau warnt schon vor dem Absenden.
    await expect(page.getByRole("status")).toContainText(
      "sind erst 1.000,00 € vorhanden",
    );

    await page.getByRole("button", { name: /^Bewegung erfassen$/ }).click();

    // Und die Datenbank lehnt ab, falls doch abgeschickt wird.
    await expect(page.getByRole("alert").or(page.getByText(/übersteigt/))).toBeVisible();
  });
});
