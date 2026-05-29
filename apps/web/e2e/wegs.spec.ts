import { test, expect } from "@playwright/test";

// CRUD smoke for the WEG-Stammdaten path against the linked Cloud Frankfurt
// project. Runs as the seeded admin (auth.setup.ts persisted the session)
// so RLS scopes everything to that tenant — no cross-tenant leakage is
// possible from this browser context.
//
// Each test names its WEG with a timestamp so re-runs do not collide with
// rows persisted by previous runs. The created rows accumulate in the
// Cloud DB; that is acceptable for now — the seed tenant is dedicated to
// e2e use and deleting WEG rows would require coordinating with the
// append-only audit chain (§ 3.5).

const wegName = (label: string) => `E2E ${label} ${Date.now()}`;

test.describe("wegs CRUD", () => {
  test("renders the WEG list when authenticated", async ({ page }) => {
    await page.goto("/wegs");
    await expect(page).toHaveURL(/\/wegs$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "WEGs" }),
    ).toBeVisible();
    // The page either shows the empty-state CTA or the list — in both
    // cases the "Neue WEG anlegen" link is reachable.
    await expect(
      page.getByRole("link", { name: /Neue WEG anlegen/ }).first(),
    ).toBeVisible();
  });

  test("creates a WEG, lands on detail, and lists it on /wegs", async ({ page }) => {
    const name = wegName("CRUD");
    const adresse = "Teststraße 1, 12345 Testheim";

    // 1. Create — server action redirects on success.
    await page.goto("/wegs/new");
    await page.getByLabel(/Name der WEG/).fill(name);
    await page.getByLabel("Adresse").fill(adresse);
    await page.getByRole("button", { name: /Speichern/ }).click();

    // 2. The createWeg action redirects to /wegs/<id> on success
    //    (apps/web/src/app/(dashboard)/wegs/new/actions.ts).
    await expect(page).toHaveURL(/\/wegs\/[0-9a-f-]{36}$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(page.getByText(adresse)).toBeVisible();

    // 3. Navigate back to the list — the new WEG must be visible there too.
    await page.goto("/wegs");
    // Targeting the row's name text avoids brittleness on the list layout.
    await expect(page.getByText(name).first()).toBeVisible();
  });

  test("rejects a name shorter than 3 characters with an inline error", async ({ page }) => {
    await page.goto("/wegs/new");
    await page.getByLabel(/Name der WEG/).fill("ab");
    await page.getByRole("button", { name: /Speichern/ }).click();

    // The form's `name-error` alert renders only when validation fails;
    // its presence proves the action ran and rejected the input. We do
    // not assert the exact German wording — only that an error appears
    // under the name field.
    await expect(page.locator("#name-error")).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/wegs\/new$/);
  });
});
