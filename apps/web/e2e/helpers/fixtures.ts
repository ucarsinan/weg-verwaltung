import fs from "node:fs";
import path from "node:path";

import { expect, type Page } from "@playwright/test";

/**
 * E2E-Fixture-Modul — Domänen-Setup über den Supabase-REST-Seam.
 *
 * Specs bauen ihre Vorbedingungen (WEG → Einheit → Eigentümer → Versammlung
 * → TOP → Beschluss → Stimme) über diese Fixtures auf, nicht durchs UI.
 * Das UI wird nur noch im eigentlichen Testgegenstand bedient — ein
 * Label-Rename bricht damit das Setup keiner Specs mehr.
 *
 * Token-Handling ist Implementierung dieses Moduls: der Session-Token kommt
 * aus dem `sb-…-auth-token`-Browser-Cookie; RLS scoped alle Inserts auf den
 * eingeloggten Tenant (Invariante 1). Specs dürfen den Cookie nicht selbst
 * decodieren.
 */

export interface SupabaseRequestContext {
  token: string;
  url: string;
  key: string;
}

function decodeAccessTokenFromCookieValue(rawValue: string): string {
  let cookieValue = decodeURIComponent(rawValue);
  if (cookieValue.startsWith("base64-")) {
    cookieValue = Buffer.from(cookieValue.slice(7), "base64").toString("utf-8");
  }
  const tokenData = JSON.parse(cookieValue);
  return Array.isArray(tokenData)
    ? (tokenData[0] as string)
    : (tokenData as { access_token: string }).access_token;
}

function requireSupabaseEnv(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase URL or anon key for E2E fixture setup");
  }
  return { url, key };
}

export async function getSupabaseRequestContext(
  page: Page,
): Promise<SupabaseRequestContext> {
  const cookies = await page.context().cookies();
  const authCookie = cookies.find(
    (cookie) =>
      cookie.name.startsWith("sb-") && cookie.name.endsWith("-auth-token"),
  );
  if (!authCookie) {
    throw new Error("Supabase auth token cookie not found");
  }

  return {
    token: decodeAccessTokenFromCookieValue(authCookie.value),
    ...requireSupabaseEnv(),
  };
}

export async function getAccessToken(page: Page): Promise<string> {
  return (await getSupabaseRequestContext(page)).token;
}

/**
 * Zweiter Adapter am selben Seam: Token aus einem persistierten
 * Playwright-Storage-State (`playwright/.auth/<file>`) statt aus dem
 * Browser-Cookie — für Specs, die als zweiter Tenant sprechen (RLS-Tests).
 */
export function getTokenFromAuthFile(filename: string): string {
  const filePath = path.resolve(process.cwd(), "playwright", ".auth", filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Auth file not found at ${filePath}`);
  }
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as {
    cookies: Array<{ name: string; value: string }>;
  };
  const cookie = data.cookies.find(
    (c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token"),
  );
  if (!cookie) {
    throw new Error(`Supabase auth cookie not found in ${filename}`);
  }
  return decodeAccessTokenFromCookieValue(cookie.value);
}

/**
 * custom_access_token_hook (0002_identity.sql) injects tenant_id into
 * app_metadata on every JWT — decode it directly so isolation tests can
 * assert on real tenant_id values instead of just "the request didn't error".
 */
export function decodeTenantIdFromJwt(token: string): string {
  const payload = token.split(".")[1];
  const json = Buffer.from(payload, "base64url").toString("utf-8");
  const claims = JSON.parse(json) as { app_metadata?: { tenant_id?: string } };
  const tenantId = claims.app_metadata?.tenant_id;
  if (!tenantId) throw new Error("JWT is missing app_metadata.tenant_id");
  return tenantId;
}

// ---------------------------------------------------------------------------
// REST-Primitive (intern)
// ---------------------------------------------------------------------------

async function insertRow<T = { id: string }>(
  page: Page,
  table: string,
  data: Record<string, unknown>,
  select = "id",
): Promise<T> {
  const ctx = await getSupabaseRequestContext(page);

  const response = await page.request.post(
    `${ctx.url}/rest/v1/${table}?select=${select}`,
    {
      headers: {
        apikey: ctx.key,
        Authorization: `Bearer ${ctx.token}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      data,
    },
  );
  expect(response.ok(), `insert into ${table} failed: ${response.status()}`).toBe(
    true,
  );
  const [created] = (await response.json()) as T[];
  expect(created, `insert into ${table} returned no row`).toBeTruthy();
  return created;
}

