import { test, expect, Page } from "@playwright/test";
import {
  createUnitFixture,
  createWirtschaftsplanFixture,
  getSupabaseRequestContext,
} from "./helpers/fixtures";
import { createWegFixture } from "./helpers/weg";

/**
 * Beschlussgrundlage der Aktivierung (Migration 0074) — durch die Oberflaeche.
 *
 * Testgegenstand ist die Kette Beschluss erfassen -> im Plan zuordnen ->
 * speichern -> aktivieren. pgTAP belegt die Sperre in der Datenbank, aber nicht,
 * dass ein Mensch im Browser den Weg findet: das Auswahlfeld liegt im Formular,
 * der Aktivieren-Knopf ausserhalb, und die Grundlage muss GESPEICHERT sein.
 * Genau dieser Versatz ist die Stelle, an der eine Sackgasse entstehen wuerde.
 *
 * Rechtlicher Hintergrund: Nach § 28 Abs. 1 WEG stellt der Verwalter den Plan
 * auf, die Eigentuemer beschliessen ueber die Vorschuesse — erst der Beschluss
 * begruendet die Zahlungspflicht.
 *
 * Vorbedingungen (WEG, Einheiten, Plan) kommen ueber den REST-Seam; das UI wird
 * nur fuer den Testgegenstand bedient. Jeder Test legt seine eigene WEG an.
 */

const JAHR = 2035;
const GESAMTKOSTEN = 24_000;

async function createWegMitPlan(
  page: Page,
  label: string,
): Promise<{ wegId: string; planId: string }> {
  const wegId = await createWegFixture(
    page,
    `E2E Beschluss ${label} ${Date.now()}`,
    { street: "Beschlussweg" },
  );

  // 500 + 500 von 1000: die MEA-Summe ist genau 1, die Sperre aus 0073 kann
  // also nicht dazwischenfunken.
  await createUnitFixture(page, wegId, {
    bezeichnung: `Whg A ${label}`,
    meaZaehler: 500,
    meaNenner: 1000,
  });
  await createUnitFixture(page, wegId, {
    bezeichnung: `Whg B ${label}`,
    meaZaehler: 500,
    meaNenner: 1000,
  });

  const planId = await createWirtschaftsplanFixture(page, {
    wegId,
    jahr: JAHR,
    bezeichnung: `Wirtschaftsplan ${JAHR} ${label}`,
    gesamtkosten: GESAMTKOSTEN,
  });

  return { wegId, planId };
}

/** Erfasst einen Beschluss ueber das Formular der Beschluss-Sammlung. */
async function erfasseBeschlussUeberUi(
  page: Page,
  wegId: string,
  input: { text: string; datum: string; typ: string },
): Promise<void> {
  await page.goto(`/wegs/${wegId}/beschluss-sammlung/new`);
  await page.getByLabel("Beschlusstext").fill(input.text);
  await page.getByLabel("Datum der Beschlussfassung").fill(input.datum);
  await page.getByLabel("Beschluss-Typ").selectOption(input.typ);
  await page.getByRole("button", { name: "Eintrag speichern" }).click();
  // Verankert: ohne $ matcht das Muster auch die Seite, von der wir kommen.
  await page.waitForURL(
    new RegExp(`/wegs/${wegId}/beschluss-sammlung$`),
    { timeout: 20_000 },
  );
}

async function zaehleSollstellungen(page: Page, planId: string): Promise<number> {
  const ctx = await getSupabaseRequestContext(page);
  const antwort = await page.request.get(
    `${ctx.url}/rest/v1/sollstellung?wirtschaftsplan_id=eq.${planId}&select=id`,
    { headers: { apikey: ctx.key, Authorization: `Bearer ${ctx.token}` } },
  );
  expect(antwort.ok()).toBe(true);
  return ((await antwort.json()) as unknown[]).length;
}

test.describe("Beschlussgrundlage der Aktivierung (0074)", () => {
  test("beschluss-fehlt: ohne Beschluss ist Aktivieren gesperrt und der Ausweg sichtbar", async ({
    page,
  }) => {
    const { wegId, planId } = await createWegMitPlan(page, "fehlt");

    await page.goto(`/wegs/${wegId}/finanzen/${planId}/edit`);

    await expect(
      page.getByRole("button", { name: /^Aktivieren$/ }),
      "ohne Beschlussgrundlage darf der Plan nicht aktivierbar sein",
    ).toBeDisabled();

    // Der Ausweg, der bei Befund 7 gefehlt hatte: eine Vorbedingung benennen
    // UND den Weg dorthin zeigen.
    await expect(
      page.getByRole("link", { name: "Beschluss erfassen" }).first(),
      "der Weg zum Erfassen muss von hier aus sichtbar sein",
    ).toHaveAttribute("href", `/wegs/${wegId}/beschluss-sammlung/new`);

    expect(
      await zaehleSollstellungen(page, planId),
      "ohne Aktivierung existiert keine Zahlungsforderung",
    ).toBe(0);
  });

  test("beschluss-zuordnen: Umlaufbeschluss zuordnen, speichern, aktivieren", async ({
    page,
  }) => {
    const { wegId, planId } = await createWegMitPlan(page, "umlauf");

    // Umlaufbeschluss bewusst: § 23 Abs. 3 WEG laesst ihn fuer den
    // Wirtschaftsplan zu, und er entsteht hier OHNE Versammlung. Haette 0074 auf
    // public.resolution verwiesen, waere dieser Weg strukturell unmoeglich.
    await erfasseBeschlussUeberUi(page, wegId, {
      text: "Im Umlaufverfahren beschliessen die Eigentuemer die Vorschuesse nach dem Wirtschaftsplan.",
      datum: `${JAHR}-02-01`,
      typ: "umlaufbeschluss",
    });

    await page.goto(`/wegs/${wegId}/finanzen/${planId}/edit`);

    const auswahl = page.getByLabel("Beschlussgrundlage");
    await expect(auswahl).toBeEnabled();
    const optionen = auswahl.locator("option");
    // Leeroption plus der eben erfasste Beschluss.
    await expect(optionen).toHaveCount(2);
    await expect(optionen.nth(1)).toContainText("Umlauf");

    // Nur auswaehlen genuegt nicht — der Knopf haengt am gespeicherten Stand.
    await auswahl.selectOption({ index: 1 });
    await expect(
      page.getByRole("button", { name: /^Aktivieren$/ }),
      "eine nur ausgewaehlte Grundlage darf nicht genuegen",
    ).toBeDisabled();

    await page.getByRole("button", { name: /^Speichern$/ }).click();
    await page.waitForURL(
      new RegExp(`/wegs/${wegId}/finanzen$`),
      { timeout: 20_000 },
    );

    await page.goto(`/wegs/${wegId}/finanzen/${planId}/edit`);
    const aktivieren = page.getByRole("button", { name: /^Aktivieren$/ });
    await expect(
      aktivieren,
      "nach dem Speichern muss die Aktivierung freigeschaltet sein",
    ).toBeEnabled();
    await aktivieren.click();
    await page.waitForURL(
      new RegExp(`/wegs/${wegId}/finanzen$`),
      { timeout: 20_000 },
    );

    // 12 Monate x 2 Einheiten — der Beweis, dass die Aktivierung durchlief.
    expect(
      await zaehleSollstellungen(page, planId),
      "erst der Beschluss macht aus dem Plan Zahlungsforderungen",
    ).toBe(24);
  });
});
