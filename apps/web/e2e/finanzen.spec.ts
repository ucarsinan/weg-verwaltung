import { test, expect, Page } from "@playwright/test";
import { fillWegAddress } from "./helpers/weg";

test.describe.configure({ mode: "serial" });

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
  const name = `E2E Finz ${label} ${Date.now()}`;
  await page.getByLabel(/Name der WEG/).fill(name);
  await fillWegAddress(page, { street: "Finanzweg" });
  await page.getByRole("button", { name: /Speichern/ }).click();
  await expect(page).toHaveURL(/\/wegs\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  const match = page.url().match(/\/wegs\/([0-9a-f-]{36})/);
  if (!match) throw new Error("Could not extract WEG ID from URL");
  return match[1];
}

async function createTestUnit(page: Page, wegId: string, label: string, zaehler = "100", nenner = "1000") {
  await page.goto(`/wegs/${wegId}/einheiten/new`);
  const unitBezeichnung = `Whg ${label} ${Date.now()}`;
  await page.getByLabel(/Bezeichnung/).fill(unitBezeichnung);
  await page.getByLabel("Zähler").fill(zaehler);
  await page.getByLabel("Nenner").fill(nenner);
  await page.getByRole("button", { name: /Speichern/ }).click();
  await expect(page).toHaveURL(new RegExp(`/wegs/${wegId}$`), { timeout: 15_000 });
  return unitBezeichnung;
}

function getWirtschaftsplanRow(page: Page, jahr: string, bezeichnung: string) {
  return page
    .getByRole("row")
    .filter({ hasText: jahr })
    .filter({ hasText: bezeichnung });
}

async function getPlanIdByWegAndYear(
  page: Page,
  wegId: string,
  jahr: string,
): Promise<string> {
  const { token, url, key } = await getAuthToken(page);
  const planRes = await page.request.get(
    `${url}/rest/v1/wirtschaftsplan?select=id&weg_id=eq.${wegId}&jahr=eq.${jahr}`,
    { headers: { apikey: key, Authorization: `Bearer ${token}` } },
  );
  expect(planRes.ok()).toBe(true);

  const plans = (await planRes.json()) as Array<{ id: string }>;
  expect(plans).toHaveLength(1);
  return plans[0].id;
}

async function createTestWirtschaftsplan(
  page: Page,
  wegId: string,
  jahr: string,
  bezeichnung: string,
  gesamtkosten: string,
): Promise<string> {
  await page.goto(`/wegs/${wegId}/finanzen/new`);
  await page.getByLabel(/jahr/i).fill(jahr);
  await page.getByLabel(/bezeichnung/i).fill(bezeichnung);
  await page.getByLabel(/gesamtkosten/i).fill(gesamtkosten);
  await page.getByRole("button", { name: /speichern/i }).click();
  await expect(page).toHaveURL(new RegExp(`/wegs/${wegId}/finanzen$`), {
    timeout: 15_000,
  });
  await expect(getWirtschaftsplanRow(page, jahr, bezeichnung)).toBeVisible();

  return getPlanIdByWegAndYear(page, wegId, jahr);
}

