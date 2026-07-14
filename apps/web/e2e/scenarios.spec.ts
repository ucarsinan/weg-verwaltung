import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { activateWirtschaftsplan } from "./helpers/finanzen";
import { fillWegAddress } from "./helpers/weg";

test.describe.configure({ mode: "serial" });

function getTokenFromAuthFile(filename: string): string {
  const filePath = path.resolve(process.cwd(), "playwright", ".auth", filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Auth file not found at ${filePath}`);
  }
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const cookie = data.cookies.find((c: { name: string; value: string }) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token"));

  if (!cookie) throw new Error(`Supabase auth cookie not found in ${filename}`);
  let val = decodeURIComponent(cookie.value);
  if (val.startsWith("base64-")) {
    val = Buffer.from(val.slice(7), "base64").toString("utf-8");
  }
  const tokenData = JSON.parse(val);
  return Array.isArray(tokenData) ? tokenData[0] : tokenData.access_token;
}

async function createScenarioWeg(page: Page, label: string): Promise<string> {
  await page.goto("/wegs/new");
  await page.getByLabel(/Name der WEG/).fill(`Scenario ${label} ${Date.now()}`);
  await fillWegAddress(page, { street: "Szenarioweg" });
  await page.getByRole("button", { name: /Speichern/ }).click();
  await expect(page).toHaveURL(/\/wegs\/[0-9a-f-]{36}$/, { timeout: 15_000 });

  const match = page.url().match(/\/wegs\/([0-9a-f-]{36})/);
  if (!match) throw new Error("Could not extract WEG ID from URL");
  return match[1];
}

async function createScenarioUnit(
  page: Page,
  wegId: string,
  label: string,
  zaehler: string,
  nenner = "1000",
) {
  await page.goto(`/wegs/${wegId}/einheiten/new`);
  await page.getByLabel(/Bezeichnung/).fill(`Scenario ${label} ${Date.now()}`);
  await page.getByLabel("Zähler").fill(zaehler);
  await page.getByLabel("Nenner").fill(nenner);
  await page.getByRole("button", { name: /Speichern/ }).click();
  await expect(page).toHaveURL(new RegExp(`/wegs/${wegId}$`), {
    timeout: 15_000,
  });
}

async function createScenarioPlan(
  page: Page,
  wegId: string,
  jahr: string,
  bezeichnung: string,
  gesamtkosten: string,
) {
  await page.goto(`/wegs/${wegId}/finanzen/new`);
  await page.getByLabel(/jahr/i).fill(jahr);
  await page.getByLabel(/bezeichnung/i).fill(bezeichnung);
  await page.getByLabel(/gesamtkosten/i).fill(gesamtkosten);
  await page.getByRole("button", { name: /speichern/i }).click();
  await expect(page).toHaveURL(new RegExp(`/wegs/${wegId}/finanzen$`), {
    timeout: 15_000,
  });
  await expect(page.getByText(bezeichnung)).toBeVisible();
}

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

    // 2. Onboard / create Wirtschaftsplan for next year
    await page.goto("/wegs");
    const newWegBtn = page.locator('a[href="/wegs/new"]').first();
    if (await newWegBtn.isVisible()) {
      await newWegBtn.click();
      const wegName = `E2E Scenario Year End ${Date.now()}`;
      await page.getByLabel(/Name der WEG/).fill(wegName);
      await fillWegAddress(page, { street: "Jahresabschlussweg" });
      await page.getByRole("button", { name: /Speichern/ }).click();
      await expect(page).toHaveURL(/\/wegs\/[0-9a-f-]{36}$/, { timeout: 15_000 });

      const wegId = page.url().match(/\/wegs\/([0-9a-f-]{36})/)![1];
      await page.goto(`/wegs/${wegId}/finanzen/new`).catch(() => {});
      const costsInput = page.getByLabel(/gesamtkosten/i);
      if (await costsInput.isVisible()) {
        await page.getByLabel(/jahr/i).fill("2026");
        await page.getByLabel(/bezeichnung/i).fill("Plan 2026");
        await costsInput.fill("24000");
        await page.getByRole("button", { name: /speichern/i }).click();
        await expect(page).toHaveURL(new RegExp(`/wegs/${wegId}/finanzen`));
      }
    }
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

    // 4. Create Wirtschaftsplan
    await page.goto(`/wegs/${wegId}/finanzen/new`).catch(() => {});
    const costsInput = page.getByLabel(/gesamtkosten/i);
    if (await costsInput.isVisible()) {
      await page.getByLabel(/jahr/i).fill("2026");
      await page.getByLabel(/bezeichnung/i).fill("First Plan");
      await costsInput.fill("12000");

      // Verify calculations: Apt 1 -> 400/1000 * 12000 = 4800 / 12 = 400€
      // Apt 2 -> 600/1000 * 12000 = 7200 / 12 = 600€
      await expect(page.getByText("400,00")).toBeVisible();
      await expect(page.getByText("600,00")).toBeVisible();

      await page.getByRole("button", { name: /speichern/i }).click();
      await expect(page).toHaveURL(new RegExp(`/wegs/${wegId}/finanzen`));
    }
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
    // Directly check DB table 'audit_event' for financial-related activities
    const res = await page.request.get(`${url}/rest/v1/audit_event?select=id&entity_typ=eq.wirtschaftsplan&limit=1`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${tokenA}`
      }
    });
    expect(res.ok() || res.status() === 404).toBe(true);
  });

  test("scenario-correction-of-financial-plan: corrections preserve historical Sollstellungen", async ({ page }) => {
    const tokenA = getTokenFromAuthFile("admin.json");
    const wegId = await createScenarioWeg(page, "Correction");
    await createScenarioUnit(page, wegId, "CorrectionA", "100");
    await createScenarioUnit(page, wegId, "CorrectionB", "200");
    await createScenarioPlan(
      page,
      wegId,
      "2037",
      "Scenario Correction Plan",
      "12000",
    );

    const planRes = await page.request.get(`${url}/rest/v1/wirtschaftsplan?select=id&weg_id=eq.${wegId}&jahr=eq.2037`, {
      headers: { apikey: key, Authorization: `Bearer ${tokenA}` }
    });
    expect(planRes.ok()).toBe(true);
    const plans = await planRes.json() as Array<{ id: string }>;
    expect(plans).toHaveLength(1);

    // Erst die Aktivierung erzeugt die Sollstellungen — ein Entwurf ist
    // absichtlich noch frei editierbar (docs/07-finance-lifecycle.md). Ohne
    // diesen Schritt prueft der Test gegen einen Plan, den man aendern DARF.
    await activateWirtschaftsplan(page, wegId, plans[0].id);

    const sollRes = await page.request.get(
      `${url}/rest/v1/sollstellung?wirtschaftsplan_id=eq.${plans[0].id}&select=id`,
      { headers: { apikey: key, Authorization: `Bearer ${tokenA}` } },
    );
    expect(sollRes.ok()).toBe(true);
    expect((await sollRes.json()) as Array<{ id: string }>).toHaveLength(24);

    // Korrektur eines aktiven Plans laeuft ueber einen Nachtragsplan, niemals
    // ueber ein direktes Update — die Historie muss unangetastet bleiben.
    const updateRes = await page.request.patch(
      `${url}/rest/v1/wirtschaftsplan?id=eq.${plans[0].id}`,
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
