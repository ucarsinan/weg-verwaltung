import { test, expect, Page } from "@playwright/test";
import {
  activateWirtschaftsplanFixture,
  createOwnershipFixture,
  createPersonFixture,
  createUnitFixture,
  createWirtschaftsplanFixture,
  getSupabaseRequestContext,
} from "./helpers/fixtures";
import { createWegFixture } from "./helpers/weg";

/**
 * Der Selbstverwaltungs-Slice — die Reise einer kleinen WEG als ein Stück.
 *
 * `PROJECT_REALITY.md` sperrt mehrere Vorhaben hinter „den
 * Selbstverwaltungs-Slice verifizieren", ohne den Begriff je zu definieren.
 * Diese Datei definiert ihn als eine durchgehende Reise und belegt, wie weit
 * sie trägt.
 *
 * Warum sechs Einheiten: § 19 Abs. 2 Nr. 6 WEG erlaubt die Verwaltung durch
 * einen Eigentümer nur bei **unter neun** Sondereigentumsrechten (und nur,
 * wenn weniger als ein Drittel einen zertifizierten Verwalter verlangt). Das
 * ist die reale Größe dieses Segments, nicht die zwei Einheiten der
 * bestehenden Finanz-Specs.
 *
 * **Was hier zugesichert wird, ist persistierter Zustand.** Die Vorschau in
 * `wirtschaftsplan-form.tsx:193` und der Generator in `0060:255-268` benutzen
 * dieselbe Formel — eine Zusicherung gegen die Vorschau bestätigt den
 * Generator also auch dann, wenn beide falsch rechnen. Deshalb wird hier die
 * Tabelle `sollstellung` gelesen, nicht das Formular.
 *
 * Abgrenzung: Die Versammlungskette liegt in `versammlungen.spec.ts`, die
 * Oberfläche der Jahresabrechnung in `finanzen-abrechnung.spec.ts`. Diese
 * Datei verdoppelt beides nicht — sie prüft, ob die Kette als Ganzes hält.
 *
 * Rückstand: Jeder Lauf legt im Frankfurt-Mandanten eine WEG samt Einheiten,
 * Personen, Plan und Sollstellungen an, die konstruktionsbedingt nicht
 * löschbar sind. Bewusst hingenommen, siehe
 * `docs/agent-reports/2026-09-28-selbstverwaltungs-slice-verifikation.md`.
 */

const JAHR = 2091;

/**
 * Sechs Einheiten, deren MEA **exakt** auf den Nenner aufgeht. Die Beträge
 * sind von Hand nachgerechnet, damit der Test nicht nur „läuft durch" prüft:
 *
 *   Monat = (mea / 1000) × 36.000 € / 12
 */
const EINHEITEN = [
  { bezeichnung: "Whg 1, EG links", mea: 180, monatlich: 540 },
  { bezeichnung: "Whg 2, EG rechts", mea: 180, monatlich: 540 },
  { bezeichnung: "Whg 3, OG links", mea: 170, monatlich: 510 },
  { bezeichnung: "Whg 4, OG rechts", mea: 170, monatlich: 510 },
  { bezeichnung: "Whg 5, DG links", mea: 150, monatlich: 450 },
  { bezeichnung: "Whg 6, DG rechts", mea: 150, monatlich: 450 },
] as const;

const GESAMTKOSTEN = 36_000;

type Rest = { token: string; url: string; key: string };

async function rest(page: Page): Promise<Rest> {
  return getSupabaseRequestContext(page);
}

function headers(ctx: Rest, representation = false) {
  return {
    apikey: ctx.key,
    Authorization: `Bearer ${ctx.token}`,
    "Content-Type": "application/json",
    ...(representation ? { Prefer: "return=representation" } : {}),
  };
}

async function insert(
  page: Page,
  table: string,
  data: Record<string, unknown>,
): Promise<string> {
  const ctx = await rest(page);
  const response = await page.request.post(
    `${ctx.url}/rest/v1/${table}?select=id`,
    { headers: headers(ctx, true), data },
  );
  expect(
    response.ok(),
    `insert into ${table} failed: ${response.status()} ${await response.text()}`,
  ).toBe(true);
  const [row] = (await response.json()) as Array<{ id: string }>;
  return row.id;
}

