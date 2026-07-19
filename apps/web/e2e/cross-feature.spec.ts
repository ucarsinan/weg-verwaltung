import { test, expect, Page } from "@playwright/test";
import {
  activateWirtschaftsplanFixture,
  createUnitFixture,
  createWirtschaftsplanFixture,
  decodeTenantIdFromJwt,
  getSupabaseRequestContext,
  getTokenFromAuthFile,
} from "./helpers/fixtures";
import { createWegFixture } from "./helpers/weg";

test.describe.configure({ mode: "serial" });

// Setup über den REST-Seam (helpers/fixtures.ts) — die Anlage-Formulare
// sind Testgegenstand von wegs.spec.ts/finanzen.spec.ts, nicht dieses Files.
async function createTestWeg(page: Page, label: string): Promise<string> {
  return createWegFixture(page, `Cross ${label} ${Date.now()}`, {
    street: "Crossweg",
    city: "Teststadt",
  });
}

async function createTestUnit(
  page: Page,
  wegId: string,
  label: string,
  zaehler: string,
  nenner = "1000",
): Promise<string> {
  return createUnitFixture(page, wegId, {
    bezeichnung: `Cross ${label} ${Date.now()}`,
    meaZaehler: Number(zaehler),
    meaNenner: Number(nenner),
  });
}

async function createWirtschaftsplan(
  page: Page,
  wegId: string,
  jahr: number,
  gesamtkosten: number,
): Promise<string> {
  return createWirtschaftsplanFixture(page, {
    wegId,
    jahr,
    bezeichnung: `Cross Plan ${jahr}`,
    gesamtkosten,
  });
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
    const planId = await createWirtschaftsplan(page, wegId, 2040, 6000);

    const { token } = await getSupabaseRequestContext(page);
    const auditRes = await page.request.get(
      `${url}/rest/v1/audit_event?select=id,entity_typ,action&entity_typ=eq.wirtschaftsplan&entity_id=eq.${planId}`,
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
    const planId = await createWirtschaftsplan(page, wegId, 2031, 12000);

    const { token } = await getSupabaseRequestContext(page);
    await activateWirtschaftsplanFixture(page, planId);

    const beforeRes = await page.request.get(
      `${url}/rest/v1/sollstellung?wirtschaftsplan_id=eq.${planId}&select=betrag`,
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
      `${url}/rest/v1/wirtschaftsplan?id=eq.${planId}`,
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
      `${url}/rest/v1/sollstellung?wirtschaftsplan_id=eq.${planId}&select=betrag`,
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
    const unitId = await createTestUnit(page, wegId, "UnitA", "100");
    const planId = await createWirtschaftsplan(page, wegId, 2032, 12000);

    const { token } = await getSupabaseRequestContext(page);
    await activateWirtschaftsplanFixture(page, planId);

    const beforeRes = await page.request.get(
      `${url}/rest/v1/sollstellung?unit_id=eq.${unitId}&select=betrag`,
      { headers: { apikey: key, Authorization: `Bearer ${token}` } },
    );
    expect(beforeRes.ok()).toBe(true);
    const beforeAmounts = ((await beforeRes.json()) as Array<{ betrag: number }>).map(
      (row) => Number(row.betrag),
    );
    expect(beforeAmounts).toHaveLength(12);
    expect(beforeAmounts.every((amount) => amount === 100)).toBe(true);

    const updateRes = await page.request.patch(
      `${url}/rest/v1/unit?id=eq.${unitId}`,
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
      `${url}/rest/v1/sollstellung?unit_id=eq.${unitId}&select=betrag`,
      { headers: { apikey: key, Authorization: `Bearer ${token}` } },
    );
    expect(afterRes.ok()).toBe(true);
    const afterAmounts = ((await afterRes.json()) as Array<{ betrag: number }>).map(
      (row) => Number(row.betrag),
    );
    expect(afterAmounts).toEqual(beforeAmounts);
  });
});
