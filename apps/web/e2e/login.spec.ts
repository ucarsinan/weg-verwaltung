import { test, expect } from "@playwright/test";

// Negative-credentials coverage for /login. Positive (seed → login →
// /dashboard) is now the suite-wide auth bootstrap — see e2e/auth.setup.ts.
// This file deliberately runs in an unauthenticated browser context so
// the form actually surfaces an error rather than redirecting away.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("login flow", () => {
  test("rejects invalid credentials with a German error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-Mail").fill("admin@admin.com");
    await page.getByLabel("Passwort").fill("definitely-wrong-password");
    await page.getByRole("button", { name: /anmelden/i }).click();

    // The login action returns the same generic German message for any
    // failure (no email-enumeration leak — login/actions.ts). Target the
    // form's own alert region by id; Next.js also injects a hidden
    // `__next-route-announcer__` `role="alert"` which would otherwise trip
    // Playwright strict-mode.
    const alert = page.locator("#login-error");
    await expect(alert).toContainText(/Anmeldung fehlgeschlagen/i);
    await expect(page).toHaveURL(/\/login/);
  });
});