async function select<T>(page: Page, query: string): Promise<T[]> {
  const ctx = await rest(page);
  const response = await page.request.get(`${ctx.url}/rest/v1/${query}`, {
    headers: headers(ctx),
  });
  expect(
    response.ok(),
    `select ${query} failed: ${response.status()}`,
  ).toBe(true);
  return (await response.json()) as T[];
}

/** Ein MEA-Schlüssel samt erster Version — ohne Version ist er unbrauchbar. */
async function meaSchluessel(page: Page, wegId: string): Promise<string> {
  const keyId = await insert(page, "verteilungsschluessel", {
    weg_id: wegId,
    name: `MEA ${Date.now()}`,
  });
  return insert(page, "verteilungsschluessel_version", {
    verteilungsschluessel_id: keyId,
    typ: "mea",
    quelle: "gesetz",
    gueltig_ab: `${JAHR}-01-01`,
  });
}

test.describe("Selbstverwaltungs-Slice", () => {
  test("selbstverwaltung-jahreszyklus: sechs Einheiten tragen von der Anlage bis zur Jahresabrechnung", async ({
    page,
  }) => {
    test.slow();

    const marke = Date.now();
    const wegId = await createWegFixture(page, `E2E Selbstverwaltung ${marke}`, {
      street: "Beiratsweg",
    });

    // 1. Einheiten mit MEA, die auf den Nenner aufgehen.
    const unitIds: string[] = [];
    for (const einheit of EINHEITEN) {
      unitIds.push(
        await createUnitFixture(page, wegId, {
          bezeichnung: `${einheit.bezeichnung} ${marke}`,
          meaZaehler: einheit.mea,
          meaNenner: 1000,
        }),
      );
    }

    // 2. Zu jeder Einheit ein Eigentümer. Das `von`-Datum entscheidet später
    //    die Stimmberechtigung — hier wird es gesetzt, damit die WEG
    //    vollständig ist und nicht nur rechnerisch existiert.
    for (const [index, unitId] of unitIds.entries()) {
      const personId = await createPersonFixture(page, {
        vorname: `Eigentümer${index + 1}`,
        nachname: `Selbstverwaltung${marke}`,
      });
      await createOwnershipFixture(page, {
        wegId,
        unitId,
        personId,
        von: `${JAHR - 1}-01-01`,
      });
    }

    // 3. Verteilungsschlüssel — unsichtbare Vorbedingung für Positionen und
    //    Ausgaben (siehe Befund 7 im Report).
    const versionId = await meaSchluessel(page, wegId);

    // 4. Wirtschaftsplan als Entwurf, dann aktivieren. Erst die Aktivierung
    //    erzeugt Sollstellungen — ein gespeicherter Entwurf hat bewusst keine.
    const planId = await createWirtschaftsplanFixture(page, {
      wegId,
      jahr: JAHR,
      bezeichnung: `Wirtschaftsplan ${JAHR}`,
      gesamtkosten: GESAMTKOSTEN,
    });
    await activateWirtschaftsplanFixture(page, planId);

    // 5. Der Kern: persistierte Sollstellungen, nicht die Formularvorschau.
    const sollstellungen = await select<{
      unit_id: string;
      monat: number;
      betrag: string;
    }>(
      page,
      `sollstellung?wirtschaftsplan_id=eq.${planId}&select=unit_id,monat,betrag`,
    );

    expect(
      sollstellungen,
      "sechs Einheiten über zwölf Monate ergeben 72 Forderungen",
    ).toHaveLength(EINHEITEN.length * 12);

    for (const [index, einheit] of EINHEITEN.entries()) {
      const jeEinheit = sollstellungen.filter(
        (row) => row.unit_id === unitIds[index],
      );
      expect(
        jeEinheit.map((row) => row.monat).sort((a, b) => a - b),
        `${einheit.bezeichnung} braucht alle zwölf Monate`,
      ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      for (const row of jeEinheit) {
        expect(
          Number(row.betrag),
          `${einheit.bezeichnung} zahlt monatlich ${einheit.monatlich} €`,
        ).toBe(einheit.monatlich);
      }
    }

    // 6. Die Zusicherung, auf die es ankommt: Die Gemeinschaft trägt ihre
    //    Kosten vollständig. Genau diese Summe deckt auf, wenn MEA-Anteile
    //    nicht aufgehen — siehe den Charakterisierungstest weiter unten.
    const summe = sollstellungen.reduce((acc, row) => acc + Number(row.betrag), 0);
    expect(
      summe,
      "Die Summe aller Sollstellungen muss den Gesamtkosten entsprechen",
    ).toBe(GESAMTKOSTEN);

    // 7. Eine Ausgabe im selben Jahr, damit eine Abrechnung Substanz hat.
    await insert(page, "ausgabe", {
      weg_id: wegId,
      betrag: GESAMTKOSTEN,
      wert_datum: `${JAHR}-06-30`,
      empfaenger: "Stadtwerke",
      kostenart: "Betriebskosten",
      verteilungsschluessel_version_id: versionId,
    });

    // 8. Jahresabrechnung erstellen.
    const ctx = await rest(page);
    const abrechnung = await page.request.post(
      `${ctx.url}/rest/v1/rpc/erstelle_abrechnung`,
      {
        headers: headers(ctx),
        data: { p_weg_id: wegId, p_jahr: JAHR },
      },
    );
    expect(
      abrechnung.ok(),
      `erstelle_abrechnung failed: ${abrechnung.status()} ${await abrechnung.text()}`,
    ).toBe(true);

    // 9. Die Spitze belegt, dass Schritt 4 durchgeschlagen ist: Ohne
    //    aktivierten Plan wäre `soll_vorschuesse` null und jeder Eigentümer
    //    bekäme die vollen Kosten als Nachschuss.
    const spitzen = await select<{
      unit_id: string;
      kostenanteil: string;
      soll_vorschuesse: string;
      spitze: string;
    }>(
      page,
      `abrechnung_spitze?weg_id=eq.${wegId}&jahr=eq.${JAHR}&select=unit_id,kostenanteil,soll_vorschuesse,spitze`,
    );

    expect(spitzen, "je Einheit eine Spitze").toHaveLength(EINHEITEN.length);
    for (const [index, einheit] of EINHEITEN.entries()) {
      const zeile = spitzen.find((row) => row.unit_id === unitIds[index]);
      expect(zeile, `${einheit.bezeichnung} fehlt in der Abrechnung`).toBeDefined();
      expect(
        Number(zeile!.soll_vorschuesse),
        `${einheit.bezeichnung} hat das ganze Jahr vorausgezahlt`,
      ).toBe(einheit.monatlich * 12);
      // Ausgaben in Höhe der Gesamtkosten, nach demselben Schlüssel verteilt:
      // Kostenanteil und Vorschuss heben sich auf.
      expect(
        Number(zeile!.spitze),
        `${einheit.bezeichnung} ist ausgeglichen`,
      ).toBe(0);
    }
  });

  /**
   * Charakterisierungstest — dokumentiert einen **Fehler**, er repariert ihn
   * nicht.
   *
   * Befund 1 im Report: Nichts prüft, ob die MEA-Anteile einer WEG auf den
   * Nenner aufgehen. `0060:255-268` verteilt den rohen Bruch. Drei Einheiten
   * à 250/1000 ergeben 75 % — die Gemeinschaft berechnet dauerhaft ein
   * Viertel zu wenig Hausgeld, ohne Warnung, und die Formularvorschau zeigt
   * dieselbe zu niedrige Zahl.
   *
   * Dieser Test sichert das heutige Verhalten zu. Wird der Fehler behoben,
   * wird er rot — das ist beabsichtigt und der einzige Weg, einen stillen
   * Rechenfehler nicht wieder aus den Augen zu verlieren.
   */
  test("selbstverwaltung-mea-luecke: unvollständige MEA belasten die Gemeinschaft zu niedrig", async ({
    page,
  }) => {
    const marke = Date.now();
    const wegId = await createWegFixture(page, `E2E MEA-Lücke ${marke}`, {
      street: "Bruchweg",
    });

    for (let i = 1; i <= 3; i += 1) {
      await createUnitFixture(page, wegId, {
        bezeichnung: `Whg ${i} ${marke}`,
        meaZaehler: 250,
        meaNenner: 1000,
      });
    }

    const planId = await createWirtschaftsplanFixture(page, {
      wegId,
      jahr: JAHR,
      bezeichnung: `Wirtschaftsplan ${JAHR}`,
      gesamtkosten: 12_000,
    });
    await activateWirtschaftsplanFixture(page, planId);

    const sollstellungen = await select<{ betrag: string }>(
      page,
      `sollstellung?wirtschaftsplan_id=eq.${planId}&select=betrag`,
    );
    const summe = sollstellungen.reduce((acc, row) => acc + Number(row.betrag), 0);

    // Fachlich richtig wären 12.000 €. Tatsächlich sind es 9.000 € — die
    // fehlenden 250/1000 werden niemandem berechnet.
    expect(
      summe,
      "heutiges Verhalten: 75 % der Gesamtkosten, ohne Warnung (Befund 1)",
    ).toBe(9_000);
    expect(
      summe,
      "sobald diese Zusicherung rot wird, ist Befund 1 behoben",
    ).not.toBe(12_000);
  });

  /**
   * Charakterisierungstest — dokumentiert einen **Fehler**, er repariert ihn
   * nicht.
   *
   * Befund 2 im Report: `abrechnung_spitze` zählt nur Sollstellungen aus
   * Plänen mit `status <> 'entwurf'`. Wurde für das Jahr kein Plan aktiviert,
   * ist `soll_vorschuesse` null — und jeder Eigentümer erhält die vollen
   * Jahreskosten als Nachschuss ausgewiesen. Nichts warnt davor.
   */
  test("selbstverwaltung-abrechnung-ohne-plan: ohne aktivierten Plan wird alles zum Nachschuss", async ({
    page,
  }) => {
    const marke = Date.now();
    const wegId = await createWegFixture(page, `E2E Ohne Plan ${marke}`, {
      street: "Planlosweg",
    });

    await createUnitFixture(page, wegId, {
      bezeichnung: `Whg 1 ${marke}`,
      meaZaehler: 500,
      meaNenner: 1000,
    });
    await createUnitFixture(page, wegId, {
      bezeichnung: `Whg 2 ${marke}`,
      meaZaehler: 500,
      meaNenner: 1000,
    });

    const versionId = await meaSchluessel(page, wegId);

    // Kein Wirtschaftsplan, keine Aktivierung — nur Ausgaben.
    await insert(page, "ausgabe", {
      weg_id: wegId,
      betrag: 10_000,
      wert_datum: `${JAHR}-05-05`,
      empfaenger: "Dachdecker",
      kostenart: "Instandhaltung",
      verteilungsschluessel_version_id: versionId,
    });

    const ctx = await rest(page);
    const abrechnung = await page.request.post(
      `${ctx.url}/rest/v1/rpc/erstelle_abrechnung`,
      { headers: headers(ctx), data: { p_weg_id: wegId, p_jahr: JAHR } },
    );
    // Der Aufruf gelingt — das ist Teil des Befunds.
    expect(abrechnung.ok()).toBe(true);

    const spitzen = await select<{
      soll_vorschuesse: string;
      spitze: string;
    }>(
      page,
      `abrechnung_spitze?weg_id=eq.${wegId}&jahr=eq.${JAHR}&select=soll_vorschuesse,spitze`,
    );

    expect(spitzen).toHaveLength(2);
    for (const zeile of spitzen) {
      expect(
        Number(zeile.soll_vorschuesse),
        "heutiges Verhalten: keine Vorschüsse, weil kein Plan aktiv ist (Befund 2)",
      ).toBe(0);
      expect(
        Number(zeile.spitze),
        "jeder Eigentümer schuldet die vollen 5.000 € als Nachschuss",
      ).toBe(5_000);
    }
  });
});
