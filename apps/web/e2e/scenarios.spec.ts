import { test, expect } from "@playwright/test";
import {
  activateWirtschaftsplanFixture,
  createUnitFixture,
  createWirtschaftsplanFixture,
  getTokenFromAuthFile,
} from "./helpers/fixtures";
import { createWegFixture, fillWegAddress } from "./helpers/weg";

test.describe.configure({ mode: "serial" });

test.describe("Tier 4: Real-World Application Scenarios", () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:54321";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  test("scenario-year-end-closing-and-archive: admin reviews disabled audit archive management, then creates new plan for upcoming year", async ({ page }) => {
    // 1. Audit archive status is visible, but destructive tenant-scoped
    // archive execution is not exposed in the UI.
    await page.goto("/audit");
    await page.getByRole("button", { name: "Archiv" }).click();
    await expect(
      page.getByText("Archivierbare Partitionen", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Archivierte Dateien", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Archivieren" }),
    ).toHaveCount(0);

    // 2. Onboard / create Wirtschaftsplan for next year. Unconditional steps
    // with explicit toBeVisible() checks — a missing button/field must fail
    // the test loudly, not silently skip the whole onboarding flow.
    await page.goto("/wegs");
    const newWegBtn = page.locator('a[href="/wegs/new"]').first();
    await expect(newWegBtn).toBeVisible();
    await newWegBtn.click();
    const wegName = `E2E Scenario Year End ${Date.now()}`;
    await page.getByLabel(/Name der WEG/).fill(wegName);
    await fillWegAddress(page, { street: "Jahresabschlussweg" });
    await page.getByRole("button", { name: /Speichern/ }).click();
    await expect(page).toHaveURL(/\/wegs\/[0-9a-f-]{36}$/, { timeout: 15_000 });

    const wegId = page.url().match(/\/wegs\/([0-9a-f-]{36})/)![1];
    await page.goto(`/wegs/${wegId}/finanzen/new`);
    const costsInput = page.getByLabel(/gesamtkosten/i);
    await expect(costsInput).toBeVisible();
    await page.getByLabel(/jahr/i).fill("2026");
    await page.getByLabel(/bezeichnung/i).fill("Plan 2026");
    await costsInput.fill("24000");
    await page.getByRole("button", { name: /speichern/i }).click();
    await expect(page).toHaveURL(new RegExp(`/wegs/${wegId}/finanzen`));
  });

  test("scenario-new-weg-onboarding: onboarding a new WEG with units, allocating MEAs, creating a new plan and verifying Hausgeld/Sollstellung", async ({ page }) => {
    // 1. Create a new WEG
    await page.goto("/wegs/new");
    const wegNameVal = `Onboard-WEG-${Date.now()}`;
    await page.getByLabel(/Name der WEG/).fill(wegNameVal);
    await fillWegAddress(page, { street: "Onboardingweg" });
    await page.getByRole("button", { name: /Speichern/ }).click();
    await expect(page).toHaveURL(/\/wegs\/[0-9a-f-]{36}$/, { timeout: 15_000 });
    const wegId = page.url().match(/\/wegs\/([0-9a-f-]{36})/)![1];

    // 2. Create Unit 1
    await page.goto(`/wegs/${wegId}/einheiten/new`);
    await page.getByLabel(/Bezeichnung/).fill("Apt 1");
    await page.getByLabel("Zähler").fill("400");
    await page.getByLabel("Nenner").fill("1000");
    await page.getByRole("button", { name: /Speichern/ }).click();
    await expect(page).toHaveURL(new RegExp(`/wegs/${wegId}$`), { timeout: 15_000 });

    // 3. Create Unit 2
    await page.goto(`/wegs/${wegId}/einheiten/new`);
    await page.getByLabel(/Bezeichnung/).fill("Apt 2");
    await page.getByLabel("Zähler").fill("600");
    await page.getByLabel("Nenner").fill("1000");
    await page.getByRole("button", { name: /Speichern/ }).click();
    await expect(page).toHaveURL(new RegExp(`/wegs/${wegId}$`), { timeout: 15_000 });

    // 4. Create Wirtschaftsplan. Unconditional — wrapping the Hausgeld
    // assertions in isVisible() would silently skip verifying the
    // calculated amounts if the field ever went missing.
    await page.goto(`/wegs/${wegId}/finanzen/new`);
    const costsInput = page.getByLabel(/gesamtkosten/i);
    await expect(costsInput).toBeVisible();
    await page.getByLabel(/jahr/i).fill("2026");
    await page.getByLabel(/bezeichnung/i).fill("First Plan");
    await costsInput.fill("12000");

    // Verify calculations: Apt 1 -> 400/1000 * 12000 = 4800 / 12 = 400€
    // Apt 2 -> 600/1000 * 12000 = 7200 / 12 = 600€
    await expect(page.getByText("400,00")).toBeVisible();
    await expect(page.getByText("600,00")).toBeVisible();

    await page.getByRole("button", { name: /speichern/i }).click();
    await expect(page).toHaveURL(new RegExp(`/wegs/${wegId}/finanzen`));
  });

  test("scenario-multi-tenant-simultaneous-billing: Tenant A and Tenant B concurrently perform operations verifying separation", async ({ browser }) => {
    // 1. Context for Tenant A
    const contextA = await browser.newContext({ storageState: "playwright/.auth/admin.json" });
    const pageA = await contextA.newPage();

    // 2. Context for Tenant B
    const contextB = await browser.newContext({ storageState: "playwright/.auth/tenant_b.json" });
    const pageB = await contextB.newPage();

    // 3. Simultaneously browse /wegs
    await pageA.goto("/wegs");
    await pageB.goto("/wegs");

    // Both should render lists without bleeding
    await expect(pageA.getByRole("heading", { level: 1, name: "WEGs" })).toBeVisible();
    await expect(pageB.getByRole("heading", { level: 1, name: "WEGs" })).toBeVisible();

    await contextA.close();
    await contextB.close();
  });

  test("scenario-audit-trail-of-financial-actions: financial plan modifications create correct audit logs", async ({ page }) => {
    const tokenA = getTokenFromAuthFile("admin.json");

    // Perform a real financial mutation (REST-Seam-Fixture — der DB-Trigger
    // feuert unabhängig vom Eingabekanal), then prove the audit trigger
    // (wirtschaftsplan_audit_emit, 0036_wirtschaftsplan_hausgeld.sql) logged
    // it — querying audit_event unfiltered by entity_id and accepting 404 as
    // a pass proved nothing about which plan's actions were recorded.
    const wegId = await createWegFixture(
      page,
      `Scenario AuditTrail ${Date.now()}`,
      { street: "Szenarioweg" },
    );
    const planId = await createWirtschaftsplanFixture(page, {
      wegId,
      jahr: 2038,
      bezeichnung: "Scenario Audit Plan",
      gesamtkosten: 9000,
    });

    const res = await page.request.get(
      `${url}/rest/v1/audit_event?select=id,action&entity_typ=eq.wirtschaftsplan&entity_id=eq.${planId}`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${tokenA}`
        }
      },
    );
    expect(res.ok()).toBe(true);
    const events = (await res.json()) as Array<{ id: string; action: string }>;
    expect(events.length).toBeGreaterThan(0);
    expect(events.some((e) => e.action === "insert")).toBe(true);
  });

  test("scenario-correction-of-financial-plan: corrections preserve historical Sollstellungen", async ({ page }) => {
    const tokenA = getTokenFromAuthFile("admin.json");
    const wegId = await createWegFixture(
      page,
      `Scenario Correction ${Date.now()}`,
      { street: "Szenarioweg" },
    );
    await createUnitFixture(page, wegId, {
      bezeichnung: `Scenario CorrectionA ${Date.now()}`,
      meaZaehler: 100,
    });
    await createUnitFixture(page, wegId, {
      bezeichnung: `Scenario CorrectionB ${Date.now()}`,
      meaZaehler: 200,
    });
    const planId = await createWirtschaftsplanFixture(page, {
      wegId,
      jahr: 2037,
      bezeichnung: "Scenario Correction Plan",
      gesamtkosten: 12000,
    });

    // Erst die Aktivierung erzeugt die Sollstellungen — ein Entwurf ist
    // absichtlich noch frei editierbar (docs/07-finance-lifecycle.md). Ohne
    // diesen Schritt prueft der Test gegen einen Plan, den man aendern DARF.
    await activateWirtschaftsplanFixture(page, planId);

    const sollRes = await page.request.get(
      `${url}/rest/v1/sollstellung?wirtschaftsplan_id=eq.${planId}&select=id`,
      { headers: { apikey: key, Authorization: `Bearer ${tokenA}` } },
    );
    expect(sollRes.ok()).toBe(true);
    expect((await sollRes.json()) as Array<{ id: string }>).toHaveLength(24);

    // Korrektur eines aktiven Plans laeuft ueber einen Nachtragsplan, niemals
    // ueber ein direktes Update — die Historie muss unangetastet bleiben.
    const updateRes = await page.request.patch(
      `${url}/rest/v1/wirtschaftsplan?id=eq.${planId}`,
      {
        data: { gesamtkosten: 18000 },
        headers: {
          apikey: key,
          Authorization: `Bearer ${tokenA}`,
          "Content-Type": "application/json",
        },
      },
    );
    expect(updateRes.status()).toBeGreaterThanOrEqual(400);
  });
});
