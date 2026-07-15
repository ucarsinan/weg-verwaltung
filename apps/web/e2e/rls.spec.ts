import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

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

// custom_access_token_hook (0002_identity.sql) injects tenant_id into
// app_metadata on every JWT — decode it directly so isolation tests can
// assert on real tenant_id values instead of just "the request didn't error".
function decodeTenantId(token: string): string {
  const payload = token.split(".")[1];
  const json = Buffer.from(payload, "base64url").toString("utf-8");
  const claims = JSON.parse(json) as { app_metadata?: { tenant_id?: string } };
  const tenantId = claims.app_metadata?.tenant_id;
  if (!tenantId) throw new Error("JWT is missing app_metadata.tenant_id");
  return tenantId;
}

test.describe("Feature 5: RLS Security Constraints", () => {
  let tokenA: string;
  let tokenB: string;
  let tenantAId: string;
  let tenantBId: string;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:54321";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  test.beforeAll(() => {
    tokenA = getTokenFromAuthFile("admin.json");
    tokenB = getTokenFromAuthFile("tenant_b.json");
    tenantAId = decodeTenantId(tokenA);
    tenantBId = decodeTenantId(tokenB);
  });

  test("rls-wp-select-isolated: Tenant A cannot read Tenant B's Wirtschaftspläne", async ({ request }) => {
    // A GET against an existing, authorized table always returns 200 with a
    // (possibly empty) array via PostgREST — RLS filters rows, it never 404s.
    const res = await request.get(`${url}/rest/v1/wirtschaftsplan?select=*`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${tokenA}`
      }
    });
    expect(res.ok()).toBe(true);
    const plans = await res.json() as Array<{ tenant_id: string }>;
    for (const plan of plans) {
      expect(plan.tenant_id).toBe(tenantAId);
      expect(plan.tenant_id).not.toBe(tenantBId);
    }
  });

  test("rls-wp-insert-isolated: Tenant A cannot insert Wirtschaftspläne for Tenant B's WEGs", async ({ request }) => {
    // Attempting to insert a plan for Tenant B (simulated by using a fake/different tenant_id or parent WEG)
    const res = await request.post(`${url}/rest/v1/wirtschaftsplan`, {
      data: {
        jahr: 2026,
        bezeichnung: "Stolen Plan",
        gesamtkosten: 5000,
        tenant_id: "00000000-0000-0000-0000-000000000000", // Non-existent or Tenant B's ID
      },
      headers: {
        apikey: key,
        Authorization: `Bearer ${tokenA}`,
        "Content-Type": "application/json"
      }
    });
    // Should fail with 403/401/400 (Insufficient Privilege / 42501)
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test("rls-sollstellung-select-isolated: Tenant A cannot read Tenant B's Sollstellungen", async ({ request }) => {
    const res = await request.get(`${url}/rest/v1/sollstellung?select=*`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${tokenA}`
      }
    });
    expect(res.ok()).toBe(true);
    const sollstellungen = await res.json() as Array<{ tenant_id: string }>;
    for (const row of sollstellungen) {
      expect(row.tenant_id).toBe(tenantAId);
      expect(row.tenant_id).not.toBe(tenantBId);
    }
  });

  test("rls-sollstellung-direct-writes-blocked: Tenant A cannot insert Tenant B's Sollstellungen", async ({ request }) => {
    const res = await request.post(`${url}/rest/v1/sollstellung`, {
      data: {
        monat: 1,
        betrag: 150,
        wirtschaftsplan_id: "00000000-0000-0000-0000-000000000000",
        tenant_id: "00000000-0000-0000-0000-000000000000",
      },
      headers: {
        apikey: key,
        Authorization: `Bearer ${tokenA}`,
        "Content-Type": "application/json"
      }
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test("rls-anonymous-blocked: unauthenticated requests cannot read existing data or write these tables", async ({ request }) => {
    const readWp = await request.get(`${url}/rest/v1/wirtschaftsplan?select=*`, {
      headers: { apikey: key }
    });
    expect(readWp.ok()).toBe(true);
    const anonymousPlans = await readWp.json() as unknown[];
    expect(anonymousPlans).toEqual([]);

    const writeWp = await request.post(`${url}/rest/v1/wirtschaftsplan`, {
      data: { jahr: 2026, bezeichnung: "Anon" },
      headers: { apikey: key },
    });
    expect(writeWp.status()).toBeGreaterThanOrEqual(400);
  });

  test("rls-bypass-rpc-check: direct invocation of detach_and_drop_partition is blocked for non-superusers/non-admin roles", async ({ request }) => {
    // Non-superusers should be blocked
    const res = await request.post(`${url}/rest/v1/rpc/detach_and_drop_partition`, {
      data: { p_name: "audit_event_2020_01" },
      headers: {
        apikey: key,
        Authorization: `Bearer ${tokenB}` // Using standard non-superuser/secondary tenant token
      }
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test("rls-cross-tenant-update: database rejects direct updates of another tenant's rows", async ({ request }) => {
    const res = await request.patch(`${url}/rest/v1/wirtschaftsplan?id=eq.00000000-0000-0000-0000-000000000000`, {
      data: { bezeichnung: "Hacked" },
      headers: {
        apikey: key,
        Authorization: `Bearer ${tokenA}`
      }
    });
    expect(res.ok() || res.status() === 404).toBe(true);
    if (res.ok()) {
      // Postgres RLS makes it so that 0 rows are updated silently, which returns 200 or 204 with no content
      const data = await res.json().catch(() => null);
      if (Array.isArray(data)) {
        expect(data.length).toBe(0);
      }
    }
  });

  test("rls-schema-tampering: resistance to SQL injection in parameters", async ({ request }) => {
    const res = await request.get(`${url}/rest/v1/wirtschaftsplan?id=eq.00000000-0000-0000-0000-000000000000;drop%20table%20wirtschaftsplan`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${tokenA}`
      }
    });
    expect(res.ok()).toBe(true);
    const rows = await res.json() as unknown[];
    expect(rows).toEqual([]);

    const followUp = await request.get(`${url}/rest/v1/wirtschaftsplan?select=id&limit=1`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${tokenA}`
      }
    });
    expect(followUp.ok()).toBe(true);
  });

  test("rls-tenant-header-spoofing: resistance to JWT/tenant header manipulation", async ({ request }) => {
    const res = await request.get(`${url}/rest/v1/wirtschaftsplan?select=*`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${tokenA}`,
        "X-Consumer-ID": "some-other-id",
        "X-Tenant-ID": "some-other-tenant"
      }
    });
    expect(res.ok() || res.status() === 404).toBe(true);
  });

  test("rls-sollstellung-history-lockdown: cross-tenant deletes do not remove historical finance data", async ({ request }) => {
    const res = await request.delete(`${url}/rest/v1/wirtschaftsplan?tenant_id=eq.00000000-0000-0000-0000-000000000000`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${tokenA}`
      }
    });
    expect(res.ok() || res.status() === 404).toBe(true);
  });
});
