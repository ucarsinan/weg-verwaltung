import { test, expect } from "@playwright/test";

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

    // 10. Edit-Flow — TOP bearbeiten, neuer Titel landet auf Detail.
    await page.getByText(topTitel).click();
    await expect(page).toHaveURL(/\/tops\/[0-9a-f-]{36}$/);
    await page.getByRole("link", { name: /TOP bearbeiten/ }).click();
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
    // 1. WEG anlegen.
    await page.goto("/wegs/new");
    await page.getByLabel(/Name der WEG/).fill(`E2E Einladung ${stamp()}`);
    await page.getByLabel("Adresse").fill("Einladungsweg 1, 12345 Testheim");
    await page.getByRole("button", { name: /Speichern/ }).click();
    await expect(page).toHaveURL(/\/wegs\/[0-9a-f-]{36}$/, { timeout: 15_000 });

    // 2. Versammlungs-Anlage mit Termin in 30 Tagen — § 24 Abs. 4 WEG-Frist
    //    (21 Tage) sicher eingehalten.
    const newMeetingHref = await page
      .getByRole("link", { name: /Neue Versammlung anlegen/ })
      .getAttribute("href");
    await page.goto(newMeetingHref!);

    const terminVon = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 16);
    const meetingTitel = `Einladungs-ETV ${stamp()}`;
    await page.getByLabel(/Titel/).fill(meetingTitel);
    await page.getByLabel(/Termin von/).fill(terminVon);
    await page.getByRole("button", { name: /Versammlung anlegen/ }).click();

    await expect(page).toHaveURL(/\/versammlungen\/[0-9a-f-]{36}$/, {
      timeout: 15_000,
    });

    // 3. Vor Versand: Status "Entwurf" + Einladungs-Card sichtbar.
    await expect(page.getByText("Entwurf")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Einladung versenden/ }),
    ).toBeVisible();

    // 4. Einladung versenden.
    await page
      .getByRole("button", { name: /Einladung versenden/ })
      .click();

    // 5. Nach Versand: Status "Eingeladen", Einladungs-Card weg,
    //    Einladungsfrist-Indikator grün.
    await expect(page.getByText("Eingeladen")).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("button", { name: /Einladung versenden/ }),
    ).not.toBeVisible();
    await expect(
      page.getByText(/Einladungsfrist eingehalten/),
    ).toBeVisible();
  });

  test("Beschlussvorlage anlegen — Abstimmung zeigt Vorlage + Feststellungs-Gate", async ({
    page,
  }) => {
    // 1. WEG + Versammlung + TOP — Setup für den Beschluss-Pfad.
    await page.goto("/wegs/new");
    await page.getByLabel(/Name der WEG/).fill(`E2E Beschluss ${stamp()}`);
    await page.getByLabel("Adresse").fill("Beschlussweg 1, 12345 Testheim");
    await page.getByRole("button", { name: /Speichern/ }).click();
    await expect(page).toHaveURL(/\/wegs\/[0-9a-f-]{36}$/, { timeout: 15_000 });

    const newMeetingHref = await page
      .getByRole("link", { name: /Neue Versammlung anlegen/ })
      .getAttribute("href");
    await page.goto(newMeetingHref!);
    await page.getByLabel(/Titel/).fill(`Beschluss-ETV ${stamp()}`);
    await page.getByRole("button", { name: /Versammlung anlegen/ }).click();
    await expect(page).toHaveURL(/\/versammlungen\/[0-9a-f-]{36}$/, {
      timeout: 15_000,
    });

    await page.getByRole("link", { name: /Jetzt ersten TOP anlegen/ }).click();
    const topTitel = `Beschluss-Test TOP ${stamp()}`;
    await page.getByLabel(/Titel/).fill(topTitel);
    await page.getByRole("button", { name: /TOP anlegen/ }).click();
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
    // 1. WEG anlegen.
    await page.goto("/wegs/new");
    await page.getByLabel(/Name der WEG/).fill(`E2E Vote ${stamp()}`);
    await page.getByLabel("Adresse").fill("Voteweg 1, 12345 Testheim");
    await page.getByRole("button", { name: /Speichern/ }).click();
    await expect(page).toHaveURL(/\/wegs\/[0-9a-f-]{36}$/, { timeout: 15_000 });
    const wegId = page.url().match(/\/wegs\/([0-9a-f-]{36})/)![1];

    // 2. Erste Einheit anlegen — Direkt-Navigation für stabile Erst-Compile-
    //    Zeiten auf Next 16 dev statt Link-Click.
    await page.goto(`/wegs/${wegId}/einheiten/new`);
    await expect(page).toHaveURL(/\/einheiten\/new$/);
    await page.getByLabel(/Bezeichnung/).fill(`Whg ${stamp()}`);
    await page.getByLabel("Zähler").fill("100");
    // Nenner defaultet auf 1000 — nicht überschreiben.
    await page.getByRole("button", { name: /Speichern/ }).click();
    await expect(page).toHaveURL(/\/wegs\/[0-9a-f-]{36}$/, { timeout: 15_000 });

    // 3. Eigentümerschaft öffnen über den frisch erstellten Einheit-Listeneintrag.
    //    Der Link hat aria-label="Eigentümer von <Bezeichnung> anzeigen", das
    //    den accessible name überschreibt — entsprechend matchen.
    await page
      .getByRole("link", { name: /Eigentümer von .* anzeigen/ })
      .click();
    await expect(page).toHaveURL(/\/eigentuemerschaft$/);

    // 4. Eigentümer anlegen.
    await page
      .getByRole("link", { name: /Eigentümer hinzufügen/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/eigentuemerschaft\/new$/);
    await page.getByLabel(/Vorname/).fill("Max");
    await page.getByLabel(/Nachname/).fill(`Tester ${stamp()}`);
    // Einzug-Datum defaultet auf heute.
    await page
      .getByRole("button", { name: /Eigentümer speichern/ })
      .click();
    await expect(page).toHaveURL(/\/eigentuemerschaft$/, { timeout: 15_000 });

    // 5. Versammlung anlegen.
    await page.goto(`/wegs/${wegId}/versammlungen/new`);
    const meetingTitel = `Vote-ETV ${stamp()}`;
    await page.getByLabel(/Titel/).fill(meetingTitel);
    await page.getByRole("button", { name: /Versammlung anlegen/ }).click();
    await expect(page).toHaveURL(/\/versammlungen\/[0-9a-f-]{36}$/, {
      timeout: 15_000,
    });

    // 6. TOP anlegen.
    await page
      .getByRole("link", { name: /Jetzt ersten TOP anlegen/ })
      .click();
    await page.getByLabel(/Titel/).fill(`Vote-TOP ${stamp()}`);
    await page.getByRole("button", { name: /TOP anlegen/ }).click();
    await expect(page).toHaveURL(/\/tops\/[0-9a-f-]{36}$/, { timeout: 15_000 });

    // 7. Abstimmung öffnen (Button asChild Link).
    const abstimmungHref = await page
      .getByRole("link", { name: /Zur Abstimmung/ })
      .getAttribute("href");
    await page.goto(abstimmungHref!);
    await expect(page).toHaveURL(/\/abstimmung$/);

    // 8. Beschlussvorlage anlegen.
    await page
      .getByRole("link", { name: /Beschlussvorlage anlegen/ })
      .click();
    const beschlussText = `Vote-Test-Beschluss ${stamp()}: WP wird verabschiedet.`;
    await page.getByLabel(/Beschlusstext/).fill(beschlussText);
    await page.getByLabel(/Mehrheitstyp/).selectOption("einfach");
    await page.getByLabel(/Stimmprinzip/).selectOption("kopf");
    await page.getByRole("button", { name: /Beschluss anlegen/ }).click();
    await expect(page).toHaveURL(/\/abstimmung$/, { timeout: 15_000 });

    // 9. Eigentümer sichtbar in Stimm-Liste.
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

  test("Protokoll Seite zugänglich — null-Status zeigt Generieren-Button", async ({
    page,
  }) => {
    // 1. WEG anlegen.
    await page.goto("/wegs/new");
    await page.getByLabel(/Name der WEG/).fill(`E2E Protokoll-Null ${stamp()}`);
    await page.getByLabel("Adresse").fill("Protokollweg 1, 12345 Testheim");
    await page.getByRole("button", { name: /Speichern/ }).click();
    await expect(page).toHaveURL(/\/wegs\/[0-9a-f-]{36}$/, {
      timeout: 15_000,
    });

    // 2. Versammlung anlegen.
    const newMeetingHref = await page
      .getByRole("link", { name: /Neue Versammlung anlegen/ })
      .getAttribute("href");
    await page.goto(newMeetingHref!);
    await page.getByLabel(/Titel/).fill(`Protokoll-ETV ${stamp()}`);
    await page.getByRole("button", { name: /Versammlung anlegen/ }).click();
    await expect(page).toHaveURL(/\/versammlungen\/[0-9a-f-]{36}$/, {
      timeout: 15_000,
    });
    const meetingId = page.url().match(/versammlungen\/([0-9a-f-]{36})/)?.[1];
    expect(meetingId).toBeTruthy();

    // 3. "Protokoll"-Link auf der Meeting-Seite — Button asChild/Link-Pattern,
    //    href abgreifen und direkt navigieren.
    const protokollHref = await page
      .getByRole("link", { name: /^Protokoll$/ })
      .getAttribute("href");
    expect(protokollHref).toMatch(
      new RegExp(`/versammlungen/${meetingId}/protokoll`),
    );
    await page.goto(protokollHref!);
    await expect(page).toHaveURL(/\/protokoll$/);

    // 4. Kein Protokoll vorhanden → "Protokoll generieren"-Button sichtbar.
    //    (Klick wird NICHT ausgeführt — Agent läuft nicht im E2E-Kontext.)
    await expect(
      page.getByRole("button", { name: /Protokoll generieren/ }),
    ).toBeVisible({ timeout: 10_000 });

    // 5. "Kein Protokoll vorhanden"-Heading als zusätzlicher Smoke-Check.
    await expect(
      page.getByRole("heading", { name: /Kein Protokoll vorhanden/ }),
    ).toBeVisible();
  });

  test("Protokoll ki_entwurf — Unterzeichnen-Button sichtbar", async ({
    page,
  }) => {
    // 1. WEG anlegen.
    await page.goto("/wegs/new");
    await page
      .getByLabel(/Name der WEG/)
      .fill(`E2E Protokoll-Entwurf ${stamp()}`);
    await page.getByLabel("Adresse").fill("Entwurfweg 1, 12345 Testheim");
    await page.getByRole("button", { name: /Speichern/ }).click();
    await expect(page).toHaveURL(/\/wegs\/[0-9a-f-]{36}$/, {
      timeout: 15_000,
    });

    // 2. Versammlung anlegen.
    const newMeetingHref = await page
      .getByRole("link", { name: /Neue Versammlung anlegen/ })
      .getAttribute("href");
    await page.goto(newMeetingHref!);
    await page.getByLabel(/Titel/).fill(`Entwurf-ETV ${stamp()}`);
    await page.getByRole("button", { name: /Versammlung anlegen/ }).click();
    await expect(page).toHaveURL(/\/versammlungen\/[0-9a-f-]{36}$/, {
      timeout: 15_000,
    });
    const meetingId = page.url().match(/versammlungen\/([0-9a-f-]{36})/)?.[1];
    expect(meetingId).toBeTruthy();

    // 3. Protokoll-Row mit status='ki_entwurf' direkt via Supabase REST API
    //    seeden — Agent läuft nicht im E2E-Kontext, daher kein Click auf
    //    "Protokoll generieren". Supabase-Session-Cookie enthält das JWT.
    const cookies = await page.context().cookies();
    const sbCookie = cookies.find(
      (c) =>
        c.name.startsWith("sb-") && c.name.endsWith("-auth-token"),
    );
    expect(sbCookie).toBeTruthy();

    // Cookie-Wert ist URL-encoded JSON: [access_token, refresh_token] oder {access_token, ...}
    const tokenData = JSON.parse(decodeURIComponent(sbCookie!.value));
    const accessToken: string = Array.isArray(tokenData)
      ? (tokenData[0] as string)
      : (tokenData as { access_token: string }).access_token;
    expect(accessToken).toBeTruthy();

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    expect(supabaseUrl).toBeTruthy();
    expect(supabaseKey).toBeTruthy();

    const insertRes = await page.request.post(
      `${supabaseUrl}/rest/v1/protocol`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        data: {
          meeting_id: meetingId,
          status: "ki_entwurf",
          text: "# Test Protokoll\n\n## Entwurf\n\nDieser Entwurf wurde vom KI-System generiert.",
          generierungs_quelle: "ki",
          // tenant_id wird via RLS aus dem JWT gesetzt — nicht mitsenden.
        },
      },
    );
    expect(insertRes.ok()).toBeTruthy();

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
