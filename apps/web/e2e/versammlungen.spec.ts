import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  createMeetingFixture,
  createOwnershipFixture,
  createPersonFixture,
  createProtocolFixture,
  createResolutionFixture,
  createTopFixture,
  createUnitFixture,
  setMeetingStatus,
} from "./helpers/fixtures";
import { createWegFixture } from "./helpers/weg";

// Versammlungs-Happy-Path gegen Cloud Frankfurt. Läuft als geseedeter
// Tenant-Admin (auth.setup.ts persistierter Storage-State); RLS scoped
// alles auf diesen Tenant. Erstellte WEGs, Meetings, TOPs bleiben in
// der Cloud-DB stehen — gleiches Trade-off wie wegs.spec.ts.
//
// Serial-Modus weil jeder Test mehrere Routen neu hits (/wegs/new,
// /wegs/[id]/versammlungen/new, /versammlungen/[id]/tops/new, …) und
// Next 16 dev sie on-demand kompiliert; parallele Ausführung lässt den
// Dev-Server hängen bevor die ersten Server Actions zurückkehren.
test.describe.configure({ mode: "serial" });

const stamp = () => Date.now();

async function gotoDomReady(page: Page, path: string): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await page.goto(path, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

test.describe("versammlungen happy path", () => {
  test("creates a WEG, a Versammlung, and a TOP — TOP erscheint auf der Detail-Seite", async ({
    page,
  }) => {
    // 1. WEG anlegen — Fixture für diesen Test-Run.
    const wegLabel = `E2E Versammlung ${stamp()}`;
    await createWegFixture(page, wegLabel, {
      street: "Versammlungsweg",
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
      .getByRole("link", { name: /Ersten TOP anlegen|TOP anlegen/ })
      .first()
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

    // 10. Edit-Flow — TOP bearbeiten, neuer Titel landet auf Detail.
    await page.getByText(topTitel).click();
    await expect(page).toHaveURL(/\/tops\/[0-9a-f-]{36}$/);
    const editTopHref = await page
      .getByRole("link", { name: /TOP bearbeiten/ })
      .getAttribute("href");
    expect(editTopHref).toMatch(/\/tops\/[0-9a-f-]{36}\/edit$/);
    await page.goto(editTopHref!);
    await expect(page).toHaveURL(/\/tops\/[0-9a-f-]{36}\/edit$/);
    const topTitelEdited = `${topTitel} (überarbeitet)`;
    await page.getByLabel(/Titel/).fill(topTitelEdited);
    await page
      .getByRole("button", { name: /Änderungen speichern/ })
      .click();
    await expect(page).toHaveURL(/\/tops\/[0-9a-f-]{36}$/, { timeout: 15_000 });
    await expect(
      page.getByRole("heading", { level: 1, name: topTitelEdited }),
    ).toBeVisible();

    // 11. Delete-Flow — TOP löschen, redirect zur Meeting-Detail,
    //     Empty-State wieder sichtbar (war einziger TOP).
    await page.getByRole("button", { name: /TOP löschen/ }).click();
    await expect(page).toHaveURL(/\/versammlungen\/[0-9a-f-]{36}$/, {
      timeout: 15_000,
    });
    await expect(page.getByText(/Noch keine TOPs angelegt/)).toBeVisible();
    await expect(page.getByText(topTitelEdited)).not.toBeVisible();
  });

  test("Einladung versenden — Status entwurf → eingeladen wenn Frist OK", async ({
    page,
  }) => {
    // 1.–2. WEG + Versammlung mit Termin in 30 Tagen als Fixtures — § 24
    //    Abs. 4 WEG-Frist (21 Tage) sicher eingehalten. Testgegenstand ist
    //    der Einladungs-Versand, nicht das Anlage-Formular (versammlungen
    //    Happy-Path-Test deckt das ab).
    const wegId = await createWegFixture(page, `E2E Einladung ${stamp()}`, {
      street: "Einladungsweg",
    });
    const meetingId = await createMeetingFixture(page, wegId, {
      titel: `Einladungs-ETV ${stamp()}`,
      terminVon: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
    await page.goto(`/versammlungen/${meetingId}`);

    // 3. Vor Versand: Status "Entwurf" + Einladungs-Card sichtbar.
    await expect(page.locator("dl").getByText("Entwurf")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Einladung versenden/ }),
    ).toBeVisible();

    // 4. Einladung versenden.
    await page
      .getByRole("button", { name: /Einladung versenden/ })
      .click();

    // 5. Nach Versand: Status "Eingeladen", Einladungs-Card weg,
    //    Einladungsfrist-Indikator grün.
    await expect(page.locator("dl").getByText("Eingeladen")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByRole("button", { name: /Einladung versenden/ }),
    ).not.toBeVisible();
    await expect(
      page.locator("dl").getByText(/Einladungsfrist eingehalten/),
    ).toBeVisible();
  });

  test("Beschlussvorlage anlegen — Abstimmung zeigt Vorlage + Feststellungs-Gate", async ({
    page,
  }) => {
    // 1. WEG + Versammlung + TOP als Fixtures — Setup für den Beschluss-Pfad;
    //    die Anlage-Formulare selbst deckt der Happy-Path-Test ab.
    const wegId = await createWegFixture(page, `E2E Beschluss ${stamp()}`, {
      street: "Beschlussweg",
    });
    const meetingId = await createMeetingFixture(page, wegId, {
      titel: `Beschluss-ETV ${stamp()}`,
    });
    const topId = await createTopFixture(page, meetingId, {
      titel: `Beschluss-Test TOP ${stamp()}`,
    });
    await page.goto(`/versammlungen/${meetingId}/tops/${topId}`);
    await expect(page).toHaveURL(/\/tops\/[0-9a-f-]{36}$/, { timeout: 15_000 });

    // 2. Abstimmung — anfangs "Keine Beschlussvorlage".
    //    Button asChild Link — gleicher Workaround wie bei "Neue
    //    Versammlung anlegen".
    const abstimmungHref = await page
      .getByRole("link", { name: /Zur Abstimmung/ })
      .getAttribute("href");
    await page.goto(abstimmungHref!);
    await expect(page).toHaveURL(/\/abstimmung$/);
    await expect(
      page.getByText(/Noch keine Beschlussvorlage/),
    ).toBeVisible();

    // 3. Beschlussvorlage anlegen.
    await page
      .getByRole("link", { name: /Beschlussvorlage anlegen/ })
      .click();
    await expect(page).toHaveURL(/\/beschluss\/new$/);
    const beschlussText = `Test-Beschluss ${stamp()}: Verwaltervertrag wird um zwei Jahre verlängert.`;
    await page.getByLabel(/Beschlusstext/).fill(beschlussText);
    await page.getByLabel(/Mehrheitstyp/).selectOption("einfach");
    await page.getByLabel(/Stimmprinzip/).selectOption("kopf");
    await page.getByRole("button", { name: /Beschluss anlegen/ }).click();

    // 4. Redirect zur Abstimmung. Beschluss + Mehrheits-Label sichtbar.
    await expect(page).toHaveURL(/\/abstimmung$/, { timeout: 15_000 });
    await expect(page.getByText(beschlussText)).toBeVisible();
    await expect(page.getByText(/Einfache Mehrheit/)).toBeVisible();

    // 5. Feststellungs-Gate: ohne Stimme kein Button, sondern Hinweis-Text.
    await expect(
      page.getByText(/Feststellung möglich, sobald mindestens eine Stimme/),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Beschluss feststellen/ }),
    ).not.toBeVisible();
  });

  test("Voller Vote-Pfad: Einheit + Eigentümer + Vote + Feststellung → Beschluss-Sammlung-Eintrag", async ({
    page,
  }) => {
    // 1.–8. Vorbedingungen komplett über den REST-Seam: WEG, Einheit,
    //    Eigentümer (Person + Ownership), laufende Versammlung, TOP und
    //    Beschlussvorlage. Testgegenstand ist der Stimm- und
    //    Feststellungs-Pfad im UI; die Anlage-Formulare decken der
    //    Happy-Path-Test hier bzw. wegs.spec.ts/personen.spec.ts ab.
    const wegId = await createWegFixture(page, `E2E Vote ${stamp()}`, {
      street: "Voteweg",
    });
    const unitId = await createUnitFixture(page, wegId, {
      bezeichnung: `Whg ${stamp()}`,
    });
    const personId = await createPersonFixture(page, {
      vorname: "Max",
      nachname: `Tester ${stamp()}`,
    });
    await createOwnershipFixture(page, { wegId, unitId, personId });

    const meetingId = await createMeetingFixture(page, wegId, {
      titel: `Vote-ETV ${stamp()}`,
      terminVon: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
    await setMeetingStatus(page, meetingId, "laufend");

    const topId = await createTopFixture(page, meetingId, {
      titel: `Vote-TOP ${stamp()}`,
    });
    const beschlussText = `Vote-Test-Beschluss ${stamp()}: WP wird verabschiedet.`;
    await createResolutionFixture(page, {
      meetingId,
      agendaItemId: topId,
      text: beschlussText,
      mehrheitsTyp: "einfach",
      stimmprinzip: "kopf",
    });

    // Abstimmung über den gerenderten Link der TOP-Seite öffnen — der Href
    // bleibt die Quelle der Wahrheit für die Route.
    await page.goto(`/versammlungen/${meetingId}/tops/${topId}`);
    const abstimmungHref = await page
      .getByRole("link", { name: /Zur Abstimmung/ })
      .getAttribute("href");
    await page.goto(abstimmungHref!);
    await expect(page).toHaveURL(/\/abstimmung$/);

    // 9. Beschlussvorlage + Eigentümer sichtbar in Stimm-Liste.
    await expect(page.getByText(beschlussText)).toBeVisible();
    await expect(page.getByText("Max")).toBeVisible();
    await expect(page.getByText(/0 von 1 Stimmen abgegeben/)).toBeVisible();

    // 10. Ja-Stimme abgeben.
    await page.getByLabel("Ja").check();
    await page.getByRole("button", { name: "Speichern" }).click();

    // 11. Nach Stimme: Counter aktualisiert, Feststellungs-Button da.
    await expect(page.getByText(/1 von 1 Stimmen abgegeben/)).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByRole("button", { name: /Beschluss feststellen/ }),
    ).toBeVisible();

    // 12. Beschluss feststellen.
    await page
      .getByRole("button", { name: /Beschluss feststellen/ })
      .click();
    await expect(page.getByText(/Beschluss festgestellt am/)).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByRole("button", { name: /Beschluss feststellen/ }),
    ).not.toBeVisible();

    // 13. Beschluss-Sammlung-Seite öffnen — Eintrag muss vorhanden sein
    //     (§ 24 Abs. 7 WEG: automatischer Append durch
    //     appendToBeschlussSammlung-Helper bei Feststellung).
    await page.goto(`/wegs/${wegId}/beschluss-sammlung`);
    await expect(page.getByText(beschlussText)).toBeVisible({
      timeout: 15_000,
    });
  });

  // ---------------------------------------------------------------------------
  // Protokoll HITL tests
  // ---------------------------------------------------------------------------

  test("Protokoll Seite ist vor Ende gesperrt und nach Ende zugänglich", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    // 1.–2. WEG + Versammlung als Fixtures — Testgegenstand ist das
    //    serverseitige Protokoll-Gate, nicht die Anlage-Formulare.
    const wegId = await createWegFixture(page, `E2E Protokoll-Null ${stamp()}`, {
      street: "Protokollweg",
    });
    const meetingId = await createMeetingFixture(page, wegId, {
      titel: `Protokoll-ETV ${stamp()}`,
    });

    // 3. Direktaufruf vor Ende: Protokoll ist serverseitig gesperrt.
    await gotoDomReady(page, `/versammlungen/${meetingId}/protokoll`);
    await expect(page.getByText("Protokoll noch gesperrt")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Protokoll generieren/ }),
    ).not.toBeVisible();

    // 4. Nach beendetem Meeting ist der Review erreichbar.
    await setMeetingStatus(page, meetingId, "beendet");
    await gotoDomReady(page, `/versammlungen/${meetingId}`);
    const protokollHref = await page
      .getByRole("link", { name: /^Protokoll$/ })
      .getAttribute("href");
    expect(protokollHref).toMatch(
      new RegExp(`/versammlungen/${meetingId}/protokoll`),
    );
    await gotoDomReady(page, protokollHref!);
    await expect(page).toHaveURL(/\/protokoll$/);

    // 5. Kein Protokoll vorhanden → "Protokoll generieren"-Button sichtbar.
    //    (Klick wird NICHT ausgeführt — Agent läuft nicht im E2E-Kontext.)
    await expect(
      page.getByRole("button", { name: /Protokoll generieren/ }),
    ).toBeVisible({ timeout: 10_000 });

    // 6. "Kein Protokoll vorhanden"-Text als zusätzlicher Smoke-Check.
    await expect(
      page.getByText("Kein Protokoll vorhanden"),
    ).toBeVisible();
  });

  test("Protokoll ki_entwurf — Unterzeichnen-Button sichtbar", async ({
    page,
  }) => {
    // 1.–2. WEG + beendete Versammlung als Fixtures.
    const wegId = await createWegFixture(page, `E2E Protokoll-Entwurf ${stamp()}`, {
      street: "Entwurfweg",
    });
    const meetingId = await createMeetingFixture(page, wegId, {
      titel: `Entwurf-ETV ${stamp()}`,
    });
    await setMeetingStatus(page, meetingId, "beendet");

    // 3. Protokoll-Row mit status='ki_entwurf' als Fixture seeden — der
    //    Agent läuft nicht im E2E-Kontext, daher kein Click auf
    //    "Protokoll generieren".
    await createProtocolFixture(page, { meetingId });

    // 4. Protokoll-Seite direkt aufrufen.
    await page.goto(`/versammlungen/${meetingId}/protokoll`);
    await expect(page).toHaveURL(/\/protokoll$/, { timeout: 15_000 });

    // 5. ki_entwurf-Zustand: Entwurfs-Text ist lesbar (read-only <pre>).
    await expect(
      page.getByText(/Dieser Entwurf wurde vom KI-System generiert/),
    ).toBeVisible({ timeout: 10_000 });

    // 6. "Protokoll unterzeichnen"-Button sichtbar (kein Klick — erfordert
    //    Storage + PDF-Rendering).
    await expect(
      page.getByRole("button", { name: /Protokoll unterzeichnen/ }),
    ).toBeVisible();

    // 7. Status-Pill "KI-Entwurf freigegeben" sichtbar.
    await expect(page.getByText("KI-Entwurf freigegeben")).toBeVisible();

    // 8. "Protokoll"-Link auf der Meeting-Seite zeigt zur korrekten URL.
    await page.goto(`/versammlungen/${meetingId}`);
    const protokollHref = await page
      .getByRole("link", { name: /^Protokoll$/ })
      .getAttribute("href");
    expect(protokollHref).toMatch(
      new RegExp(`/versammlungen/${meetingId}/protokoll`),
    );
  });
});
