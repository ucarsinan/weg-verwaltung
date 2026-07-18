import { test, expect, Page } from "@playwright/test";
import { activateWirtschaftsplan } from "./helpers/finanzen";
import {
  decodeTenantIdFromJwt,
  getSupabaseRequestContext,
  getTokenFromAuthFile,
} from "./helpers/fixtures";
import { fillWegAddress } from "./helpers/weg";

test.describe.configure({ mode: "serial" });

async function createTestWeg(page: Page, label: string): Promise<string> {
  await page.goto("/wegs/new");
  await page.getByLabel(/Name der WEG/).fill(`Cross ${label} ${Date.now()}`);
  await fillWegAddress(page, { street: "Crossweg", city: "Teststadt" });
  await page.getByRole("button", { name: /Speichern/ }).click();
  // 30s, not the usual 15s: on the Free-plan Cloud project, this navigation
  // can land right after finanzen.spec.ts's 100+-unit bulk-write test when
  // files run in a non-standard order, and Cloud latency has been observed
  // to blow a 15s budget there (see docs/agent-reports/2026-07-14-worker-
  // general-cloud-e2e-first-run.md, "reihenfolgeabhaengige Flakiness").
  await expect(page).toHaveURL(/\/wegs\/[0-9a-f-]{36}$/, { timeout: 30_000 });

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
  let tenantAId: string;
  let tenantBId: string;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:54321";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  test.beforeAll(() => {
    tokenA = getTokenFromAuthFile("admin.json");
    tokenB = getTokenFromAuthFile("tenant_b.json");
    tenantAId = decodeTenantIdFromJwt(tokenA);
    tenantBId = decodeTenantIdFromJwt(tokenB);
  });

  test("cross-audit-and-finanz: creating a Wirtschaftsplan generates audit events", async ({ page }) => {
    // Actually create a Wirtschaftsplan, then prove the audit trigger
    // (wirtschaftsplan_audit_emit, 0036_wirtschaftsplan_hausgeld.sql) logged
    // it — querying audit_event unfiltered and accepting 404 as a pass
    // proved nothing about audit content.
    const wegId = await createTestWeg(page, "AuditFinanz");
    await createWirtschaftsplan(page, wegId, "2040", "6000");

    const { token } = await getSupabaseRequestContext(page);
    const planRes = await page.request.get(
      `${url}/rest/v1/wirtschaftsplan?select=id&weg_id=eq.${wegId}&jahr=eq.2040`,
      { headers: { apikey: key, Authorization: `Bearer ${token}` } },
    );
    expect(planRes.ok()).toBe(true);
    const [plan] = (await planRes.json()) as Array<{ id: string }>;
    expect(plan?.id).toBeTruthy();

    const auditRes = await page.request.get(
      `${url}/rest/v1/audit_event?select=id,entity_typ,action&entity_typ=eq.wirtschaftsplan&entity_id=eq.${plan.id}`,
      { headers: { apikey: key, Authorization: `Bearer ${token}` } },
    );
    expect(auditRes.ok()).toBe(true);
    const events = (await auditRes.json()) as Array<{
      id: string;
      entity_typ: string;
      action: string;
    }>;
    expect(events.length).toBeGreaterThan(0);
    expect(
      events.some((e) => e.entity_typ === "wirtschaftsplan" && e.action === "insert"),
    ).toBe(true);
  });

  test("cross-finanz-and-sollstellung: posted Sollstellung entries remain historical after plan cost changes", async ({ page }) => {
    const wegId = await createTestWeg(page, "PlanUpdate");
    await createTestUnit(page, wegId, "UnitA", "100");
    await createTestUnit(page, wegId, "UnitB", "200");
    await createWirtschaftsplan(page, wegId, "2031", "12000");

    const { token } = await getSupabaseRequestContext(page);
    const planRes = await page.request.get(
      `${url}/rest/v1/wirtschaftsplan?select=id&weg_id=eq.${wegId}&jahr=eq.2031`,
      { headers: { apikey: key, Authorization: `Bearer ${token}` } },
    );
    expect(planRes.ok()).toBe(true);
    const [plan] = (await planRes.json()) as Array<{ id: string }>;
    expect(plan?.id).toBeTruthy();
    await activateWirtschaftsplan(page, wegId, plan.id);

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
    // A GET against an existing, authorized table always returns 200 with a
    // (possibly empty) array via PostgREST — RLS filters rows, it never
    // 404s. The ok()||404 hedge accepted any outcome and never checked
    // whether rows actually stayed scoped to their own tenant.
    const resA = await request.get(`${url}/rest/v1/sollstellung?select=*`, {
      headers: { apikey: key, Authorization: `Bearer ${tokenA}` }
    });
    const resB = await request.get(`${url}/rest/v1/sollstellung?select=*`, {
      headers: { apikey: key, Authorization: `Bearer ${tokenB}` }
    });
    expect(resA.ok()).toBe(true);
    expect(resB.ok()).toBe(true);

    const rowsA = (await resA.json()) as Array<{ tenant_id: string }>;
    const rowsB = (await resB.json()) as Array<{ tenant_id: string }>;
    for (const row of rowsA) {
      expect(row.tenant_id).toBe(tenantAId);
      expect(row.tenant_id).not.toBe(tenantBId);
    }
    for (const row of rowsB) {
      expect(row.tenant_id).toBe(tenantBId);
      expect(row.tenant_id).not.toBe(tenantAId);
    }
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

  test("cross-finanz-and-mea-unit-changes: posted Sollstellungen remain unchanged after MEA changes", async ({ page }) => {
    const wegId = await createTestWeg(page, "UnitMeaUpdate");
    const unitName = await createTestUnit(page, wegId, "UnitA", "100");
    await createWirtschaftsplan(page, wegId, "2032", "12000");

    const { token } = await getSupabaseRequestContext(page);
    const planRes = await page.request.get(
      `${url}/rest/v1/wirtschaftsplan?select=id&weg_id=eq.${wegId}&jahr=eq.2032`,
      { headers: { apikey: key, Authorization: `Bearer ${token}` } },
    );
    expect(planRes.ok()).toBe(true);
    const [plan] = (await planRes.json()) as Array<{ id: string }>;
    expect(plan?.id).toBeTruthy();
    await activateWirtschaftsplan(page, wegId, plan.id);

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
