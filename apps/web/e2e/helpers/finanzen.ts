import { expect, type Page } from "@playwright/test";
import { attachBeschlussFixture } from "./fixtures";

/**
 * Aktiviert einen Wirtschaftsplan ueber die UI (`entwurf` -> `aktiv`).
 *
 * Sollstellungen entstehen laut docs/07-finance-lifecycle.md ausschliesslich in
 * `activate_wirtschaftsplan` — ein gespeicherter Plan ist `entwurf` und hat
 * bewusst keine. Jeder Test, der Sollstellungen erwartet, muss den Plan also
 * erst aktivieren, sonst prueft er gegen eine leere Menge und wird gruen, ohne
 * etwas zu belegen.
 *
 * Seit 0074 verlangt die Aktivierung eine Beschlussgrundlage, und der
 * Aktivieren-Knopf ist gesperrt, solange der GESPEICHERTE Plan keine traegt.
 * Der Beschluss wird deshalb vorab per REST angelegt und zugeordnet — er ist
 * fuer diese Tests Beiwerk, nicht Gegenstand. Die Zuordnung ueber das
 * Auswahlfeld prueft `finanzen-beschlussgrundlage.spec.ts`.
 */
export async function activateWirtschaftsplan(page: Page, wegId: string, planId: string) {
  await attachBeschlussFixture(page, { planId, wegId });

  await page.goto(`/wegs/${wegId}/finanzen/${planId}/edit`);

  const aktivieren = page.getByRole("button", { name: /^Aktivieren$/ });
  // Waere der Knopf gesperrt, klickte Playwright ins Leere und der Test
  // scheiterte erst spaeter am fehlenden Redirect — mit einer Meldung, die auf
  // die falsche Ursache zeigt.
  await expect(
    aktivieren,
    "der Aktivieren-Knopf muss nach der Zuordnung freigeschaltet sein (0074)",
  ).toBeEnabled();
  await aktivieren.click();

  // Warten auf den Redirect, den die Server Action erst NACH der committeten RPC
  // ausloest (siehe activateWirtschaftsplan in .../[planId]/edit/actions.ts).
  //
  // Nicht auf das Verschwinden des Buttons warten: sein Label wechselt waehrend
  // der Aktion auf "Aktiviert ...", womit ein /^Aktivieren$/-Locator sofort
  // "hidden" meldet — der Test liest die Sollstellungen dann, waehrend die RPC
  // noch laeuft, und sieht eine leere Menge.
  await page.waitForURL(new RegExp(`/wegs/${wegId}/finanzen$`), { timeout: 20_000 });
}
