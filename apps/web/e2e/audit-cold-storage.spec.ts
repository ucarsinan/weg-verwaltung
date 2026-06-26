import { test, expect, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

type RpcAuth = {
  token: string;
  url: string;
  key: string;
};

type ArchivablePartition = {
  partition_name: string;
  partition_date: string;
};

async function getAuthToken(page: Page): Promise<RpcAuth> {
  const cookies = await page.context().cookies();
  const sbCookie = cookies.find(
    (cookie) =>
      cookie.name.startsWith("sb-") && cookie.name.endsWith("-auth-token"),
  );
  if (!sbCookie) {
    throw new Error("Supabase auth token cookie not found");
  }

  let cookieValue = decodeURIComponent(sbCookie.value);
  if (cookieValue.startsWith("base64-")) {
    cookieValue = Buffer.from(cookieValue.slice(7), "base64").toString("utf-8");
  }

  const tokenData: unknown = JSON.parse(cookieValue);
  const token = Array.isArray(tokenData)
    ? String(tokenData[0])
    : String((tokenData as { access_token: string }).access_token);

  return {
    token,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:54321",
    key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  };
}

async function postRpc(
  page: Page,
  auth: RpcAuth,
  functionName: string,
  body: Record<string, unknown> = {},
) {
  return page.request.post(`${auth.url}/rest/v1/rpc/${functionName}`, {
    data: body,
    headers: {
      apikey: auth.key,
      Authorization: `Bearer ${auth.token}`,
      "Content-Type": "application/json",
    },
  });
}

test.describe("Audit Log Cold-Storage", () => {
  test("lists only partitions older than the cold-storage cutoff", async ({
    page,
  }) => {
    const auth = await getAuthToken(page);
    const res = await postRpc(page, auth, "get_archivable_partitions");

    expect(res.ok()).toBe(true);
    const partitions = (await res.json()) as ArchivablePartition[];
    expect(Array.isArray(partitions)).toBe(true);

    const cutoff = new Date();
    cutoff.setDate(1);
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setMonth(cutoff.getMonth() - 24);

    for (const partition of partitions) {
      expect(partition.partition_name).toMatch(/^audit_event_\d{4}_\d{2}$/);
      const partitionDate = new Date(`${partition.partition_date}T00:00:00Z`);
      expect(partitionDate.getTime()).toBeLessThan(cutoff.getTime());
    }
  });

  test("keeps tenant-scoped cold-storage checks read-only", async ({
    page,
  }) => {
    const auth = await getAuthToken(page);

    const firstRes = await postRpc(page, auth, "get_archivable_partitions");
    expect(firstRes.ok()).toBe(true);
    const firstPartitions = (await firstRes.json()) as ArchivablePartition[];

    const secondRes = await postRpc(page, auth, "get_archivable_partitions");
    expect(secondRes.ok()).toBe(true);
    await expect(secondRes.json()).resolves.toEqual(firstPartitions);
  });

  test("reports archivable status without mutating partitions", async ({
    page,
  }) => {
    const auth = await getAuthToken(page);

    const invalidRes = await postRpc(page, auth, "check_partition_archivable", {
      p_name: "audit_event_invalid",
    });
    expect(invalidRes.ok()).toBe(true);
    await expect(invalidRes.json()).resolves.toMatchObject({
      archivable: false,
    });

    const recentDate = new Date();
    const recentName = `audit_event_${recentDate.getFullYear()}_${String(
      recentDate.getMonth() + 1,
    ).padStart(2, "0")}`;
    const recentRes = await postRpc(page, auth, "check_partition_archivable", {
      p_name: recentName,
    });
    expect(recentRes.ok()).toBe(true);
    await expect(recentRes.json()).resolves.toMatchObject({
      archivable: false,
    });
  });

  test("renders read-only archive status for tenant admins without direct upload/drop", async ({
    page,
  }) => {
    await page.goto("/audit");

    await expect(
      page.getByRole("heading", { level: 1, name: "Audit" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Verlauf" })).toBeVisible();
    await page.getByRole("button", { name: "Archiv" }).click();
    await expect(
      page.getByText("Archivierbare Partitionen", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Archivierte Dateien", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(/Systemkandidaten ohne UI-Aktion/i),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Archivieren" }),
    ).toHaveCount(0);
  });

  test("rejects expired archive signed URLs", async ({ page }) => {
    const auth = await getAuthToken(page);
    const res = await page.request.get(
      `${auth.url}/storage/v1/object/sign/audit-archives/some-file.csv?token=expired-token`,
      {
        headers: { apikey: auth.key },
      },
    );

    expect([400, 403]).toContain(res.status());
  });
});
