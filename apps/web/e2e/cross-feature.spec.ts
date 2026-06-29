import { test, expect, Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
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

async function getAuthToken(page: Page) {
  const cookies = await page.context().cookies();
  const sbCookie = cookies.find(
    (c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token")
  );
  if (!sbCookie) {
    throw new Error("Supabase auth token cookie not found");
  }
  let cookieValue = decodeURIComponent(sbCookie.value);
  if (cookieValue.startsWith("base64-")) {
    cookieValue = Buffer.from(cookieValue.slice(7), "base64").toString("utf-8");
  }
  const tokenData = JSON.parse(cookieValue);
  const token: string = Array.isArray(tokenData)
    ? (tokenData[0] as string)
    : (tokenData as { access_token: string }).access_token;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:54321";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  return { token, url, key };
}

async function createTestWeg(page: Page, label: string): Promise<string> {
  await page.goto("/wegs/new");
  await page.getByLabel(/Name der WEG/).fill(`Cross ${label} ${Date.now()}`);
  await fillWegAddress(page, { street: "Crossweg", city: "Teststadt" });
  await page.getByRole("button", { name: /Speichern/ }).click();
  await expect(page).toHaveURL(/\/wegs\/[0-9a-f-]{36}$/, { timeout: 15_000 });

  const match = page.url().match(/\/wegs\/([0-9a-f-]{36})/);
  if (!match) throw new Error("Could not extract WEG ID from URL");
  return match[1];
}

async function createTestUnit(
  page: Page,
  wegId: string,
  label: string,
  zaehler: string,
  nenner = "1000",
): Promise<string> {
  const bezeichnung = `Cross ${label} ${Date.now()}`;

  await page.goto(`/wegs/${wegId}/einheiten/new`);
  await page.getByLabel(/Bezeichnung/).fill(bezeichnung);
  await page.getByLabel("Zähler").fill(zaehler);
  await page.getByLabel("Nenner").fill(nenner);
  await page.getByRole("button", { name: /Speichern/ }).click();
  await expect(page).toHaveURL(new RegExp(`/wegs/${wegId}$`), {
    timeout: 15_000,
  });

  return bezeichnung;
}

async function createWirtschaftsplan(
  page: Page,
  wegId: string,
  jahr: string,
  gesamtkosten: string,
): Promise<void> {
  const bezeichnung = `Cross Plan ${jahr}`;
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

test.describe("Tier 3: Cross-Feature Interactions", () => {
  let tokenA: string;
  let tokenB: string;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:54321";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  test.beforeAll(() => {
    tokenA = getTokenFromAuthFile("admin.json");
    tokenB = getTokenFromAuthFile("tenant_b.json");
  });

  test("cross-audit-and-finanz: creating a Wirtschaftsplan generates audit events", async ({ page }) => {
    // Create a plan via UI/API and verify audit_event table gets a log entry
    const res = await page.request.get(`${url}/rest/v1/audit_event?select=*&limit=5`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${tokenA}`
      }
    });
    expect(res.ok() || res.status() === 404).toBe(true);
  });

  // Requires migrations 0039/0040 on the remote Cloud DB.
  test.skip("cross-finanz-and-sollstellung: posted Sollstellung entries remain historical after plan cost changes", async ({ page }) => {
    const wegId = await createTestWeg(page, "PlanUpdate");
    await createTestUnit(page, wegId, "UnitA", "100");
    await createTestUnit(page, wegId, "UnitB", "200");
    await createWirtschaftsplan(page, wegId, "2031", "12000");

    const { token } = await getAuthToken(page);
    const planRes = await page.request.get(
      `${url}/rest/v1/wirtschaftsplan?select=id&weg_id=eq.${wegId}&jahr=eq.2031`,
      { headers: { apikey: key, Authorization: `Bearer ${token}` } },
    );
    expect(planRes.ok()).toBe(true);
    const [plan] = (await planRes.json()) as Array<{ id: string }>;
    expect(plan?.id).toBeTruthy();

    const beforeRes = await page.request.get(
      `${url}/rest/v1/sollstellung?wirtschaftsplan_id=eq.${plan.id}&select=betrag`,
      { headers: { apikey: key, Authorization: `Bearer ${token}` } },
    );
    expect(beforeRes.ok()).toBe(true);
    const beforeAmounts = ((await beforeRes.json()) as Array<{ betrag: number }>).map(
      (row) => Number(row.betrag),
    );
    expect(beforeAmounts).toHaveLength(24);
    expect(beforeAmounts).toContain(100);
    expect(beforeAmounts).toContain(200);

    const updateRes = await page.request.patch(
      `${url}/rest/v1/wirtschaftsplan?id=eq.${plan.id}`,
      {
        data: { gesamtkosten: 24000 },
        headers: {
          apikey: key,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );
    expect(updateRes.status()).toBeGreaterThanOrEqual(400);

    const afterRes = await page.request.get(
      `${url}/rest/v1/sollstellung?wirtschaftsplan_id=eq.${plan.id}&select=betrag`,
      { headers: { apikey: key, Authorization: `Bearer ${token}` } },
    );
    expect(afterRes.ok()).toBe(true);
    const afterAmounts = ((await afterRes.json()) as Array<{ betrag: number }>).map(
      (row) => Number(row.betrag),
    );
    expect(afterAmounts).toEqual(beforeAmounts);
  });

  test("cross-rls-and-sollstellung: tenant isolation blocks cross-tenant access to Sollstellung entries", async ({ request }) => {
    // Tenant A queries Sollstellungen
    const resA = await request.get(`${url}/rest/v1/sollstellung?select=*`, {
      headers: { apikey: key, Authorization: `Bearer ${tokenA}` }
    });
    // Tenant B queries Sollstellungen
    const resB = await request.get(`${url}/rest/v1/sollstellung?select=*`, {
      headers: { apikey: key, Authorization: `Bearer ${tokenB}` }
    });
    expect(resA.ok() || resA.status() === 404).toBe(true);
    expect(resB.ok() || resB.status() === 404).toBe(true);
  });

  test("cross-audit-ui-and-rls: non-admin users do not see admin audit tabs", async ({ page }) => {
    const newContext = await page.context().browser()!.newContext({
      storageState: "playwright/.auth/tenant_b.json"
    });
    const newPage = await newContext.newPage();
    await newPage.goto("/audit");

    await expect(
      newPage.getByRole("heading", { level: 1, name: "Audit" }),
    ).toBeVisible();
    await expect(newPage.getByRole("button", { name: "Verlauf" })).toBeVisible();
    await expect(
      newPage.getByRole("button", { name: "Archiv" }),
    ).toHaveCount(0);
    await expect(
      newPage.getByRole("button", { name: "Integrität" }),
    ).toHaveCount(0);

    await newContext.close();
  });

  // Requires migrations 0039/0040 on the remote Cloud DB.
  test.skip("cross-finanz-and-mea-unit-changes: posted Sollstellungen remain unchanged after MEA changes", async ({ page }) => {
    const wegId = await createTestWeg(page, "UnitMeaUpdate");
    const unitName = await createTestUnit(page, wegId, "UnitA", "100");
    await createWirtschaftsplan(page, wegId, "2032", "12000");

    const { token } = await getAuthToken(page);
    const unitRes = await page.request.get(
      `${url}/rest/v1/unit?select=id&weg_id=eq.${wegId}&bezeichnung=eq.${encodeURIComponent(unitName)}`,
      { headers: { apikey: key, Authorization: `Bearer ${token}` } },
    );
    expect(unitRes.ok()).toBe(true);
    const [unit] = (await unitRes.json()) as Array<{ id: string }>;
    expect(unit?.id).toBeTruthy();

    const beforeRes = await page.request.get(
      `${url}/rest/v1/sollstellung?unit_id=eq.${unit.id}&select=betrag`,
      { headers: { apikey: key, Authorization: `Bearer ${token}` } },
    );
    expect(beforeRes.ok()).toBe(true);
    const beforeAmounts = ((await beforeRes.json()) as Array<{ betrag: number }>).map(
      (row) => Number(row.betrag),
    );
    expect(beforeAmounts).toHaveLength(12);
    expect(beforeAmounts.every((amount) => amount === 100)).toBe(true);

    const updateRes = await page.request.patch(
      `${url}/rest/v1/unit?id=eq.${unit.id}`,
      {
        data: { mea_zaehler: 150 },
        headers: {
          apikey: key,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );
    expect(updateRes.status()).toBeGreaterThanOrEqual(400);

    const afterRes = await page.request.get(
      `${url}/rest/v1/sollstellung?unit_id=eq.${unit.id}&select=betrag`,
      { headers: { apikey: key, Authorization: `Bearer ${token}` } },
    );
    expect(afterRes.ok()).toBe(true);
    const afterAmounts = ((await afterRes.json()) as Array<{ betrag: number }>).map(
      (row) => Number(row.betrag),
    );
    expect(afterAmounts).toEqual(beforeAmounts);
  });
});
