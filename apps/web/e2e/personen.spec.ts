import { test, expect } from "@playwright/test";
import { createPersonFixture, createUnitFixture } from "./helpers/fixtures";
import { createWegFixture } from "./helpers/weg";

// Personen-CRUD + Eigentümerschaft E2E gegen Cloud Frankfurt.
// Läuft als geseedeter Tenant-Admin (auth.setup.ts persistierter Storage-State).
//
// Serial-Modus: Multi-Routen-Flows (WEG → Personen → Einheit → Eigentümerschaft)
// auf Next 16 dev; parallele Ausführung lässt den Dev-Server hängen.
// Erstelle Rows akkumulieren in der Cloud-DB — akzeptabler Trade-off für
// den dedizierten E2E-Tenant (analog zu wegs.spec.ts / versammlungen.spec.ts).
test.describe.configure({ mode: "serial" });

const stamp = () => Date.now();

test.describe("personen CRUD", () => {
  test("Person anlegen — erscheint in der Personen-Liste der WEG", async ({
    page,
  }) => {
    // 1. WEG anlegen — Fixture für diesen Test.
    await createWegFixture(page, `E2E Person ${stamp()}`, {
      street: "Personenweg",
    });

    // 2. Neue Person anlegen — direkter Link auf der WEG-Detail-Seite.
    //    Der Link ist ein plain <Link> (kein Button asChild) — click navigiert sauber.
    const nachname = `Testmann-${stamp()}`;
    await page.getByRole("link", { name: /Person anlegen/ }).first().click();
    await expect(page).toHaveURL(/\/personen\/new$/);

    await page.getByLabel(/Vorname/).fill("Anna");
    await page.getByLabel(/Nachname/).fill(nachname);
    const email = `anna-${stamp()}@test.example`;
    await page.getByLabel(/E-Mail/).fill(email);
    await page.getByRole("button", { name: /Speichern/ }).click();

    // 3. Nach erfolgreichem Speichern: Redirect zurück zur WEG-Seite,
    //    Person erscheint in der Personen-Karte.
    await expect(page).toHaveURL(/\/wegs\/[0-9a-f-]{36}$/, {
      timeout: 15_000,
    });
    const personen = page.locator("#personen");
    await expect(personen.getByText(nachname)).toBeVisible({
      timeout: 30_000,
    });
    await expect(personen.getByText(email)).toBeVisible();
  });

  test("Person bearbeiten — Änderungen sind nach Redirect sichtbar", async ({
    page,
  }) => {
    // 1.–2. WEG + Person als Fixtures anlegen — das Anlage-Formular deckt
    //    der erste Test ab; Testgegenstand hier ist der Edit-Flow.
    //    `person` ist tenant-scoped (WEG-Seite listet ohne WEG-Filter),
    //    die REST-Fixture erscheint also nach dem Reload in der Karte.
    const wegLabel = `E2E Person-Edit ${stamp()}`;
    const wegId = await createWegFixture(page, wegLabel, {
      street: "Editweg",
    });
    const nachnameAlt = `Altmann-${stamp()}`;
    await createPersonFixture(page, {
      vorname: "Bernd",
      nachname: nachnameAlt,
    });
    await page.goto(`/wegs/${wegId}`);

    // 3. "Bearbeiten"-Link für die angelegte Person klicken.
    //    aria-label="<Vorname> <Nachname> bearbeiten" — genaues Match nötig.
    const editLink = page.getByRole("link", {
      name: new RegExp(`Bernd ${nachnameAlt} bearbeiten`),
    });
    const editHref = await editLink.getAttribute("href");
    expect(editHref).toMatch(/\/personen\/[0-9a-f-]{36}\/edit$/);
    await page.goto(editHref!);
    await expect(page).toHaveURL(/\/personen\/[0-9a-f-]{36}\/edit$/);

    // 4. Nachnamen ändern und speichern.
    const nachnameNeu = `Neumann-${stamp()}`;
    const nachnameInput = page.getByLabel(/Nachname/);
    await nachnameInput.fill(nachnameNeu);
    await page.getByRole("button", { name: /Speichern/ }).click();

    // 5. Redirect zur WEG — neuer Nachname sichtbar, alter nicht mehr.
    await expect(page).toHaveURL(/\/wegs\/[0-9a-f-]{36}$/, {
      timeout: 15_000,
    });
    const personen = page.locator("#personen");
    await expect(personen.getByText(nachnameNeu)).toBeVisible({
      timeout: 30_000,
    });
    await expect(personen.getByText(nachnameAlt)).not.toBeVisible();
  });

  test("Person anlegen — Validierungsfehler bei leerem Vornamen", async ({
    page,
  }) => {
    // 1. WEG anlegen.
    await createWegFixture(page, `E2E Person-Validation ${stamp()}`, {
      street: "Validierungsweg",
    });

    // 2. Neue Person ohne Vorname — Validierungsfehler erwartet.
    await page.getByRole("link", { name: /Person anlegen/ }).first().click();
    await expect(page).toHaveURL(/\/personen\/new$/);

    await page.getByLabel(/Nachname/).fill("Schmidt");
    // Vorname bleibt leer.
    await page.getByRole("button", { name: /Speichern/ }).click();

    // 3. Fehler-Alert sichtbar, URL unverändert.
    await expect(page.locator("#vorname-error")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page).toHaveURL(/\/personen\/new$/);
  });
});

