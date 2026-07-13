import { test, expect } from "@playwright/test";
import { createConfirmedTestUser } from "./helpers/admin-api";

// Browser-driven coverage for the self-managed SaaS slice described in
// PROJECT_REALITY.md: Kaufseite -> Registrierung -> Onboarding-Wizard ->
// Trial -> Einladung senden -> Einladung annehmen.
//
// Real inbound email cannot be driven headlessly. The two points that would
// otherwise require clicking a Supabase Auth email-confirmation link are
// bridged with the same Admin-API bootstrap pattern already trusted by
// scripts/seed-admin.mjs (service-role `createUser({ email_confirm: true })`,
// see e2e/helpers/admin-api.ts). Every other step — page rendering, form
// submission, RPC calls, redirects — runs through the real UI/Server Actions
// against the linked Cloud project. This creates real throwaway Cloud rows,
// consistent with the documented E2E data-residue risk (see demo.spec.ts).
test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ mode: "serial" });

const stamp = () => Date.now().toString().slice(-6);
const TEST_PASSWORD = "SicheresPasswort123";

test("Kaufseite verlinkt auf die Registrierung", async ({ page }) => {
  await page.goto("/preise");
  await expect(page.getByRole("heading", { name: /Einfach starten/i })).toBeVisible();

  await page.getByRole("link", { name: /30 Tage kostenlos starten/i }).first().click();
  await expect(page).toHaveURL(/\/registrieren/);
});

test("Registrierung ruft echten Sign-up auf und meldet die Bestätigungs-E-Mail", async ({
  page,
}) => {
  const suffix = stamp();
  await page.goto("/registrieren");

  await page.getByLabel("E-Mail-Adresse").fill(`e2e-registrieren-${suffix}@example.test`);
  await page.getByLabel("Passwort").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: /30 Tage kostenlos starten/i }).click();

  await expect(page.getByRole("status")).toContainText(/Postfach/i, { timeout: 15_000 });
});

test("Onboarding-Wizard legt Trial-WEG an, Einladung wird versendet und angenommen", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const suffix = stamp();

  // 1. Vorbestätigtes Konto — überbrückt die reale E-Mail-Bestätigung, die
  //    ein Playwright-Run ohne Postfach nicht klicken kann.
  const adminEmail = `e2e-onboarding-${suffix}@example.test`;
  await createConfirmedTestUser(adminEmail, TEST_PASSWORD);

  await page.goto(`/login?next=${encodeURIComponent("/onboarding")}`);
  await page.getByLabel("E-Mail").fill(adminEmail);
  await page.getByLabel("Passwort").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: /anmelden/i }).click();
  await expect(page).toHaveURL(/\/onboarding/, { timeout: 15_000 });

  // 2. Onboarding-Wizard durchklicken (Schritt 1-4 aus onboarding-wizard.tsx).
  await page.getByLabel(/Name Ihrer Gemeinschaft/).fill(`E2E Gemeinschaft ${suffix}`);
  await page.getByRole("button", { name: /Weiter/ }).click();

  await page.getByLabel(/Name der WEG/).fill(`WEG E2E ${suffix}`);
  await page.getByLabel(/Straße und Hausnummer/).fill("Teststraße 1");
  await page.getByLabel("PLZ").fill("60306");
  await page.getByLabel("Ort").fill("Frankfurt am Main");
  await page.getByRole("button", { name: /Weiter/ }).click();

  await page.getByLabel(/Wie viele Einheiten hat Ihre WEG/).fill("5");
  await page.getByRole("button", { name: /Weiter/ }).click();

  await page.getByRole("button", { name: /WEG kostenlos anlegen/ }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

  // 3. Einladungslink über die Trial-Einladungs-RPC erzeugen
  //    (funktioniert ohne Service-Role-Konfiguration im Server-Environment).
  //    Die Seite hat zwei "E-Mail"-Felder (Direkteinladung + Link-Einladung)
  //    — daher ID-Locator statt getByLabel, um Strict-Mode-Kollisionen zu
  //    vermeiden (siehe tenant-invitation-form.tsx vs. user-management-forms.tsx).
  await page.goto("/einstellungen/mitglieder");
  const inviteeEmail = `e2e-invitee-${suffix}@example.test`;
  await page.locator("#tenant-invitation-email").fill(inviteeEmail);
  await page.getByRole("button", { name: /Link erstellen/ }).click();

  const invitationLinkInput = page.locator("#invitation-link");
  await expect(invitationLinkInput).toBeVisible({ timeout: 15_000 });
  const invitationUrl = await invitationLinkInput.inputValue();
  const token = invitationUrl.match(/\/einladung\/([^/\s"']+)$/)?.[1];
  expect(token, `invitation URL did not contain a token: ${invitationUrl}`).toBeTruthy();

  // 4. Zweiter, vorbestätigter Nutzer nimmt die Einladung in einem eigenen
  //    Browser-Kontext an (eigene Session, kein Cookie-Leck zwischen Nutzern).
  await createConfirmedTestUser(inviteeEmail, TEST_PASSWORD);

  const inviteeContext = await browser.newContext();
  try {
    const inviteePage = await inviteeContext.newPage();
    await inviteePage.goto(`/login?next=${encodeURIComponent(`/einladung/${token}`)}`);
    await inviteePage.getByLabel("E-Mail").fill(inviteeEmail);
    await inviteePage.getByLabel("Passwort").fill(TEST_PASSWORD);
    await inviteePage.getByRole("button", { name: /anmelden/i }).click();
    await expect(inviteePage).toHaveURL(new RegExp(`/einladung/${token}$`), { timeout: 15_000 });

    await inviteePage.getByLabel(/Vorname/).fill("Erika");
    await inviteePage.getByLabel(/Nachname/).fill("Musterfrau");
    await inviteePage.getByRole("button", { name: /Einladung annehmen/ }).click();

    await expect(inviteePage).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  } finally {
    await inviteeContext.close();
  }
});
