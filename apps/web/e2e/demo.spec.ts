import { test, expect } from "@playwright/test";
import { fillWegAddress } from "./helpers/weg";
import type { Page } from "@playwright/test";

// Kern-Demo-Workflow für die WEG-Verwaltung (Screencast & Dokumentation).
// Läuft als geseedeter Tenant-Admin.
test.describe.configure({ mode: "serial" });

const stamp = () => Date.now().toString().slice(-4);

async function updateMeetingStatus(
  page: Page,
  meetingId: string,
  status: "laufend" | "beendet",
): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  expect(supabaseUrl).toBeTruthy();
  expect(supabaseKey).toBeTruthy();

  const cookies = await page.context().cookies();
  const sbCookie = cookies.find(
    (c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token"),
  );
  expect(sbCookie).toBeTruthy();

  let cookieValue = decodeURIComponent(sbCookie!.value);
  if (cookieValue.startsWith("base64-")) {
    cookieValue = Buffer.from(cookieValue.slice(7), "base64").toString("utf-8");
  }

  const tokenData = JSON.parse(cookieValue);
  const accessToken: string = Array.isArray(tokenData)
    ? (tokenData[0] as string)
    : (tokenData as { access_token: string }).access_token;
  expect(accessToken).toBeTruthy();

  const updateRes = await page.request.patch(
    `${supabaseUrl}/rest/v1/meeting?id=eq.${meetingId}`,
    {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      data: { status },
    },
  );
  expect(updateRes.ok()).toBeTruthy();
}

