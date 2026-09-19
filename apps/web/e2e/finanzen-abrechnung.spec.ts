import { test, expect, Page } from "@playwright/test";
import {
  activateWirtschaftsplanFixture,
  createUnitFixture,
  createWirtschaftsplanFixture,
} from "./helpers/fixtures";
import { createWegFixture } from "./helpers/weg";

/**
 * Jahresabrechnung (Migration 0063) — durch die Oberflaeche.
 *
 * Testgegenstand ist die Kette Ausgaben + aktivierter Wirtschaftsplan →
 * Abrechnung erstellen → Spitze stimmt → beschliessen → gesperrt.
 *
 * Die Zahlen sind so gewaehlt, dass eine Einheit nachzahlt und die andere ein
 * Guthaben hat — sonst koennte ein Vorzeichenfehler unbemerkt bleiben.
 */

const JAHR = 2085;

/**
 * WEG mit zwei Einheiten (MEA 400/1000 und 600/1000), aktiviertem Plan ueber
 * 12.000 € (Soll: A 4.800, B 7.200) und einem MEA-Schluessel.
 */
async function wegMitPlanUndSchluessel(
  page: Page,
  label: string,
): Promise<{ wegId: string }> {
  const wegId = await createWegFixture(
    page,
    `E2E Abr ${label} ${Date.now()}`,
    { street: "Abrechnungsweg" },
  );

  await createUnitFixture(page, wegId, {
    bezeichnung: `Whg A ${label}`,
    meaZaehler: 400,
    meaNenner: 1000,
  });
  await createUnitFixture(page, wegId, {
    bezeichnung: `Whg B ${label}`,
    meaZaehler: 600,
    meaNenner: 1000,
  });

  const planId = await createWirtschaftsplanFixture(page, {
    wegId,
    jahr: JAHR,
    bezeichnung: `Plan ${JAHR}`,
    gesamtkosten: 12000,
  });
  await activateWirtschaftsplanFixture(page, planId);

  // Zwei Schluessel, die gegenlaeufig wirken. Mit nur einem proportionalen
  // Schluessel zahlen bei Ausgaben ueber Plan zwangslaeufig ALLE nach — ein
  // Guthaben kann dann gar nicht entstehen, und ein Vorzeichenfehler bliebe
  // unentdeckt.
  for (const schluessel of [
    { name: "MEA", typ: "mea" },
    { name: "Pro Einheit", typ: "einheit" },
  ]) {
    await page.goto(`/wegs/${wegId}/finanzen/verteilungsschluessel/new`);
    await page.getByLabel("Name").fill(schluessel.name);
    await page.getByLabel("Verteilungsart").selectOption(schluessel.typ);
    await page.getByLabel("Rechtsgrundlage").selectOption("gesetz");
    await page.getByLabel("Gültig ab").fill("2020-01-01");
    await page.getByRole("button", { name: /^Speichern$/ }).click();
    await page.waitForURL(
      new RegExp(`/wegs/${wegId}/finanzen/verteilungsschluessel$`),
      { timeout: 20_000 },
    );
  }

  return { wegId };
}

async function erfasseAusgabe(
  page: Page,
  wegId: string,
  input: {
    betrag: string;
    datum: string;
    empfaenger: string;
    kostenart: string;
    /** Label wie im Auswahlfeld, z. B. "MEA — Miteigentumsanteile (MEA)". */
    schluessel: string;
  },
): Promise<void> {
  await page.goto(`/wegs/${wegId}/finanzen/ausgaben`);
  await page.getByLabel("Betrag (€)").fill(input.betrag);
  await page.getByLabel("Wertstellung").fill(input.datum);
  await page.getByLabel("Empfänger").fill(input.empfaenger);
  await page.getByLabel("Kostenart").fill(input.kostenart);
  await page
    .getByLabel("Verteilungsschlüssel")
    .selectOption({ label: input.schluessel });
  await page.getByRole("button", { name: /^Ausgabe erfassen$/ }).click();
  await expect(
    page.getByRole("row").filter({ hasText: input.empfaenger }),
  ).toBeVisible();
}

