#!/usr/bin/env node
// Demo-data reset for the linked remote Supabase project.
//
// Usage:
//   ALLOW_REMOTE_FAKE_DATA_RESET=1 node apps/web/scripts/seed-fake-data.mjs
//
// This script is intentionally conservative:
// - It deletes only tenant-scoped rows that the database model allows to delete.
// - It does not bypass append-only/legal-history guards.
// - It aborts before reseeding if protected rows still block a clean reset.

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(__dirname, "..");
const repoRoot = resolve(webDir, "..", "..");
const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);

if (nodeMajor < 20) {
  console.error(`ABBRUCH: Node.js >=20 erforderlich, aktuell ${process.version}.`);
  console.error("Nutze z.B.: /Users/sinanucar/.nvm/versions/node/v22.12.0/bin/node apps/web/scripts/seed-fake-data.mjs");
  process.exit(1);
}

if (process.env.ALLOW_REMOTE_FAKE_DATA_RESET !== "1") {
  console.error("ABBRUCH: Dieses Script loescht Daten in der verbundenen Supabase-Cloud-Datenbank.");
  console.error(
    "Zum bewussten Ausfuehren: ALLOW_REMOTE_FAKE_DATA_RESET=1 node apps/web/scripts/seed-fake-data.mjs",
  );
  process.exit(1);
}

