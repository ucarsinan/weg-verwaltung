import type { Page } from "@playwright/test";

/**
 * Aktiviert einen Wirtschaftsplan ueber die UI (`entwurf` -> `aktiv`).
 *
 * Sollstellungen entstehen laut docs/07-finance-lifecycle.md ausschliesslich in
 * `activate_wirtschaftsplan` — ein gespeicherter Plan ist `entwurf` und hat
 * bewusst keine. Jeder Test, der Sollstellungen erwartet, muss den Plan also
 * erst aktivieren, sonst prueft er gegen eine leere Menge und wird gruen, ohne
 * etwas zu belegen.
 */
export async function activateWirtschaftsplan(page: Page, wegId: string, planId: string) {
  await page.goto(`/wegs/${wegId}/finanzen/${planId}/edit`);
  await page.getByRole("button", { name: /^Aktivieren$/ }).click();

  // Warten auf den Redirect, den die Server Action erst NACH der committeten RPC
  // ausloest (siehe activateWirtschaftsplan in .../[planId]/edit/actions.ts).
  //
  // Nicht auf das Verschwinden des Buttons warten: sein Label wechselt waehrend
  // der Aktion auf "Aktiviert ...", womit ein /^Aktivieren$/-Locator sofort
  // "hidden" meldet — der Test liest die Sollstellungen dann, waehrend die RPC
  // noch laeuft, und sieht eine leere Menge.
  await page.waitForURL(new RegExp(`/wegs/${wegId}/finanzen$`), { timeout: 20_000 });
}