test.describe("eigentümerschaft", () => {
  test("Eigentümer anlegen — erscheint als aktiver Eigentümer der Einheit", async ({
    page,
  }) => {
    // Bereits durch den Vote-Pfad in versammlungen.spec.ts abgedeckt (Steps 1–4).
    // Dieser Test verifiziert den Flow isoliert ohne Versammlung.

    // 1.–2. WEG + Einheit als Fixtures — das Einheiten-Formular deckt
    //    wegs.spec.ts ab; Testgegenstand hier ist die Eigentümer-Anlage.
    const wegId = await createWegFixture(page, `E2E Eigentümer ${stamp()}`, {
      street: "Eigentümerweg",
    });
    const unitId = await createUnitFixture(page, wegId, {
      bezeichnung: `Whg. ${stamp()}`,
      meaZaehler: 250,
    });

    // 3. Eigentümerschaft öffnen.
    await page.goto(`/wegs/${wegId}/einheiten/${unitId}/eigentuemerschaft`);
    await expect(page).toHaveURL(/\/eigentuemerschaft$/);

    // 4. "Kein aktiver Eigentümer" — Empty-State sichtbar.
    await expect(
      page.getByText(/Kein aktiver Eigentümer erfasst/),
    ).toBeVisible();

    // 5. Neuen Eigentümer über Inline-Anlage hinzufügen.
    await page.getByRole("link", { name: /Eigentümer hinzufügen/ }).first().click();
    await expect(page).toHaveURL(/\/eigentuemerschaft\/new$/);

    const nachname = `Eigentuemer-${stamp()}`;
    await page.getByLabel(/Vorname/).fill("Clara");
    await page.getByLabel(/Nachname/).fill(nachname);
    // Von-Datum defaultet auf heute.
    await page.getByRole("button", { name: /Eigentümer speichern/ }).click();

    // 6. Nach Redirect: Eigentümer in der aktiven Liste sichtbar.
    await expect(page).toHaveURL(/\/eigentuemerschaft$/, { timeout: 15_000 });
    await expect(page.getByText("Clara")).toBeVisible();
    await expect(page.getByText(nachname)).toBeVisible();
    await expect(page.getByText(/aktiv/).first()).toBeVisible();
    // Empty-State weg.
    await expect(
      page.getByText(/Kein aktiver Eigentümer erfasst/),
    ).not.toBeVisible();
  });

  test("Co-Eigentümer via Checkbox — beide Namen erscheinen in der aktiven Eigentümerliste", async ({
    page,
  }) => {
    // 1.–3. WEG, Co-Person und Einheit als Fixtures — Testgegenstand ist
    //    die Co-Eigentümer-Auswahl per Checkbox, nicht die Anlage-Formulare.
    //    `person` ist tenant-scoped, die Fixture-Person erscheint also in
    //    der Checkbox-Liste des Eigentümerschaft-Formulars.
    const wegId = await createWegFixture(page, `E2E Co-Eigentümer ${stamp()}`, {
      street: "Mitbesitzweg",
    });
    const co1 = `CoOwner1-${stamp()}`;
    await createPersonFixture(page, { vorname: "Dieter", nachname: co1 });
    const unitId = await createUnitFixture(page, wegId, {
      bezeichnung: `Co-Whg. ${stamp()}`,
      meaZaehler: 300,
    });

    // 4. Eigentümerschaft öffnen.
    await page.goto(`/wegs/${wegId}/einheiten/${unitId}/eigentuemerschaft`);
    await expect(page).toHaveURL(/\/eigentuemerschaft$/);

    // 5. Neuen Eigentümerschaft-Eintrag anlegen: bestehende Person per Checkbox
    //    + neue Person inline. Beide bilden zusammen eine Ownership.
    await page.getByRole("link", { name: /Eigentümer hinzufügen/ }).first().click();
    await expect(page).toHaveURL(/\/eigentuemerschaft\/new$/);

    // Co-Owner-Checkbox anklicken (Dieter co1).
    await page
      .getByLabel(new RegExp(`Dieter ${co1}`))
      .check();

    // Neue Person inline anlegen (Haupteigentümer).
    const co2 = `CoOwner2-${stamp()}`;
    await page.getByLabel(/Vorname/).fill("Eva");
    await page.getByLabel(/Nachname/).fill(co2);

    await page.getByRole("button", { name: /Eigentümer speichern/ }).click();

    // 6. Nach Redirect: Beide Namen als komma-getrennte Liste in der aktiven Zeile.
    await expect(page).toHaveURL(/\/eigentuemerschaft$/, { timeout: 15_000 });
    // Die Seite rendert alle Namen als komma-separierte Liste in einem einzigen <p>.
    await expect(
      page.getByText(new RegExp(`Dieter ${co1}`)),
    ).toBeVisible();
    await expect(page.getByText(new RegExp(`Eva ${co2}`))).toBeVisible();
    await expect(page.getByText(/aktiv/).first()).toBeVisible();
  });
});