function loadEnv(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    const hash = val.indexOf(" #");
    if (hash > -1) val = val.slice(0, hash).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const env = {
  ...loadEnv(resolve(repoRoot, ".env.local")),
  ...loadEnv(resolve(webDir, ".env.local")),
  ...process.env,
};

const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;

if (!url || !serviceKey) {
  console.error("Missing env: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const requestedTenantId = env.SEED_TENANT_ID;
const requestedTenantName = env.SEED_TENANT_NAME;

if (!requestedTenantId && !requestedTenantName) {
  console.error("ABBRUCH: Setze SEED_TENANT_ID oder SEED_TENANT_NAME. Kein impliziter Remote-Tenant-Reset.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  db: { schema: "public" },
});

let tenantQuery = admin.from("tenant").select("id, name, created_at");
if (requestedTenantId) {
  tenantQuery = tenantQuery.eq("id", requestedTenantId).limit(1);
} else if (requestedTenantName) {
  tenantQuery = tenantQuery
    .eq("name", requestedTenantName)
    .order("created_at", { ascending: false })
    .limit(1);
}

const { data: tenant, error: tenantErr } = await tenantQuery.single();

if (tenantErr || !tenant) {
  console.error("Kein Tenant gefunden. Bitte zuerst `just seed-admin` ausfuehren.");
  process.exit(1);
}

const tenantId = tenant.id;
console.log(`Target: ${url}`);
console.log(`Tenant: ${tenant.name ?? "unbenannt"} (${tenantId})`);
console.warn("WARNUNG: Service-Role umgeht RLS. Dieses Script ist nur fuer Demo-/Seed-Tenants gedacht.");

const protectedTables = [
  "audit_event",
  "beschluss_anfechtung_event",
  "beschluss_sammlung_entry",
  "document_version",
  "sollstellung",
];

const cleanupTables = [
  "agent_suggestion",
  "vote",
  "proxy",
  "protocol",
  "document",
  "resolution",
  "agenda_item",
  "meeting",
  "wirtschaftsplan",
  "ownership_co_owner",
  "ownership",
  "unit",
  "person",
  "weg",
];

async function countRows(table, query = (q) => q) {
  const { count, error } = await query(
    admin.from(table).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
  );
  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true, count: count ?? 0 };
}

async function countBlockedVotes() {
  const { data, error } = await admin
    .from("vote")
    .select("id, resolution:resolution!vote_resolution_fk(festgestellt_am, meeting:meeting!resolution_meeting_fk(status))")
    .eq("tenant_id", tenantId);

  if (error) {
    return { ok: false, message: error.message };
  }

  const count = (data ?? []).filter((vote) => {
    const resolution = Array.isArray(vote.resolution) ? vote.resolution[0] : vote.resolution;
    const meeting = Array.isArray(resolution?.meeting)
      ? resolution.meeting[0]
      : resolution?.meeting;
    return resolution?.festgestellt_am || meeting?.status !== "laufend";
  }).length;

  return { ok: true, count };
}

async function deleteTenantRows(table) {
  const { error } = await admin.from(table).delete().eq("tenant_id", tenantId);
  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true };
}

async function insertOne(table, values, label) {
  const { data, error } = await admin
    .from(table)
    .insert({ ...values, tenant_id: tenantId })
    .select("id")
    .single();

  if (error) {
    throw new Error(`${table} insert failed (${label}): ${error.message}`);
  }

  console.log(`  + ${label}`);
  return data.id;
}

console.log("\nLoesche vorhandene Demo-/Fachdaten...");
console.log(`  - geschuetzte Historientabellen bleiben unangetastet: ${protectedTables.join(", ")}`);

const preflightFailures = [];
for (const table of protectedTables) {
  const result = await countRows(table);
  if (!result.ok) {
    preflightFailures.push(`${table}: ${result.message}`);
  } else if (result.count > 0) {
    preflightFailures.push(`${table}: ${result.count} geschuetzte Zeilen vorhanden`);
  }
}

const blockedVotes = await countBlockedVotes();
if (!blockedVotes.ok) {
  console.log(`  ! Vote-Preflight uebersprungen: ${blockedVotes.message}`);
} else if (blockedVotes.count > 0) {
  preflightFailures.push(`${blockedVotes.count} Stimmen waeren durch Meeting-/Beschlussstatus blockiert`);
}

if (preflightFailures.length > 0) {
  console.error("\nABBRUCH: Preflight hat geschuetzte oder blockierende Historie gefunden.");
  console.error("Es wurden keine Daten geaendert. Nutze fuer eine saubere Demo einen frischen Tenant.");
  for (const failure of preflightFailures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

const cleanupFailures = [];
for (const table of cleanupTables) {
  const result = await deleteTenantRows(table);
  if (result.ok) {
    console.log(`  + ${table} geleert`);
  } else {
    cleanupFailures.push({ table, message: result.message });
    console.log(`  ! ${table}: ${result.message}`);
  }
}

if (cleanupFailures.length > 0) {
  console.error("\nABBRUCH: Der Tenant konnte nicht sauber geleert werden.");
  console.error("Ursache sind wahrscheinlich append-only oder historische Datensaetze, die FK-Referenzen halten.");
  console.error("Neue Fake-Daten werden nicht angelegt, damit keine weiteren Altlasten entstehen.");
  for (const failure of cleanupFailures) {
    console.error(`  - ${failure.table}: ${failure.message}`);
  }
  process.exit(1);
}

console.log("\nLege 3 kompakte, fachlich benannte Demo-Szenarien an...");

const parkblickWegId = await insertOne(
  "weg",
  {
    name: "WEG Parkblick 18",
    adresse: "Parkblick 18, 60322 Frankfurt am Main",
    amtsgericht: "AG Frankfurt am Main",
    grundbuch_blatt: "Blatt 1842",
  },
  "WEG Parkblick 18",
);

const kanalhofWegId = await insertOne(
  "weg",
  {
    name: "WEG Kanalhof 4",
    adresse: "Kanalhof 4, 20457 Hamburg",
    amtsgericht: "AG Hamburg",
    grundbuch_blatt: "Blatt 7719",
  },
  "WEG Kanalhof 4",
);

const speicherstadtWegId = await insertOne(
  "weg",
  {
    name: "WEG Speicherstadt 11",
    adresse: "Speicherstadt 11, 01067 Dresden",
    amtsgericht: "AG Dresden",
    grundbuch_blatt: "Blatt 3926",
  },
  "WEG Speicherstadt 11",
);

const scenarios = [
  {
    wegId: parkblickWegId,
    units: [
      { bezeichnung: "Wohnung 1, EG links", mea_zaehler: 600, mea_nenner: 1000 },
      { bezeichnung: "Wohnung 2, OG rechts", mea_zaehler: 400, mea_nenner: 1000 },
    ],
    people: [
      {
        vorname: "Lea",
        nachname: "Sommer",
        anschrift: "Parkblick 18, Wohnung 1, 60322 Frankfurt am Main",
        email: "lea.sommer@example.invalid",
        telefon: "+49 69 1000 181",
      },
      {
        vorname: "Nils",
        nachname: "Berger",
        anschrift: "Parkblick 18, Wohnung 2, 60322 Frankfurt am Main",
        email: "nils.berger@example.invalid",
        telefon: "+49 69 1000 182",
      },
    ],
  },
  {
    wegId: kanalhofWegId,
    units: [
      { bezeichnung: "Einheit A, Hofhaus", mea_zaehler: 520, mea_nenner: 1000 },
      { bezeichnung: "Einheit B, Vorderhaus", mea_zaehler: 480, mea_nenner: 1000 },
    ],
    people: [
      {
        vorname: "Mara",
        nachname: "Keller",
        anschrift: "Kanalhof 4, Einheit A, 20457 Hamburg",
        email: "mara.keller@example.invalid",
        telefon: "+49 40 2000 441",
      },
      {
        vorname: "Jonas",
        nachname: "Reuter",
        anschrift: "Kanalhof 4, Einheit B, 20457 Hamburg",
        email: "jonas.reuter@example.invalid",
        telefon: "+49 40 2000 442",
      },
    ],
  },
  {
    wegId: speicherstadtWegId,
    units: [
      { bezeichnung: "Loft 1, 1. OG", mea_zaehler: 500, mea_nenner: 1000 },
      { bezeichnung: "Loft 2, 2. OG", mea_zaehler: 500, mea_nenner: 1000 },
    ],
    people: [
      {
        vorname: "Clara",
        nachname: "Wendt",
        anschrift: "Speicherstadt 11, Loft 1, 01067 Dresden",
        email: "clara.wendt@example.invalid",
        telefon: "+49 351 3000 111",
      },
      {
        vorname: "Oskar",
        nachname: "Vogel",
        anschrift: "Speicherstadt 11, Loft 2, 01067 Dresden",
        email: "oskar.vogel@example.invalid",
        telefon: "+49 351 3000 112",
      },
    ],
  },
];

for (const scenario of scenarios) {
  const unitIds = [];
  const personIds = [];
  const ownershipIds = [];

  for (const unit of scenario.units) {
    unitIds.push(await insertOne("unit", { ...unit, weg_id: scenario.wegId }, unit.bezeichnung));
  }

  for (const person of scenario.people) {
    personIds.push(await insertOne("person", person, `${person.vorname} ${person.nachname}`));
  }

  for (let i = 0; i < unitIds.length; i += 1) {
    ownershipIds.push(
      await insertOne(
        "ownership",
        {
          weg_id: scenario.wegId,
          unit_id: unitIds[i],
          person_id: personIds[i],
          von: "2021-01-01",
        },
        `Eigentuemerschaft ${scenario.units[i].bezeichnung}`,
      ),
    );
  }

  scenario.unitIds = unitIds;
  scenario.personIds = personIds;
  scenario.ownershipIds = ownershipIds;
}

await insertOne(
  "ownership_co_owner",
  {
    ownership_id: scenarios[1].ownershipIds[0],
    person_id: scenarios[1].personIds[1],
  },
  "Mit-Eigentuemer Kanalhof Einheit A",
);

const parkblickMeetingId = await insertOne(
  "meeting",
  {
    weg_id: parkblickWegId,
    titel: "Ordentliche Eigentuemerversammlung 2026",
    modus: "hybrid",
    status: "laufend",
    termin_von: "2026-06-21T17:00:00+02:00",
    termin_bis: "2026-06-21T19:00:00+02:00",
    einladung_versand_am: "2026-05-29T09:00:00+02:00",
  },
  "Versammlung Parkblick 2026",
);

const parkblickTop1Id = await insertOne(
  "agenda_item",
  {
    meeting_id: parkblickMeetingId,
    position: 1,
    titel: "Dachwartung und Feuchtigkeitspruefung",
    beschreibung:
      "Angebot zur jaehrlichen Kontrolle der Dachhaut, Dachrinnen und Anschlussdetails nach dem Starkregenereignis im Mai.",
  },
  "TOP Dachwartung",
);

await insertOne(
  "agenda_item",
  {
    meeting_id: parkblickMeetingId,
    position: 2,
    titel: "Beiratsbudget fuer Kleinreparaturen",
    beschreibung:
      "Festlegung eines kleinen, nachvollziehbaren Budgets fuer eilbeduerftige Reparaturen im Gemeinschaftseigentum.",
  },
  "TOP Beiratsbudget",
);

const parkblickResolutionId = await insertOne(
  "resolution",
  {
    meeting_id: parkblickMeetingId,
    agenda_item_id: parkblickTop1Id,
    text:
      "Die Gemeinschaft beauftragt die Dachwartung 2026 bis zu einem Kostenrahmen von 3.500 EUR brutto. Die Verwaltung holt vor Beauftragung zwei Vergleichsangebote ein.",
    mehrheits_typ: "einfach",
    stimmprinzip: "wert",
  },
  "Beschlussvorlage Dachwartung",
);

const parkblickProxyId = await insertOne(
  "proxy",
  {
    meeting_id: parkblickMeetingId,
    vollmachtgeber_ownership_id: scenarios[0].ownershipIds[0],
    vollmachtnehmer_ownership_id: scenarios[0].ownershipIds[1],
    vollmachtnehmer_rolle: "eigentuemer",
    umfang: "top_spezifisch",
    tops: [parkblickTop1Id],
  },
  "Vollmacht TOP Dachwartung",
);

await insertOne(
  "vote",
  {
    resolution_id: parkblickResolutionId,
    ownership_id: scenarios[0].ownershipIds[0],
    wert: "ja",
    quelle: "praesenz",
    proxy_id: parkblickProxyId,
  },
  "Stimme Lea Sommer zur Dachwartung",
);

await insertOne(
  "vote",
  {
    resolution_id: parkblickResolutionId,
    ownership_id: scenarios[0].ownershipIds[1],
    wert: "enthaltung",
    quelle: "digital",
  },
  "Stimme Nils Berger zur Dachwartung",
);

await insertOne(
  "agent_suggestion",
  {
    meeting_id: parkblickMeetingId,
    weg_id: parkblickWegId,
    actor_type: "agent",
    vorschlag_typ: "bestimmtheits_check",
    payload: {
      titel: "Kostenrahmen ergaenzen",
      beschreibung:
        "Der Beschluss ist fachlich nachvollziehbar. Die KI empfiehlt, den Kostenrahmen und die Vergleichsangebote ausdruecklich im Beschlusstext zu belassen.",
      prioritaet: "mittel",
    },
    langgraph_thread_id: "demo-parkblick-dachwartung",
    langfuse_trace_id: "demo-trace-parkblick-001",
  },
  "KI-Vorschlag Parkblick",
);

const kanalhofMeetingId = await insertOne(
  "meeting",
  {
    weg_id: kanalhofWegId,
    titel: "Umlaufverfahren Wartungsvertrag 2026",
    modus: "umlauf",
    status: "entwurf",
    termin_von: "2026-07-15T12:00:00+02:00",
  },
  "Umlaufverfahren Kanalhof",
);

await insertOne(
  "agenda_item",
  {
    meeting_id: kanalhofMeetingId,
    position: 1,
    titel: "Wartungsvertrag Aufzug",
    beschreibung:
      "Abstimmung ueber einen zweijaehrigen Wartungsvertrag mit dokumentierten Reaktionszeiten und jaehrlicher Preisobergrenze.",
  },
  "TOP Aufzugwartung",
);

await insertOne(
  "wirtschaftsplan",
  {
    weg_id: kanalhofWegId,
    jahr: 2026,
    bezeichnung: "Wirtschaftsplan 2026 - Entwurf Ruecklagenfokus",
    gesamtkosten: 42800,
    status: "entwurf",
    version_nr: 1,
  },
  "Wirtschaftsplan Kanalhof 2026",
);

await insertOne(
  "document",
  {
    weg_id: kanalhofWegId,
    doc_typ: "doku",
    titel: "Angebot Aufzugwartung 2026 - Kurzablage",
  },
  "Dokument-Metadaten Aufzugwartung",
);

const speicherstadtMeetingId = await insertOne(
  "meeting",
  {
    weg_id: speicherstadtWegId,
    titel: "Kurzversammlung Instandhaltung Innenhof",
    modus: "praesenz",
    status: "beendet",
    termin_von: "2026-05-14T18:00:00+02:00",
    termin_bis: "2026-05-14T18:45:00+02:00",
    einladung_versand_am: "2026-04-18T10:00:00+02:00",
  },
  "Versammlung Speicherstadt Innenhof",
);

await insertOne(
  "agenda_item",
  {
    meeting_id: speicherstadtMeetingId,
    position: 1,
    titel: "Innenhofbeleuchtung erneuern",
    beschreibung:
      "Besprechung einer energiesparenden LED-Loesung fuer die Zugangswege im Innenhof und die Kellertreppe.",
  },
  "TOP Innenhofbeleuchtung",
);

await insertOne(
  "protocol",
  {
    meeting_id: speicherstadtMeetingId,
    status: "verwalter_revision",
    generierungs_quelle: "manuell",
    text:
      "# Kurzprotokoll\n\nDie Verwaltung stellte die Varianten zur Innenhofbeleuchtung vor. Die Eigentuemerversammlung bat um ein aktualisiertes Angebot mit Bewegungsmeldern.",
  },
  "Protokollentwurf Speicherstadt",
);

await insertOne(
  "wirtschaftsplan",
  {
    weg_id: speicherstadtWegId,
    jahr: 2026,
    bezeichnung: "Wirtschaftsplan 2026 - Entwurf Innenhof und Beleuchtung",
    gesamtkosten: 36500,
    status: "entwurf",
    version_nr: 1,
  },
  "Wirtschaftsplan Speicherstadt 2026",
);

console.log("\nFertig: 3 Demo-WEGs mit kompakten Daten fuer Stammdaten, Personen, Einheiten, Eigentum, Versammlung, TOPs, Abstimmung, KI-Vorschlag, Dokument-Metadaten, Protokoll und Finanzen angelegt.");
console.log("Hinweis: Beschluss-Sammlung, Dokument-Versionen, Sollstellungen und Audit-Events bleiben absichtlich historische/append-only Daten.");