async function patchRows(
  page: Page,
  table: string,
  filter: string,
  data: Record<string, unknown>,
): Promise<void> {
  const ctx = await getSupabaseRequestContext(page);

  const response = await page.request.patch(
    `${ctx.url}/rest/v1/${table}?${filter}`,
    {
      headers: {
        apikey: ctx.key,
        Authorization: `Bearer ${ctx.token}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      data,
    },
  );
  expect(response.ok(), `patch ${table} (${filter}) failed: ${response.status()}`).toBe(
    true,
  );
}

// ---------------------------------------------------------------------------
// Domänen-Fixtures (Versammlungs-Kette)
// ---------------------------------------------------------------------------

export async function createUnitFixture(
  page: Page,
  wegId: string,
  options: {
    bezeichnung?: string;
    meaZaehler?: number;
    meaNenner?: number;
  } = {},
): Promise<string> {
  const { id } = await insertRow(page, "unit", {
    weg_id: wegId,
    bezeichnung: options.bezeichnung ?? "Whg. 1, EG",
    mea_zaehler: options.meaZaehler ?? 100,
    mea_nenner: options.meaNenner ?? 1000,
  });
  return id;
}

export async function createPersonFixture(
  page: Page,
  options: { vorname?: string; nachname?: string } = {},
): Promise<string> {
  const { id } = await insertRow(page, "person", {
    vorname: options.vorname ?? "Erika",
    nachname: options.nachname ?? "Muster",
  });
  return id;
}

export async function createOwnershipFixture(
  page: Page,
  input: {
    wegId: string;
    unitId: string;
    personId: string;
    von?: string;
  },
): Promise<string> {
  const { id } = await insertRow(page, "ownership", {
    weg_id: input.wegId,
    unit_id: input.unitId,
    person_id: input.personId,
    von: input.von ?? "2020-01-01",
  });
  return id;
}

export type MeetingStatus =
  | "entwurf"
  | "eingeladen"
  | "laufend"
  | "beendet"
  | "abgesagt";

export async function createMeetingFixture(
  page: Page,
  wegId: string,
  options: {
    titel?: string;
    modus?: "praesenz" | "hybrid" | "virtuell" | "umlauf";
    status?: MeetingStatus;
    terminVon?: string;
  } = {},
): Promise<string> {
  const { id } = await insertRow(page, "meeting", {
    weg_id: wegId,
    titel: options.titel ?? "Eigentümerversammlung (Fixture)",
    modus: options.modus ?? "praesenz",
    ...(options.status ? { status: options.status } : {}),
    ...(options.terminVon ? { termin_von: options.terminVon } : {}),
  });
  return id;
}

export async function createTopFixture(
  page: Page,
  meetingId: string,
  options: { position?: number; titel?: string; beschreibung?: string } = {},
): Promise<string> {
  const { id } = await insertRow(page, "agenda_item", {
    meeting_id: meetingId,
    position: options.position ?? 1,
    titel: options.titel ?? "TOP 1 (Fixture)",
    ...(options.beschreibung ? { beschreibung: options.beschreibung } : {}),
  });
  return id;
}

export async function createResolutionFixture(
  page: Page,
  input: {
    meetingId: string;
    agendaItemId?: string;
    text?: string;
    mehrheitsTyp?:
      | "einfach"
      | "qualifiziert"
      | "doppelt_qualifiziert"
      | "allstimmig"
      | "vereinbarungs_aenderung";
    stimmprinzip?: "kopf" | "wert" | "objekt";
  },
): Promise<string> {
  const { id } = await insertRow(page, "resolution", {
    meeting_id: input.meetingId,
    ...(input.agendaItemId ? { agenda_item_id: input.agendaItemId } : {}),
    text: input.text ?? "Die Gemeinschaft beschließt die Fixture-Maßnahme.",
    mehrheits_typ: input.mehrheitsTyp ?? "einfach",
    stimmprinzip: input.stimmprinzip ?? "kopf",
  });
  return id;
}

/** Invariante 5: Stimmen referenzieren ownership_id, niemals person/user. */
export async function castVoteFixture(
  page: Page,
  input: {
    resolutionId: string;
    ownershipId: string;
    wert: "ja" | "nein" | "enthaltung";
    quelle?: "praesenz" | "digital" | "umlauf";
  },
): Promise<void> {
  await insertRow(page, "vote", {
    resolution_id: input.resolutionId,
    ownership_id: input.ownershipId,
    wert: input.wert,
    quelle: input.quelle ?? "praesenz",
  });
}

export async function setMeetingStatus(
  page: Page,
  meetingId: string,
  status: MeetingStatus,
): Promise<void> {
  await patchRows(page, "meeting", `id=eq.${meetingId}`, { status });
}

/**
 * Protokoll-Row direkt seeden — der Agent läuft nicht im E2E-Kontext,
 * daher kein Klick auf "Protokoll generieren". tenant_id setzt RLS aus
 * dem JWT; nicht mitsenden.
 */
export async function createProtocolFixture(
  page: Page,
  input: {
    meetingId: string;
    status?: "ki_entwurf" | "unterzeichnet";
    text?: string;
  },
): Promise<void> {
  await insertRow(page, "protocol", {
    meeting_id: input.meetingId,
    status: input.status ?? "ki_entwurf",
    text:
      input.text ??
      "# Test Protokoll\n\n## Entwurf\n\nDieser Entwurf wurde vom KI-System generiert.",
    generierungs_quelle: "ki",
  });
}

// ---------------------------------------------------------------------------
// Domänen-Fixtures (Finanz-Kette)
// ---------------------------------------------------------------------------

export async function createWirtschaftsplanFixture(
  page: Page,
  input: {
    wegId: string;
    jahr: number;
    bezeichnung?: string;
    gesamtkosten: number;
  },
): Promise<string> {
  const { id } = await insertRow(page, "wirtschaftsplan", {
    weg_id: input.wegId,
    jahr: input.jahr,
    bezeichnung: input.bezeichnung ?? `Wirtschaftsplan ${input.jahr}`,
    gesamtkosten: input.gesamtkosten,
  });
  return id;
}

function decodeUserIdFromJwt(token: string): string {
  const payload = token.split(".")[1];
  const json = Buffer.from(payload, "base64url").toString("utf-8");
  const claims = JSON.parse(json) as { sub?: string };
  const sub = claims.sub;
  if (!sub) throw new Error("JWT is missing sub");
  return sub;
}

/**
 * Zusichert, dass die Miteigentumsanteile dieser WEG zusammen das Ganze
 * ergeben.
 *
 * Seit 0073 aktiviert `activate_wirtschaftsplan` nur bei einer Anteilssumme von
 * genau 1 (± 0,0001) — eine WEG, der Einheiten fehlen, würde Kosten auf
 * niemanden verteilen. Eine Fixture, die das verletzt, bekam bisher einen
 * nackten `400` zurück: die Ursache lag in der Datenbank, die Meldung im Test
 * zeigte nur auf die Fixture-Zeile. Genau daran sind nach dem Rollout von 0073
 * drei Specs unbemerkt hängen geblieben.
 *
 * Bewusst eine Zusicherung und keine Selbstheilung: eine automatisch ergänzte
 * Restanteil-Einheit würde die Sollstellungszahlen verschieben, die einige
 * Tests genau prüfen — und `finanz-wp-unaligned-mea` hat die unvollständige
 * MEA zum Gegenstand.
 */
export async function assertVollstaendigeMea(
  page: Page,
  wegId: string,
): Promise<void> {
  const ctx = await getSupabaseRequestContext(page);

  const response = await page.request.get(
    `${ctx.url}/rest/v1/unit?weg_id=eq.${wegId}&select=mea_zaehler,mea_nenner`,
    { headers: { apikey: ctx.key, Authorization: `Bearer ${ctx.token}` } },
  );
  expect(
    response.ok(),
    `reading units of weg(${wegId}) failed: ${response.status()}`,
  ).toBe(true);
  // `bigint` kommt bei PostgREST als Zahl, nicht als String — anders als die
  // `numeric`-Betraege, die die Specs durch `Number()` schicken muessen. Eine
  // Division durch Null ist ausgeschlossen: `unit_mea_positive` (0003:49)
  // verlangt beide Werte > 0.
  const units = (await response.json()) as {
    mea_zaehler: number;
    mea_nenner: number;
  }[];

  const summe = units.reduce(
    (acc, unit) => acc + unit.mea_zaehler / unit.mea_nenner,
    0,
  );
  // Dasselbe Epsilon wie 0073:67 — die Zusicherung darf nicht strenger urteilen
  // als die Datenbank, sonst scheitert sie an Fällen, die durchgehen würden.
  expect(
    Math.abs(summe - 1) <= 0.0001,
    `die ${units.length} Einheiten dieser WEG tragen zusammen ${(summe * 100).toFixed(2)} % der Anteile, nicht 100 % — seit 0073 verweigert activate_wirtschaftsplan die Aktivierung. Bitte die Fixture vervollständigen.`,
  ).toBe(true);
}

/**
 * Legt einen Beschluss-Sammlung-Eintrag an und hängt ihn an den Entwurf.
 *
 * Seit 0074 verlangt `activate_wirtschaftsplan` diesen Nachweis: die
 * Vorschüsse entstehen durch den Beschluss der Eigentümer, nicht durch das
 * Aufstellen des Plans (§ 28 Abs. 1 WEG). Für Tests, deren Gegenstand die
 * Aktivierung nicht ist, gehört das zum Fixture-Aufbau wie die Einheiten.
 *
 * `lfd_nr` wird nicht gesetzt — der Trigger aus 0049 vergibt sie je WEG.
 */
export async function attachBeschlussFixture(
  page: Page,
  input: { planId: string; wegId: string; typ?: string; datum?: string },
): Promise<string> {
  const ctx = await getSupabaseRequestContext(page);

  const { id } = await insertRow(page, "beschluss_sammlung_entry", {
    weg_id: input.wegId,
    beschluss_text:
      "E2E: Die Gemeinschaft beschliesst die Vorschuesse nach dem Wirtschaftsplan.",
    datum: input.datum ?? "2026-01-15",
    typ: input.typ ?? "positiv_beschluss",
    erstellt_durch: decodeUserIdFromJwt(ctx.token),
  });

  await patchRows(page, "wirtschaftsplan", `id=eq.${input.planId}`, {
    beschluss_sammlung_entry_id: id,
  });

  return id;
}

/**
 * Aktivierung über dieselbe RPC, die auch die Server Action ruft
 * (`activate_wirtschaftsplan`, docs/07-finance-lifecycle.md) — erst sie
 * erzeugt Sollstellungen. Für Tests, deren Gegenstand die Aktivierung
 * selbst ist, stattdessen helpers/finanzen.ts (UI-Pfad) verwenden.
 *
 * Sorgt selbst für die seit 0074 nötige Beschlussgrundlage, falls der Plan noch
 * keine trägt. Das hält die Signatur unverändert und damit alle vierzehn
 * Aufrufstellen: der Beschluss ist für diese Tests Beiwerk, nicht Gegenstand.
 * Wer eine bestimmte Grundlage braucht, ruft vorher attachBeschlussFixture.
 *
 * Die zweite Vorbedingung — vollständige Miteigentumsanteile seit 0073 — wird
 * dagegen nur geprüft, nicht hergestellt: siehe assertVollstaendigeMea.
 */
export async function activateWirtschaftsplanFixture(
  page: Page,
  planId: string,
): Promise<void> {
  const ctx = await getSupabaseRequestContext(page);

  const planResponse = await page.request.get(
    `${ctx.url}/rest/v1/wirtschaftsplan?id=eq.${planId}&select=weg_id,beschluss_sammlung_entry_id`,
    {
      headers: {
        apikey: ctx.key,
        Authorization: `Bearer ${ctx.token}`,
      },
    },
  );
  expect(
    planResponse.ok(),
    `reading wirtschaftsplan(${planId}) failed: ${planResponse.status()}`,
  ).toBe(true);
  const [plan] = (await planResponse.json()) as {
    weg_id: string;
    beschluss_sammlung_entry_id: string | null;
  }[];
  expect(plan, `wirtschaftsplan(${planId}) not found`).toBeTruthy();

  if (!plan.beschluss_sammlung_entry_id) {
    await attachBeschlussFixture(page, { planId, wegId: plan.weg_id });
  }

  await assertVollstaendigeMea(page, plan.weg_id);

  const response = await page.request.post(
    `${ctx.url}/rest/v1/rpc/activate_wirtschaftsplan`,
    {
      headers: {
        apikey: ctx.key,
        Authorization: `Bearer ${ctx.token}`,
        "Content-Type": "application/json",
      },
      data: { p_wirtschaftsplan_id: planId },
    },
  );
  expect(
    response.ok(),
    `activate_wirtschaftsplan(${planId}) failed: ${response.status()}`,
  ).toBe(true);
}
