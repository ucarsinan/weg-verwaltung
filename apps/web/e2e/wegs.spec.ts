import { test, expect } from "@playwright/test";
import { createWegFixture, fillWegAddress } from "./helpers/weg";

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
    // The page either shows the empty-state CTA or the list; in both cases
    // a link to the WEG creation form is reachable.
    await expect(
      page.locator('a[href="/wegs/new"]').first(),
    ).toBeVisible();
  });

  test("creates a WEG, lands on detail, and lists it on /wegs", async ({ page }) => {
    const name = wegName("CRUD");

    // 1. Create — server action redirects on success.
    await page.goto("/wegs/new");
    await page.getByLabel(/Name der WEG/).fill(name);
    await fillWegAddress(page, {
      street: "Teststraße",
      houseNumber: "1",
      postalCode: "12345",
      city: "Testheim",
    });
    await page.getByRole("button", { name: /Speichern/ }).click();

    // 2. The createWeg action redirects to /wegs/<id> on success
    //    (apps/web/src/app/(dashboard)/wegs/new/actions.ts).
    await expect(page).toHaveURL(/\/wegs\/[0-9a-f-]{36}$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    const stammdaten = page.locator("#stammdaten");
    await expect(stammdaten.getByText(/Teststraße\s+1/)).toBeVisible();
    await expect(stammdaten.getByText(/12345\s+Testheim/)).toBeVisible();

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

  test("edits a WEG and shows the updated details on redirect", async ({ page }) => {
    const nameAlt = wegName("Edit-Alt");
    const nameNeu = wegName("Edit-Neu");

    // 1. Create a WEG to edit
    await page.goto("/wegs/new");
    await page.getByLabel(/Name der WEG/).fill(nameAlt);
    await fillWegAddress(page, {
      street: "Alte Str.",
      houseNumber: "1",
      postalCode: "12345",
      city: "Testheim",
    });
    await page.getByRole("button", { name: /Speichern/ }).click();
    await expect(page).toHaveURL(/\/wegs\/[0-9a-f-]{36}$/, { timeout: 15_000 });

    // 2. Click "WEG bearbeiten" button/link
    await page.getByRole("link", { name: /WEG bearbeiten/ }).click();
    await expect(page).toHaveURL(/\/wegs\/[0-9a-f-]{36}\/edit$/);

    // 3. Edit details and save
    await page.getByLabel(/Name der WEG/).fill(nameNeu);
    await fillWegAddress(page, {
      street: "Neue Str.",
      houseNumber: "2",
      postalCode: "54321",
      city: "Neheim",
    });
    await page.getByRole("button", { name: /Speichern/ }).click();

    // 4. Expect redirect back to details and updated details visible
    await expect(page).toHaveURL(/\/wegs\/[0-9a-f-]{36}$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { level: 1, name: nameNeu })).toBeVisible();
    const stammdaten = page.locator("#stammdaten");
    await expect(stammdaten.getByText(/Neue Str\.\s+2/)).toBeVisible();
    await expect(stammdaten.getByText(/54321\s+Neheim/)).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: nameAlt })).not.toBeVisible();
  });

  test("creates, edits, and deletes a Wohneinheit", async ({ page }) => {
    // 1. Create a WEG
    const wegNameVal = wegName("Unit-CRUD");
    const wegId = await createWegFixture(page, wegNameVal);

    // 2. Create a Wohneinheit
    const unitBezeichnungAlt = `Whg ${Date.now()}`;
    const unitBezeichnungNeu = `Whg-Edit ${Date.now()}`;
    await page.goto(`/wegs/${wegId}/einheiten/new`);
    await page.getByLabel(/Bezeichnung/).fill(unitBezeichnungAlt);
    await page.getByLabel("Zähler").fill("50");
    await page.getByLabel("Nenner").fill("1000");
    await page.getByRole("button", { name: /Speichern/ }).click();
    await expect(page).toHaveURL(new RegExp(`/wegs/${wegId}$`), { timeout: 15_000 });
    await expect(page.getByText(unitBezeichnungAlt)).toBeVisible();

    // 3. Click Bearbeiten next to the Wohneinheit
    await page.getByRole("link", { name: `${unitBezeichnungAlt} bearbeiten` }).click();
    await expect(page).toHaveURL(new RegExp(`/wegs/${wegId}/einheiten/[0-9a-f-]{36}/edit$`));

    // 4. Edit Wohneinheit
    await page.getByLabel(/Bezeichnung/).fill(unitBezeichnungNeu);
    await page.getByLabel("Zähler").fill("60");
    await page.getByRole("button", { name: /Speichern/ }).click();

    // 5. Expect redirect back and updated details visible
    await expect(page).toHaveURL(new RegExp(`/wegs/${wegId}$`), { timeout: 15_000 });
    await expect(page.getByText(unitBezeichnungNeu)).toBeVisible();
    await expect(page.getByText("MEA: 60/1000")).toBeVisible();
    await expect(page.getByText(unitBezeichnungAlt)).not.toBeVisible();

    // 6. Delete the Wohneinheit (has no owners yet)
    await page.getByRole("link", { name: `${unitBezeichnungNeu} bearbeiten` }).click();
    page.once("dialog", (dialog) => dialog.accept()); // Accept window.confirm
    await page.getByRole("button", { name: /unwiderruflich löschen/ }).click();

    // 7. Expect redirect back and unit deleted
    await expect(page).toHaveURL(new RegExp(`/wegs/${wegId}$`), { timeout: 15_000 });
    await expect(page.getByText(unitBezeichnungNeu)).not.toBeVisible();
  });

  test("cannot delete a Wohneinheit with active ownership", async ({ page }) => {
    // 1. Create a WEG
    const wegNameVal = wegName("Unit-Delete-Fail");
    const wegId = await createWegFixture(page, wegNameVal);

    // 2. Create a Wohneinheit
    const unitBezeichnung = `Whg ${Date.now()}`;
    await page.goto(`/wegs/${wegId}/einheiten/new`);
    await page.getByLabel(/Bezeichnung/).fill(unitBezeichnung);
    await page.getByLabel("Zähler").fill("75");
    await page.getByLabel("Nenner").fill("1000");
    await page.getByRole("button", { name: /Speichern/ }).click();
    await expect(page).toHaveURL(new RegExp(`/wegs/${wegId}$`), { timeout: 15_000 });

    // 3. Create an Owner for the Unit
    await page.getByRole("link", { name: `Eigentümer von ${unitBezeichnung} anzeigen` }).click();
    await expect(page).toHaveURL(/\/eigentuemerschaft$/);
    await page.getByRole("link", { name: /Eigentümer hinzufügen/ }).first().click();
    const ownerNachname = `Owner-${Date.now()}`;
    await page.getByLabel(/Vorname/).fill("Max");
    await page.getByLabel(/Nachname/).fill(ownerNachname);
    await page.getByRole("button", { name: /Eigentümer speichern/ }).click();
    await expect(page).toHaveURL(/\/eigentuemerschaft$/, { timeout: 15_000 });

    // 4. Try to delete the Unit
    await page.goto(`/wegs/${wegId}`);
    await page.getByRole("link", { name: `${unitBezeichnung} bearbeiten` }).click();
    page.once("dialog", (dialog) => dialog.accept()); // Accept window.confirm
    await page.getByRole("button", { name: /unwiderruflich löschen/ }).click();

    // 5. Expect foreign key error message to be visible and page not redirected
    await expect(page.getByText(/Die Wohneinheit kann nicht gelöscht werden, da ihr noch Eigentumsverhältnisse/)).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/wegs/${wegId}/einheiten/[0-9a-f-]{36}/edit$`));
  });
});