test("Demonstration des WEG-Verwaltung Kernworkflows", async ({ page }) => {
  test.setTimeout(120_000);

  const suffix = stamp();
  const delayTime = Number(process.env.E2E_DEMO_DELAY_MS ?? "0");

  // 1. Dashboard öffnen und Umschauen
  console.log("→ Schritt 1: Dashboard öffnen...");
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);
  await page.waitForTimeout(delayTime);

  // 2. Neue WEG anlegen über das Formular
  console.log("→ Schritt 2: WEG erstellen...");
  await page.goto("/wegs/new");
  await page.getByLabel(/Name der WEG/).fill(`WEG Lindenhof ${suffix}`);
  await page.waitForTimeout(500);
  await fillWegAddress(page, { street: "Kaiserstraße 12", city: "Frankfurt am Main" });
  await page.waitForTimeout(delayTime);
  await page.getByRole("button", { name: /Speichern/ }).click();

  // Redirect auf die WEG-Detailseite erwarten
  await expect(page).toHaveURL(/\/wegs\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  const wegUrl = page.url();
  const wegId = wegUrl.match(/\/wegs\/([0-9a-f-]{36})/)![1];
  console.log(`✓ WEG angelegt mit ID: ${wegId}`);
  await page.waitForTimeout(delayTime);

  // 3. Eine neue Wohneinheit (Unit) anlegen
  console.log("→ Schritt 3: Wohneinheit anlegen...");
  await page.goto(`/wegs/${wegId}/einheiten/new`);
  await expect(page).toHaveURL(/\/einheiten\/new$/);
  await page.getByLabel(/Bezeichnung/).fill(`Wohnung 01 (1. OG)`);
  await page.waitForTimeout(500);
  await page.getByLabel("Zähler").fill("120");
  await page.waitForTimeout(500);
  await page.getByLabel("Nenner").fill("1000");
  await page.waitForTimeout(delayTime);
  await page.getByRole("button", { name: /Speichern/ }).click();
  await expect(page).toHaveURL(new RegExp(`/wegs/${wegId}$`), { timeout: 15_000 });
  await page.waitForTimeout(delayTime);

  // 4. Eigentümer hinzufügen (Person + Ownership)
  console.log("→ Schritt 4: Eigentümerschaft hinzufügen...");
  await page
    .getByRole("link", { name: /Eigentümer von Wohnung 01 \(1\. OG\) anzeigen/i })
    .first()
    .click();
  await expect(page).toHaveURL(/\/eigentuemerschaft$/);
  await page.waitForTimeout(delayTime);

  await page
    .getByRole("link", { name: /Eigentümer hinzufügen/i })
    .first()
    .click();
  await expect(page).toHaveURL(/\/eigentuemerschaft\/new$/);
  await page.waitForTimeout(500);

  // Neue Person anlegen (Inline im Formular)
  await page.getByLabel(/Vorname/).fill("Michael");
  await page.waitForTimeout(500);
  await page.getByLabel(/Nachname/).fill(`Schmidt`);
  await page.waitForTimeout(500);
  await page.getByLabel(/E-Mail/).fill(`schmidt-${suffix}@test.de`);
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: /Eigentümer speichern/ }).click();

  await expect(page).toHaveURL(/\/eigentuemerschaft$/, { timeout: 15_000 });
  await page.waitForTimeout(delayTime);

  // Zurück zur WEG-Detailseite navigieren
  await page.goto(`/wegs/${wegId}`);
  await page.waitForTimeout(delayTime);

  // 5. Eigentümerversammlung (Meeting) anlegen
  console.log("→ Schritt 5: Eigentümerversammlung anlegen...");
  await page.goto(`/wegs/${wegId}/versammlungen/new`);
  await expect(page).toHaveURL(/\/versammlungen\/new$/);

  const meetingTitel = `Ordentliche Eigentümerversammlung 2026`;
  await page.getByLabel(/Titel/).fill(meetingTitel);
  await page.waitForTimeout(500);

  // Termin in 30 Tagen setzen (§ 24 Abs. 4 WEG-Frist konform)
  const terminVon = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16);
  await page.getByLabel(/Termin von/).fill(terminVon);
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: /Versammlung anlegen/ }).click();

  await expect(page).toHaveURL(/\/versammlungen\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  const meetingUrl = page.url();
  const meetingId = meetingUrl.match(/\/versammlungen\/([0-9a-f-]{36})/)![1];
  console.log(`✓ Versammlung angelegt mit ID: ${meetingId}`);
  await page.waitForTimeout(delayTime);

  // 6. Einen Tagesordnungspunkt (TOP) anlegen
  console.log("→ Schritt 6: Tagesordnungspunkt (TOP) anlegen...");
  await page.getByRole("link", { name: /TOP anlegen/ }).first().click();
  await expect(page).toHaveURL(/\/tops\/new$/);
  await page.waitForTimeout(500);

  await page.getByLabel(/Titel/).fill(`TOP 1: Sanierung des Flurfensters`);
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: /TOP anlegen/ }).click();

  await expect(page).toHaveURL(/\/tops\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  await page.waitForTimeout(delayTime);

  // Versammlungsstatus über API auf "laufend" schalten
  console.log("→ Versammlung wird gestartet...");
  await updateMeetingStatus(page, meetingId, "laufend");
  await page.goto(meetingUrl);
  await page.waitForTimeout(delayTime);

  // Zum TOP navigieren und die Abstimmung öffnen
  await page.getByText(`TOP 1: Sanierung des Flurfensters`).click();
  await expect(page).toHaveURL(/\/tops\/[0-9a-f-]{36}$/);
  await page.waitForTimeout(delayTime);

  await page.getByRole("link", { name: /Zur Abstimmung/ }).click();
  await expect(page).toHaveURL(/\/abstimmung$/);
  await page.waitForTimeout(delayTime);

  // 7. Beschlussvorlage anlegen
  console.log("→ Schritt 7: Beschlussvorlage anlegen...");
  await page.getByRole("link", { name: /Beschlussvorlage anlegen/ }).click();
  await page.waitForTimeout(500);

  const beschlussText = `Beschluss ${suffix}: Das Flurfenster wird für 1.500 € saniert.`;
  await page.getByLabel(/Beschlusstext/).fill(beschlussText);
  await page.waitForTimeout(500);
  await page.getByLabel(/Mehrheitstyp/).selectOption("einfach");
  await page.waitForTimeout(500);
  await page.getByLabel(/Stimmprinzip/).selectOption("kopf");
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: /Beschluss anlegen/ }).click();

  await expect(page).toHaveURL(/\/abstimmung$/, { timeout: 15_000 });
  await page.waitForTimeout(delayTime);

  // 8. Ja-Stimme abgeben
  console.log("→ Schritt 8: Stimme abgeben...");
  await page.getByLabel("Ja").check();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Speichern" }).click();
  await page.waitForTimeout(delayTime);

  // Counter aktualisiert
  await expect(page.getByText(/1 von 1 Stimmen abgegeben/)).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500);

  // 9. Beschluss feststellen
  console.log("→ Schritt 9: Beschluss feststellen...");
  await page.getByRole("button", { name: /Beschluss feststellen/ }).click();
  await expect(page.getByText(/Beschluss festgestellt am/)).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(delayTime);

  // 10. Beschluss-Sammlung öffnen und verifizieren
  console.log("→ Schritt 10: In der Beschluss-Sammlung verifizieren...");
  await page.goto(`/wegs/${wegId}/beschluss-sammlung`);
  await expect(page.getByText(beschlussText)).toBeVisible({ timeout: 15_000 });

  // Abschluss-Pause für das Video
  await page.waitForTimeout(3000);
  console.log("✓ Kern-Demo-Workflow erfolgreich beendet.");
});
