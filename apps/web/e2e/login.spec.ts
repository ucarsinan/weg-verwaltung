import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";

// E2E coverage for the Login → Dashboard flow against the linked Supabase
// Cloud project (Frankfurt). The webServer in playwright.config.ts boots
// `pnpm dev` which loads `apps/web/.env.local` — the cloud credentials.
//
// `seed-admin.mjs` (apps/web/scripts/seed-admin.mjs) is idempotent: it
// upserts the auth user, tenant, and tenant_member rows, so running it as
// part of the test setup is safe to repeat. We use the script defaults
// (admin@admin.com / admin1 / "Default WEG-Verwaltung") so the test does
// not have to thread credentials around.

const execFileAsync = promisify(execFile);
// Playwright runs from the apps/web/ directory (where playwright.config.ts
// lives). Path-resolve relative to that — avoids ESM/CJS `import.meta`
// gymnastics in the transpiled spec.
const webDir = resolve(process.cwd());
const seedScript = resolve(webDir, "scripts", "seed-admin.mjs");

const TEST_EMAIL = "admin@admin.com";
const TEST_PASSWORD = "admin1";

test.describe("login flow", () => {
  test.beforeAll(async () => {
    // Bootstrap the cloud admin before the suite runs. The script is a
    // no-op if the user, tenant, and membership already exist.
    const { stderr } = await execFileAsync("node", [seedScript], {
      cwd: webDir,
    });
    // Seed script writes progress to stdout; only surface a non-empty
    // stderr to the test log.
    if (stderr.trim()) console.warn("[seed-admin stderr]", stderr);
  });

  test("rejects invalid credentials with a German error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-Mail").fill(TEST_EMAIL);
    await page.getByLabel("Passwort").fill("definitely-wrong-password");
    await page.getByRole("button", { name: /anmelden/i }).click();

    // The login action returns the same generic German message for any
    // failure (no email-enumeration leak — login/actions.ts). Target the
    // form's own alert region by id; the page also has Next's hidden
    // `__next-route-announcer__` alert which would otherwise trip strict
    // mode.
    const alert = page.locator("#login-error");
    await expect(alert).toContainText(/Anmeldung fehlgeschlagen/i);
    // URL stays on /login until success.
    await expect(page).toHaveURL(/\/login/);
  });

  test("logs in with seeded admin and lands on /dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-Mail").fill(TEST_EMAIL);
    await page.getByLabel("Passwort").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /anmelden/i }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    // Dashboard reads the user from cookies and renders a personalised
    // surface; a stable selector is the heading.
    await expect(
      page.getByRole("heading", { level: 1 }),
    ).toBeVisible();
  });
});
