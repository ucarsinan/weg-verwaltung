import { test, expect } from "@playwright/test";

// Versammlungs-Happy-Path gegen Cloud Frankfurt. Läuft als geseedeter
// Tenant-Admin (auth.setup.ts persistierter Storage-State); RLS scoped
// alles auf diesen Tenant. Erstellte WEGs, Meetings, TOPs bleiben in
// der Cloud-DB stehen — gleiches Trade-off wie wegs.spec.ts.

const stamp = () => Date.now();

test.describe("versammlungen happy path", () => {
  test("creates a WEG, a Versammlung, and a TOP — TOP erscheint auf der Detail-Seite", async ({
    page,
  }) => {
    // 1. WEG anlegen — Fixture für diesen Test-Run.
    const wegLabel = `E2E Versammlung ${stamp()}`;
    await page.goto("/wegs/new");
    await page.getByLabel(/Name der WEG/).fill(wegLabel);
    await page.getByLabel("Adresse").fill("Versammlungsweg 1, 12345 Testheim");
    await page.getByRole("button", { name: /Speichern/ }).click();
    await expect(page).toHaveURL(/\/wegs\/[0-9a-f-]{36}$/, {
      timeout: 15_000,
    });

    // 2. Auf der WEG-Detail-Seite die Versammlungs-Anlage starten.
    //    Die "Neue Versammlung anlegen"-CTA ist als <Button asChild><Link>
    //    realisiert; Playwright-Clicks auf dieses Radix-Slot-Pattern
    //    navigieren auf Next 16 nicht zuverlässig. Wir greifen den href
    //    direkt ab — der gerenderte Href ist die Quelle der Wahrheit,
    //    Click-Handler-Coverage ist nicht Ziel dieses Tests.
    const newMeetingHref = await page
      .getByRole("link", { name: /Neue Versammlung anlegen/ })
      .getAttribute("href");
    expect(newMeetingHref).toMatch(/\/wegs\/[0-9a-f-]{36}\/versammlungen\/new$/);
    await page.goto(newMeetingHref!);
    await expect(page).toHaveURL(/\/versammlungen\/new$/);

    // 3. Versammlung anlegen (Pflichtfelder Titel + Modus default praesenz).
    const meetingTitel = `Eigentümerversammlung ${stamp()}`;
    await page.getByLabel(/Titel/).fill(meetingTitel);
    await page
      .getByRole("button", { name: /Versammlung anlegen/ })
      .click();

    // 4. Redirect auf die Meeting-Detail-Seite.
    await expect(page).toHaveURL(/\/versammlungen\/[0-9a-f-]{36}$/, {
      timeout: 15_000,
    });
    await expect(
      page.getByRole("heading", { level: 1, name: meetingTitel }),
    ).toBeVisible();

    // 5. Vor TOP-Anlage: Empty-State sichtbar.
    await expect(page.getByText(/Noch keine TOPs angelegt/)).toBeVisible();

    // 6. TOP-Anlage starten — Empty-State-Link (plain <Link>, kein aria-label,
    //    kein Button-Wrapper → click navigiert sauber).
    await page
      .getByRole("link", { name: /Jetzt ersten TOP anlegen/ })
      .click();
    await expect(page).toHaveURL(/\/tops\/new$/);

    // 7. TOP anlegen.
    const topTitel = `Verwaltervertrag verlängern ${stamp()}`;
    await page.getByLabel(/Titel/).fill(topTitel);
    await page.getByRole("button", { name: /TOP anlegen/ }).click();

    // 8. Redirect auf die TOP-Detail-Seite.
    await expect(page).toHaveURL(/\/tops\/[0-9a-f-]{36}$/, {
      timeout: 15_000,
    });

    // 9. Zurück zur Meeting-Detail-Seite — der TOP MUSS jetzt erscheinen.
    //    Aktuell rendert die Seite hardcoded "Noch keine TOPs angelegt";
    //    dieser Assert ist der TDD-Red, den Task 2 grün dreht.
    const meetingUrl = page.url().replace(/\/tops\/[0-9a-f-]{36}$/, "");
    await page.goto(meetingUrl);

    await expect(page.getByText(topTitel)).toBeVisible();
    await expect(
      page.getByText(/Noch keine TOPs angelegt/),
    ).not.toBeVisible();
  });
});
