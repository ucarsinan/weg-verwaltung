import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Asserts the authenticated /dashboard surface. Relies on the suite-wide
// storage state produced by e2e/auth.setup.ts — no fresh login per test.
// Source of truth for credentials: apps/web/scripts/seed-admin.mjs defaults.
const ADMIN_EMAIL = "admin@admin.com";

const TENANT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

test.describe("dashboard (authenticated)", () => {
  test("renders the seeded admin's email", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(
      page.getByRole("heading", { level: 1, name: "Dashboard" }),
    ).toBeVisible();

    const angemeldetAls = page
      .locator("dt", { hasText: /Angemeldet als/i })
      .locator("xpath=following-sibling::dd[1]");
    await expect(angemeldetAls).toHaveText(ADMIN_EMAIL);
  });

  // The Custom Access Token Hook (0002_identity.sql) injects tenant_id + role
  // into JWT app_metadata. These claims live ONLY in the JWT — auth.users
  // .raw_app_meta_data does not get rewritten. So the page must read claims
  // via supabase.auth.getClaims(); supabase.auth.getUser() would return the
  // persistent (Hook-less) row and surface "—" in both cells.
  test("JWT carries tenant_id + role from custom_access_token_hook", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    const tenantIdCell = page
      .locator("dt", { hasText: /tenant_id/i })
      .locator("xpath=following-sibling::dd[1]");
    await expect(tenantIdCell).toHaveText(TENANT_ID_PATTERN);

    const roleCell = page
      .locator("dt", { hasText: /^Rolle$/i })
      .locator("xpath=following-sibling::dd[1]");
    await expect(roleCell).toHaveText("tenant_admin");
  });

  test("links into the WEGs module", async ({ page }) => {
    await page.goto("/dashboard");
    const wegsLink = page.getByRole("link", { name: /zur WEG-Liste/i });
    await expect(wegsLink).toBeVisible();
    await wegsLink.click();
    await expect(page).toHaveURL(/\/wegs$/);
  });

  test("has no detectable a11y violations", async ({ page }) => {
    await page.goto("/dashboard");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
      .analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });
});