test.describe("Feature 6: Jahresabrechnung (0063)", () => {
  test("abrechnung-spitze: Nachschuss und Guthaben in derselben WEG", async ({
    page,
  }) => {
    const { wegId } = await wegMitPlanUndSchluessel(page, "Spitze");

    // 10.000 nach MEA (A 4.000 / B 6.000) und 2.000 pro Einheit (je 1.000).
    // Zusammen: A 5.000, B 7.000. Soll: A 4.800, B 7.200.
    // => A zahlt 200 nach, B bekommt 200 zurück — beide Vorzeichen in einer WEG.
    await erfasseAusgabe(page, wegId, {
      betrag: "10000",
      datum: `${JAHR}-06-01`,
      empfaenger: "Verwalter",
      kostenart: "Verwaltung",
      schluessel: "MEA — Miteigentumsanteile (MEA)",
    });
    await erfasseAusgabe(page, wegId, {
      betrag: "2000",
      datum: `${JAHR}-07-01`,
      empfaenger: "Kabel AG",
      kostenart: "Kabel",
      schluessel: "Pro Einheit — Pro Einheit (gleich)",
    });

    await page.goto(`/wegs/${wegId}/finanzen/abrechnungen`);
    await page.getByLabel("Abrechnungsjahr").fill(String(JAHR));
    await page.getByRole("button", { name: /^Abrechnung erstellen$/ }).click();

    await page.waitForURL(
      new RegExp(`/wegs/${wegId}/finanzen/abrechnungen/[0-9a-f-]+$`),
      { timeout: 20_000 },
    );

    // Gesamtabrechnung: je Kostenart eine Zeile.
    await expect(
      page.getByRole("row").filter({ hasText: "Verwaltung" }),
    ).toContainText("10.000,00 €");
    await expect(
      page.getByRole("row").filter({ hasText: "Kabel" }),
    ).toContainText("2.000,00 €");

    // Einzelabrechnung: beide Vorzeichen in derselben WEG.
    const zeileA = page.getByRole("row").filter({ hasText: "Whg A" });
    await expect(zeileA).toContainText("5.000,00 €"); // Kostenanteil
    await expect(zeileA).toContainText("4.800,00 €"); // Soll-Vorschüsse
    await expect(zeileA).toContainText("Nachschuss");

    const zeileB = page.getByRole("row").filter({ hasText: "Whg B" });
    await expect(zeileB).toContainText("7.000,00 €");
    await expect(zeileB).toContainText("7.200,00 €");
    await expect(zeileB).toContainText("Guthaben");
  });

  test("abrechnung-beschluss: nach dem Beschluss ist die Abrechnung gesperrt", async ({
    page,
  }) => {
    const { wegId } = await wegMitPlanUndSchluessel(page, "Beschluss");

    await erfasseAusgabe(page, wegId, {
      betrag: "12000",
      datum: `${JAHR}-06-01`,
      empfaenger: "Verwalter",
      kostenart: "Verwaltung",
      schluessel: "MEA — Miteigentumsanteile (MEA)",
    });

    await page.goto(`/wegs/${wegId}/finanzen/abrechnungen`);
    await page.getByLabel("Abrechnungsjahr").fill(String(JAHR));
    await page.getByRole("button", { name: /^Abrechnung erstellen$/ }).click();
    await page.waitForURL(
      new RegExp(`/wegs/${wegId}/finanzen/abrechnungen/[0-9a-f-]+$`),
      { timeout: 20_000 },
    );

    await page.getByLabel("Datum der Beschlussfassung").fill(`${JAHR + 1}-03-15`);
    await page
      .getByRole("button", { name: /^Abrechnung beschließen$/ })
      .click();

    // Das Beschlussformular verschwindet, der Status steht im Kopf.
    await expect(
      page.getByRole("button", { name: /^Abrechnung beschließen$/ }),
    ).toHaveCount(0);
    await expect(page.getByText(/Beschlossen seit/)).toBeVisible();
  });

  test("abrechnung-zweitbeschluss: eine Korrektur löst den Erstbeschluss ab", async ({
    page,
  }) => {
    const { wegId } = await wegMitPlanUndSchluessel(page, "Zweit");

    await erfasseAusgabe(page, wegId, {
      betrag: "12000",
      datum: `${JAHR}-06-01`,
      empfaenger: "Verwalter",
      kostenart: "Verwaltung",
      schluessel: "MEA — Miteigentumsanteile (MEA)",
    });

    // Erstbeschluss.
    await page.goto(`/wegs/${wegId}/finanzen/abrechnungen`);
    await page.getByLabel("Abrechnungsjahr").fill(String(JAHR));
    await page.getByRole("button", { name: /^Abrechnung erstellen$/ }).click();
    await page.waitForURL(
      new RegExp(`/wegs/${wegId}/finanzen/abrechnungen/[0-9a-f-]+$`),
      { timeout: 20_000 },
    );
    await page.getByLabel("Datum der Beschlussfassung").fill(`${JAHR + 1}-03-15`);
    await page.getByRole("button", { name: /^Abrechnung beschließen$/ }).click();
    await expect(page.getByText(/Beschlossen seit/)).toBeVisible();

    // Zweitbeschluss: erneut erstellen und beschließen.
    await page.goto(`/wegs/${wegId}/finanzen/abrechnungen`);
    await page.getByLabel("Abrechnungsjahr").fill(String(JAHR));
    await page.getByRole("button", { name: /^Abrechnung erstellen$/ }).click();
    await page.waitForURL(
      new RegExp(`/wegs/${wegId}/finanzen/abrechnungen/[0-9a-f-]+$`),
      { timeout: 20_000 },
    );
    await page.getByLabel("Datum der Beschlussfassung").fill(`${JAHR + 1}-09-20`);
    await page.getByRole("button", { name: /^Abrechnung beschließen$/ }).click();
    await expect(page.getByText(/Version 2/)).toBeVisible();

    // In der Liste: eine beschlossen, eine abgelöst.
    await page.goto(`/wegs/${wegId}/finanzen/abrechnungen`);
    await expect(page.getByRole("cell", { name: "Beschlossen" })).toHaveCount(1);
    await expect(page.getByRole("cell", { name: "Abgelöst" })).toHaveCount(1);
  });
});