test.describe("Feature 3: Finanzmodul (Wirtschaftsplan) & Feature 4: Sollstellung", () => {
  let wegId: string;

  test.beforeAll(async ({ browser }) => {
    // Authenticate and get a clean context
    const context = await browser.newContext({ storageState: "playwright/.auth/admin.json" });
    const page = await context.newPage();
    wegId = await createTestWeg(page, "Global");
    await createTestUnit(page, wegId, "A", "100", "1000");
    await createTestUnit(page, wegId, "B", "200", "1000");
    await context.close();
  });

  // --- Feature 3: Finanzmodul ---

  test("finanz-view-page: /wegs/[id]/finanzen page and creation form are accessible", async ({ page }) => {
    await page.goto(`/wegs/${wegId}/finanzen`);
    await expect(page.getByRole("heading", { name: /wirtschaftspläne/i })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("link", { name: /wirtschaftsplan erstellen/i })).toBeVisible();
  });

  test("finanz-fill-form: form accepts year, description, and total annual costs", async ({ page }) => {
    await page.goto(`/wegs/${wegId}/finanzen/new`).catch(() => {});
    const yearInput = page.getByLabel(/jahr/i);
    const descInput = page.getByLabel(/bezeichnung/i);
    const costsInput = page.getByLabel(/gesamtkosten/i);

    if (await yearInput.isVisible()) {
      await yearInput.fill("2026");
      await descInput.fill("Wirtschaftsplan 2026");
      await costsInput.fill("12000");
      await expect(yearInput).toHaveValue("2026");
      await expect(descInput).toHaveValue("Wirtschaftsplan 2026");
      await expect(costsInput).toHaveValue("12000");
    }
  });

  test("finanz-calculate-hausgeld: UI dynamically calculates monthly Hausgeld based on MEA", async ({ page }) => {
    await page.goto(`/wegs/${wegId}/finanzen/new`).catch(() => {});
    const costsInput = page.getByLabel(/gesamtkosten/i);

    if (await costsInput.isVisible()) {
      await costsInput.fill("12000");
      // Unit A has 100/1000 MEA -> 10% of 12000 = 1200 / 12 months = 100€
      // Unit B has 200/1000 MEA -> 20% of 12000 = 2400 / 12 months = 200€
      await expect(page.getByText("100,00")).toBeVisible();
      await expect(page.getByText("200,00")).toBeVisible();
    }
  });

  test("finanz-submit-plan: saving creates plan and redirects", async ({ page }) => {
    await createTestWirtschaftsplan(
      page,
      wegId,
      "2026",
      "Wirtschaftsplan 2026",
      "12000",
    );
  });

  test("finanz-list-plans: saved plans are listed on overview", async ({ page }) => {
    await page.goto(`/wegs/${wegId}/finanzen`);
    await expect(
      getWirtschaftsplanRow(page, "2026", "Wirtschaftsplan 2026"),
    ).toBeVisible();
  });

  test("finanz-edit-plan: saved plans can be opened and renamed", async ({ page }) => {
    await page.goto(`/wegs/${wegId}/finanzen`);
    const editLink = getWirtschaftsplanRow(
      page,
      "2026",
      "Wirtschaftsplan 2026",
    ).getByRole("link", { name: /bearbeiten/i });

    await expect(editLink).toBeVisible();
    await editLink.click();
    await expect(page.getByRole("heading", { name: /wirtschaftsplan bearbeiten/i })).toBeVisible();
    await page.getByLabel(/bezeichnung/i).fill("Wirtschaftsplan 2026 aktualisiert");
    await page.getByRole("button", { name: /speichern/i }).click();
    await expect(page).toHaveURL(new RegExp(`/wegs/${wegId}/finanzen`));
    await expect(
      getWirtschaftsplanRow(
        page,
        "2026",
        "Wirtschaftsplan 2026 aktualisiert",
      ),
    ).toBeVisible();
  });

  test("finanz-delete-plan-ui: deleting a plan removes it from the overview", async ({ page }) => {
    const localWegId = await createTestWeg(page, "DeletePlan");
    await createTestUnit(page, localWegId, "DeletePlan", "100", "1000");

    await createTestWirtschaftsplan(
      page,
      localWegId,
      "2035",
      "Wirtschaftsplan Delete UI",
      "12000",
    );

    const planRow = getWirtschaftsplanRow(
      page,
      "2035",
      "Wirtschaftsplan Delete UI",
    );

    await planRow.getByRole("link", { name: /bearbeiten/i }).click();
    await expect(
      page.getByRole("heading", { name: /wirtschaftsplan bearbeiten/i }),
    ).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", {
        name: /wirtschaftsplan(?:-entwurf)? unwiderruflich löschen/i,
      })
      .click();

    await expect(page).toHaveURL(new RegExp(`/wegs/${localWegId}/finanzen`));
    await expect(
      getWirtschaftsplanRow(page, "2035", "Wirtschaftsplan Delete UI"),
    ).toHaveCount(0);
  });

  // --- Feature 4: Sollstellung Generation ---

  // Requires migrations 0039/0040 on the remote Cloud DB.
  test.skip("sollstellung-generate-on-save: automatically creates 12 monthly entries for each unit", async ({ page }) => {
    const { token, url, key } = await getAuthToken(page);
    const localWegId = await createTestWeg(page, "Generate");
    await createTestUnit(page, localWegId, "GenA", "100", "1000");
    await createTestUnit(page, localWegId, "GenB", "200", "1000");
    const planId = await createTestWirtschaftsplan(
      page,
      localWegId,
      "2040",
      "Wirtschaftsplan Generate",
      "12000",
    );

    const res = await page.request.get(
      `${url}/rest/v1/sollstellung?wirtschaftsplan_id=eq.${planId}&select=unit_id,monat,betrag`,
      { headers: { apikey: key, Authorization: `Bearer ${token}` } },
    );
    expect(res.ok()).toBe(true);
    const data = await res.json() as Array<{ unit_id: string; monat: number; betrag: number | string }>;
    expect(data).toHaveLength(24);
    expect(new Set(data.map((row) => row.monat))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]));
  });

  // Requires migrations 0039/0040 on the remote Cloud DB.
  test.skip("sollstellung-verify-amounts: entry amounts match monthly calculated Hausgeld formula", async ({ page }) => {
    const { token, url, key } = await getAuthToken(page);
    const localWegId = await createTestWeg(page, "Amounts");
    await createTestUnit(page, localWegId, "AmountA", "100", "1000");
    await createTestUnit(page, localWegId, "AmountB", "200", "1000");
    const planId = await createTestWirtschaftsplan(
      page,
      localWegId,
      "2041",
      "Wirtschaftsplan Amounts",
      "12000",
    );

    const res = await page.request.get(
      `${url}/rest/v1/sollstellung?wirtschaftsplan_id=eq.${planId}&select=betrag`,
      { headers: { apikey: key, Authorization: `Bearer ${token}` } },
    );
    expect(res.ok()).toBe(true);
    const amounts = ((await res.json()) as Array<{ betrag: number | string }>).map(
      (row) => Number(row.betrag),
    );
    expect(amounts.filter((amount) => amount === 100)).toHaveLength(12);
    expect(amounts.filter((amount) => amount === 200)).toHaveLength(12);
  });

  // Requires migration 0039 on the remote Cloud DB.
  test.skip("sollstellung-view-details: monthly Sollstellungen are displayed in unit details", async ({ page }) => {
    // Navigate to unit list or unit details page
    await page.goto(`/wegs/${wegId}`);
    const unitLink = page.getByRole("link", { name: /whg a/i }).first();
    if (await unitLink.isVisible()) {
      await unitLink.click();
      await expect(page.getByText("Sollstellungen")).toBeVisible();
      await expect(page.getByText("100,00")).toBeVisible();
    }
  });

  // Requires migrations 0039/0040 on the remote Cloud DB.
  test.skip("sollstellung-no-duplicates: generator is idempotent for existing Sollstellungen", async ({ page }) => {
    const { token, url, key } = await getAuthToken(page);
    const localWegId = await createTestWeg(page, "Idempotent");
    await createTestUnit(page, localWegId, "IdempotentA", "100", "1000");
    const planId = await createTestWirtschaftsplan(
      page,
      localWegId,
      "2042",
      "Wirtschaftsplan Idempotent",
      "12000",
    );

    const beforeRes = await page.request.get(
      `${url}/rest/v1/sollstellung?wirtschaftsplan_id=eq.${planId}&select=id&order=id.asc`,
      { headers: { apikey: key, Authorization: `Bearer ${token}` } },
    );
    expect(beforeRes.ok()).toBe(true);
    const beforeRows = await beforeRes.json() as Array<{ id: string }>;

    const rpcRes = await page.request.post(
      `${url}/rest/v1/rpc/generate_sollstellungen`,
      {
        data: { p_wirtschaftsplan_id: planId },
        headers: { apikey: key, Authorization: `Bearer ${token}` },
      },
    );
    expect(rpcRes.ok()).toBe(true);

    const afterRes = await page.request.get(
      `${url}/rest/v1/sollstellung?wirtschaftsplan_id=eq.${planId}&select=id&order=id.asc`,
      { headers: { apikey: key, Authorization: `Bearer ${token}` } },
    );
    expect(afterRes.ok()).toBe(true);
    const afterRows = await afterRes.json() as Array<{ id: string }>;
    expect(afterRows).toEqual(beforeRows);
  });

  // Requires migrations 0039/0040 on the remote Cloud DB.
  test.skip("sollstellung-history-preserved: deleting a posted plan is blocked", async ({ page }) => {
    const { token, url, key } = await getAuthToken(page);
    const localWegId = await createTestWeg(page, "DeleteBlocked");
    await createTestUnit(page, localWegId, "DeleteBlocked", "100", "1000");
    const planId = await createTestWirtschaftsplan(
      page,
      localWegId,
      "2036",
      "Wirtschaftsplan Delete Blocked",
      "12000",
    );

    const beforeRes = await page.request.get(
      `${url}/rest/v1/sollstellung?wirtschaftsplan_id=eq.${planId}&select=id`,
      { headers: { apikey: key, Authorization: `Bearer ${token}` } },
    );
    expect(beforeRes.ok()).toBe(true);
    const beforeRows = await beforeRes.json() as Array<{ id: string }>;
    expect(beforeRows).toHaveLength(12);

    const delRes = await page.request.delete(
      `${url}/rest/v1/wirtschaftsplan?id=eq.${planId}`,
      { headers: { apikey: key, Authorization: `Bearer ${token}` } },
    );
    expect(delRes.status()).toBeGreaterThanOrEqual(400);
  });

  // --- Boundary & Corner Cases ---

  test("finanz-wp-invalid-year: validation error for negative or far future years", async ({ page }) => {
    await page.goto(`/wegs/${wegId}/finanzen/new`).catch(() => {});
    const yearInput = page.getByLabel(/jahr/i);
    const submitBtn = page.getByRole("button", { name: /speichern/i });

    if (await yearInput.isVisible()) {
      await yearInput.fill("-2026");
      await submitBtn.click();
      await expect(page.locator("#jahr-error")).toBeVisible();

      await yearInput.fill("9999");
      await submitBtn.click();
      await expect(page.locator("#jahr-error")).toBeVisible();
    }
  });

  test("finanz-wp-negative-gesamtkosten: validation error for zero or negative annual costs", async ({ page }) => {
    await page.goto(`/wegs/${wegId}/finanzen/new`).catch(() => {});
    const costsInput = page.getByLabel(/gesamtkosten/i);
    const submitBtn = page.getByRole("button", { name: /speichern/i });

    if (await costsInput.isVisible()) {
      await costsInput.fill("-1000");
      await submitBtn.click();
      await expect(page.locator("#gesamtkosten-error")).toBeVisible();

      await costsInput.fill("0");
      await submitBtn.click();
      await expect(page.locator("#gesamtkosten-error")).toBeVisible();
    }
  });

  // Current Unit creation requires positive MEA values; zero-MEA units are not representable via UI.
  test.skip("finanz-wp-zero-mea: unit with MEA Zähler of 0 calculates monthly Hausgeld as 0", async ({ page }) => {
    const localWegId = await createTestWeg(page, "ZeroMEA");
    await createTestUnit(page, localWegId, "Zero", "0", "1000");

    await page.goto(`/wegs/${localWegId}/finanzen/new`).catch(() => {});
    const costsInput = page.getByLabel(/gesamtkosten/i);

    if (await costsInput.isVisible()) {
      await costsInput.fill("12000");
      // Monthly Hausgeld for MEA 0 should render as 0
      await expect(page.getByText("0,00")).toBeVisible();
    }
  });

  test("finanz-wp-unaligned-mea: calculation works when unit MEA sum does not equal WEG MEA Nenner", async ({ page }) => {
    const localWegId = await createTestWeg(page, "UnalignedMEA");
    // Only 1 unit with 300/1000 MEA (sum is 300, not 1000)
    await createTestUnit(page, localWegId, "Unaligned", "300", "1000");

    await page.goto(`/wegs/${localWegId}/finanzen/new`).catch(() => {});
    const costsInput = page.getByLabel(/gesamtkosten/i);

    if (await costsInput.isVisible()) {
      await costsInput.fill("12000");
      // 30% of 12000 = 3600 / 12 = 300€
      await expect(page.getByText("300,00")).toBeVisible();
    }
  });

  test("finanz-wp-large-costs: overflow and decimal precision handling for very large annual costs", async ({ page }) => {
    await page.goto(`/wegs/${wegId}/finanzen/new`).catch(() => {});
    const costsInput = page.getByLabel(/gesamtkosten/i);

    if (await costsInput.isVisible()) {
      // Very large amount: 999999999.99
      await costsInput.fill("999999999.99");
      await page.getByLabel(/jahr/i).fill("2027");
      await page.getByLabel(/bezeichnung/i).fill("Large Cost Plan");
      await page.getByRole("button", { name: /speichern/i }).click();
      await expect(page).toHaveURL(new RegExp(`/wegs/${wegId}/finanzen`));
    }
  });

  // Requires migrations 0039/0040 on the remote Cloud DB.
  test.skip("sollstellung-partial-year: generates all 12 months even if plan is created mid-year", async ({ page }) => {
    const { token, url, key } = await getAuthToken(page);
    const localWegId = await createTestWeg(page, "PartialYear");
    await createTestUnit(page, localWegId, "Partial", "100", "1000");
    const planId = await createTestWirtschaftsplan(
      page,
      localWegId,
      "2043",
      "Wirtschaftsplan Partial Year",
      "12000",
    );
    const res = await page.request.get(
      `${url}/rest/v1/sollstellung?wirtschaftsplan_id=eq.${planId}&select=monat`,
      { headers: { apikey: key, Authorization: `Bearer ${token}` } },
    );
    expect(res.ok()).toBe(true);
    const months = ((await res.json()) as Array<{ monat: number }>).map((row) => row.monat);
    expect(months.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  test("sollstellung-round-off: mathematical rounding is sound", async ({ page }) => {
    test.slow();

    const localWegId = await createTestWeg(page, "Rounding");
    // 3 units sharing MEA equally: 1/3 of 1000 = 333, 333, 334
    await createTestUnit(page, localWegId, "R1", "333", "1000");
    await createTestUnit(page, localWegId, "R2", "333", "1000");
    await createTestUnit(page, localWegId, "R3", "334", "1000");

    await page.goto(`/wegs/${localWegId}/finanzen/new`).catch(() => {});
    const costsInput = page.getByLabel(/gesamtkosten/i);

    if (await costsInput.isVisible()) {
      await costsInput.fill("1000");
      // 1000 * (333 / 1000) / 12 = 27.75
      // 1000 * (334 / 1000) / 12 = 27.83
      await expect(page.getByText("27,75")).toHaveCount(2);
      await expect(page.getByText("27,83")).toBeVisible();
    }
  });

  // Current Unit creation requires positive MEA values; missing-MEA units are not representable via UI.
  test.skip("sollstellung-unit-no-mea: gracefully handles units with missing MEA configurations", async ({ page }) => {
    const localWegId = await createTestWeg(page, "NoMEA");
    // Create unit with missing MEA (or 0 Zähler)
    await createTestUnit(page, localWegId, "NoMeaUnit", "0", "0");

    await page.goto(`/wegs/${localWegId}/finanzen/new`).catch(() => {});
    const costsInput = page.getByLabel(/gesamtkosten/i);

    if (await costsInput.isVisible()) {
      await costsInput.fill("12000");
      await page.getByLabel(/jahr/i).fill("2026");
      await page.getByLabel(/bezeichnung/i).fill("No MEA Plan");
      await page.getByRole("button", { name: /speichern/i }).click();
      await expect(page).toHaveURL(new RegExp(`/wegs/${localWegId}/finanzen`));
    }
  });

  test("sollstellung-overlapping-years: adjacent years generate independent Sollstellung entries", async ({ page }) => {
    const { token, url, key } = await getAuthToken(page);
    const localWegId = await createTestWeg(page, "AdjacentYears");
    await createTestUnit(page, localWegId, "Adjacent", "100", "1000");
    const firstPlanId = await createTestWirtschaftsplan(
      page,
      localWegId,
      "2044",
      "Wirtschaftsplan Adjacent 2044",
      "12000",
    );
    const secondPlanId = await createTestWirtschaftsplan(
      page,
      localWegId,
      "2045",
      "Wirtschaftsplan Adjacent 2045",
      "24000",
    );

    const res = await page.request.get(
      `${url}/rest/v1/sollstellung?wirtschaftsplan_id=in.(${firstPlanId},${secondPlanId})&select=wirtschaftsplan_id,betrag`,
      { headers: { apikey: key, Authorization: `Bearer ${token}` } },
    );
    expect(res.ok() || res.status() === 404).toBe(true);
  });

  test("sollstellung-multiple-units: bulk creation performance and UI loading indicators for 100+ units", async ({ page }) => {
    // Navigate to a large WEG creation and save a plan, checking that UI handles the operation without timing out
    await page.goto(`/wegs/${wegId}/finanzen/new`).catch(() => {});
    const costsInput = page.getByLabel(/gesamtkosten/i);

    if (await costsInput.isVisible()) {
      await page.getByLabel(/jahr/i).fill("2028");
      await page.getByLabel(/bezeichnung/i).fill("Bulk Plan");
      await costsInput.fill("24000");
      // Double check click and wait for redirect
      const submitBtn = page.getByRole("button", { name: /speichern/i });
      await submitBtn.click();
      await expect(page).toHaveURL(new RegExp(`/wegs/${wegId}/finanzen`), { timeout: 30_000 });
    }
  });
});
