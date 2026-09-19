import { test, expect, Page } from "@playwright/test";
import {
  activateWirtschaftsplanFixture,
  createUnitFixture,
  createWirtschaftsplanFixture,
} from "./helpers/fixtures";
import { createWegFixture } from "./helpers/weg";

/**
 * Zahlungskette (Migration 0061) — durch die Oberflaeche.
 *
 * Testgegenstand ist die Kette Zahlung erfassen -> zuordnen -> offener Posten
 * sinkt. Die SQL-Garantien deckt der pgTAP-Vertrag ab, die Grenzen der
 * Zuordnung die Modultests; hier geht es darum, dass ein Mensch im Browser zu
 * den richtigen Restbetraegen kommt.
 *
 * Vorbedingungen (WEG, Einheit, Plan, Aktivierung) ueber den REST-Seam. Jeder
 * Test hat seine eigene WEG.
 */

/** Eine Einheit mit vollem MEA: 12.000 € / 12 = 1.000,00 € je Monat. */
async function wegMitAktiviertemPlan(
  page: Page,
  label: string,
  jahr: number,
): Promise<{ wegId: string; unit: string }> {
  const wegId = await createWegFixture(
    page,
    `E2E Zahl ${label} ${Date.now()}`,
    { street: "Zahlungsweg" },
  );

  const unit = `Whg ${label}`;
  await createUnitFixture(page, wegId, {
    bezeichnung: unit,
    meaZaehler: 1000,
    meaNenner: 1000,
  });

  const planId = await createWirtschaftsplanFixture(page, {
    wegId,
    jahr,
    bezeichnung: `Plan ${label}`,
    gesamtkosten: 12000,
  });
  await activateWirtschaftsplanFixture(page, planId);

  return { wegId, unit };
}

async function erfasseZahlung(
  page: Page,
  wegId: string,
  input: { betrag: string; datum: string; referenz: string },
): Promise<void> {
  await page.goto(`/wegs/${wegId}/finanzen/zahlungen`);
  await page.getByLabel("Betrag (€)").fill(input.betrag);
  await page.getByLabel("Wertstellung").fill(input.datum);
  await page.getByLabel("Einzahler / Verwendungszweck").fill(input.referenz);
  await page.getByRole("button", { name: /^Zahlung erfassen$/ }).click();

  // Die Action leitet direkt auf die Zuordnungsseite weiter.
  await page.waitForURL(
    new RegExp(`/wegs/${wegId}/finanzen/zahlungen/[0-9a-f-]+$`),
    { timeout: 20_000 },
  );
}

test.describe("Feature 4b: Zahlungen und offene Posten (0061)", () => {
  test("zahlung-voll-zugeordnet: eine Vollzahlung schließt den offenen Posten", async ({
    page,
  }) => {
    const { wegId } = await wegMitAktiviertemPlan(page, "Voll", 2070);

    // Vor der Zahlung: 12 offene Posten zu je 1.000,00 €.
    await page.goto(`/wegs/${wegId}/finanzen/offene-posten`);
    await expect(page.getByRole("row").filter({ hasText: "01/2070" })).toContainText(
      "1.000,00 €",
    );

    await erfasseZahlung(page, wegId, {
      betrag: "1000",
      datum: "2070-01-05",
      referenz: "Muster, Hausgeld Januar",
    });

    // Zuordnung auf Januar.
    const januarZeile = page.getByRole("row").filter({ hasText: "01/2070" });
    await januarZeile.getByRole("spinbutton").fill("1000");
    await page.getByRole("button", { name: /^Zuordnung speichern$/ }).click();
    await expect(page.getByRole("status")).toContainText("Zuordnung gespeichert");

    // Januar ist weg, die übrigen elf Monate stehen noch offen.
    await page.goto(`/wegs/${wegId}/finanzen/offene-posten`);
    await expect(
      page.getByRole("row").filter({ hasText: "01/2070" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("row").filter({ hasText: "02/2070" }),
    ).toContainText("1.000,00 €");
  });

  test("zahlung-teilzahlung: eine Teilzahlung lässt den Rest offen", async ({
    page,
  }) => {
    const { wegId } = await wegMitAktiviertemPlan(page, "Teil", 2071);

    await erfasseZahlung(page, wegId, {
      betrag: "400",
      datum: "2071-01-05",
      referenz: "Muster, Teilzahlung",
    });

    const januarZeile = page.getByRole("row").filter({ hasText: "01/2071" });
    await januarZeile.getByRole("spinbutton").fill("400");
    await page.getByRole("button", { name: /^Zuordnung speichern$/ }).click();
    await expect(page.getByRole("status")).toContainText("Zuordnung gespeichert");

    // 1.000 − 400 = 600 bleiben offen.
    await page.goto(`/wegs/${wegId}/finanzen/offene-posten`);
    await expect(
      page.getByRole("row").filter({ hasText: "01/2071" }),
    ).toContainText("600,00 €");
  });

  test("zahlung-verteilen: der Vorschlag bedient die ältesten Posten zuerst", async ({
    page,
  }) => {
    const { wegId } = await wegMitAktiviertemPlan(page, "Verteilen", 2072);

    // 2.500 € decken Januar und Februar voll und März zur Hälfte.
    await erfasseZahlung(page, wegId, {
      betrag: "2500",
      datum: "2072-01-05",
      referenz: "Muster, Quartal",
    });

    await page
      .getByRole("button", { name: /Auf älteste offene Posten verteilen/ })
      .click();

    await expect(
      page.getByRole("row").filter({ hasText: "01/2072" }).getByRole("spinbutton"),
    ).toHaveValue("1000");
    await expect(
      page.getByRole("row").filter({ hasText: "03/2072" }).getByRole("spinbutton"),
    ).toHaveValue("500");

    await page.getByRole("button", { name: /^Zuordnung speichern$/ }).click();
    await expect(page.getByRole("status")).toContainText("Zuordnung gespeichert");

    await page.goto(`/wegs/${wegId}/finanzen/offene-posten`);
    await expect(
      page.getByRole("row").filter({ hasText: "01/2072" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("row").filter({ hasText: "03/2072" }),
    ).toContainText("500,00 €");
  });
});
