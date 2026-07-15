import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("home page", () => {
  test("renders the landing", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/WEG-Verwaltung/i);
    // The §5.10 skip-link must be present (visually-hidden, focusable)
    const skipLink = page.getByRole("link", { name: /zum hauptinhalt|skip to main/i });
    await expect(skipLink).toBeAttached();
  });

  test("has no detectable a11y violations on landing", async ({ page }) => {
    await page.goto("/");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
      .analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  test("login link routes to /login", async ({ page }) => {
    await page.goto("/");
    const loginLink = page.getByRole("link", { name: /anmelden|login/i }).first();
    // Unconditional: a missing/hidden login link must fail the test loudly,
    // not silently skip the navigation assertion.
    await expect(loginLink).toBeVisible();
    await loginLink.click();
    await expect(page).toHaveURL(/\/login/);
  });
});
