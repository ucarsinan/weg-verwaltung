#!/usr/bin/env node
// Executes the same cleanup logic as cleanup-e2e-residue.sql, via PostgREST
// (using the service_role key) instead of raw SQL — this environment has no
// direct SQL-execution access to the Cloud project, only REST.
//
// Usage:
//   node apps/web/scripts/cleanup-e2e-residue.mjs             # dry run, prints counts only
//   node apps/web/scripts/cleanup-e2e-residue.mjs --execute    # actually deletes
//
// Safety properties preserved from the .sql script:
//   - Every table that's always safe to bulk-delete (never blocked by the
//     beschluss_sammlung_entry append-only trigger) is deleted in one batched
//     request per table, scoped to the matched weg ids.
//   - `meeting` and `weg` themselves are deleted ONE ROW AT A TIME: a bulk
//     DELETE ... WHERE id IN (...) is a single transaction in PostgREST — if
//     ANY row in that batch is blocked, the ENTIRE batch rolls back and
//     nothing is deleted. Doing it per-row means a stuck WEG (one that still
//     has a Beschlussvorlage) is skipped and reported, while every other WEG
//     in the batch is still cleaned.
//   - `person` rows are deliberately left untouched (tenant-scoped, not
//     weg-scoped — see cleanup-e2e-residue.sql's header for why).
//
// Reads .env.local the same way seed-admin.mjs / cleanup-e2e-users.mjs do.
//
// RESULT OF THE 2026-07-15 EXECUTION (see docs/agent-reports/2026-07-14-
// worker-general-cloud-e2e-first-run.md for the full account): 305 of 636
// matched weg rows were deleted; 331 remain and are PERMANENTLY undeletable
// via service_role — not a script limitation, confirmed deliberate DB
// hardening:
//   - `sollstellung`, `verteilungsschluessel`: DELETE revoked from every
//     role including service_role (0040_lock_down_sollstellung_writes.sql).
//     42501 permission denied, not retryable.
//   - `unit`: a CHECK/trigger rejects deletion once it has posted
//     Sollstellungen ("Create a Nachtragswirtschaftsplan/correction instead
//     of rewriting history").
//   - `vote`: a trigger rejects deletion once its resolution has been
//     festgestellt ("Votes cannot be inserted, changed, or deleted after the
//     resolution has been festgestellt") — this is the Vote/Resolution/
//     BeschlussSammlungEntry/Protocol immutability invariant from AGENTS.md
//     working exactly as designed, just discovered here via a bulk-delete
//     attempt rather than the app UI.
//   - `beschluss_sammlung_entry`: append-only trigger, rejects all
//     UPDATE/DELETE/TRUNCATE unconditionally (already known before this run).
// Any WEG whose E2E test path activated a Wirtschaftsplan, posted
// Sollstellungen, festgestellt a resolution, or created a Beschlussvorlage
// is therefore permanently stuck by design. Re-running this script is safe
// (idempotent) but will not clean further than this without actual Postgres
// superuser/table-owner access (e.g. Supabase Studio's SQL Editor), which
// bypasses GRANT/REVOKE but not the trigger-based protections above.

import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(__dirname, "..");
const repoRoot = resolve(webDir, "..", "..");

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
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const EXECUTE = process.argv.includes("--execute");

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
};

async function rest(path, options = {}) {
  const res = await fetch(`${url}/rest/v1/${path}`, { headers, ...options });
  if (!res.ok && res.status !== 406) {
    const body = await res.text().catch(() => "");
    const table = path.split("?")[0];
    const err = new Error(`${options.method ?? "GET"} ${table} -> ${res.status}: ${body}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

function inList(ids) {
  return `(${ids.map((id) => `"${id}"`).join(",")})`;
}

// 636 UUIDs in one query string blows PostgREST's URL length limit (400 Bad
// Request). Chunk every id-list operation instead.
const CHUNK_SIZE = 80;
function chunks(arr, size = CHUNK_SIZE) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function selectChunked(table, column, ids, selectCols = "id") {
  const out = [];
  for (const chunk of chunks(ids)) {
    const rows = await rest(`${table}?select=${selectCols}&${column}=in.${inList(chunk)}`);
    out.push(...rows);
  }
  return out;
}

async function deleteChunked(table, column, ids) {
  for (const chunk of chunks(ids)) {
    await rest(`${table}?${column}=in.${inList(chunk)}`, { method: "DELETE" });
  }
}

const NAME_PATTERNS = [
  "Cross %",
  "Scenario %",
  "E2E Finz %",
  "WEG Lindenhof %",
  "WEG E2E %",
  "RLS Fixture %",
  "E2E %",
];

console.log(`→ Target: ${url}`);
console.log(`→ Mode:   ${EXECUTE ? "EXECUTE (will delete)" : "dry run (no changes)"}\n`);

// 1) Collect every matching weg id (dedup — 'E2E %' subsumes 'E2E Finz %').
const wegIdSet = new Map(); // id -> name
for (const pattern of NAME_PATTERNS) {
  const rows = await rest(
    `weg?select=id,name&name=like.${encodeURIComponent(pattern)}`,
  );
  for (const row of rows) wegIdSet.set(row.id, row.name);
}
const wegIds = [...wegIdSet.keys()];
console.log(`Matched ${wegIds.length} weg row(s) across all known E2E name prefixes.`);

if (wegIds.length === 0) {
  console.log("Nothing to clean on the weg side.");
} else if (!EXECUTE) {
  console.log("Dry run — stopping before any delete. Re-run with --execute to proceed.");
} else {

  // 2) Bulk-delete everything that's never blocked. Each step is wrapped
  // defensively: 0040_lock_down_sollstellung_writes.sql revokes INSERT/
  // UPDATE/DELETE on `sollstellung` from EVERY role including service_role
  // (deliberate finance-history hardening, not a bug) — discovered live
  // against Cloud, not predicted by the .sql script this mirrors. Table-wide
  // privilege errors (42501) can't be retried per-row like an FK/trigger
  // block can, so they're caught once and the step is marked categorically
  // blocked rather than retried per chunk.
  console.log("\n--- Phase 1: bulk-delete safe children (chunked, 80 ids/request) ---");

  const plans = await selectChunked("wirtschaftsplan", "weg_id", wegIds);
  let sollstellungBlocked = false;
  if (plans.length > 0) {
    try {
      await deleteChunked("sollstellung", "wirtschaftsplan_id", plans.map((p) => p.id));
      console.log(`  sollstellung: deleted rows for ${plans.length} plan(s)`);
    } catch (err) {
      sollstellungBlocked = true;
      console.log(`  sollstellung: BLOCKED — service_role has no DELETE grant (0040_lock_down_sollstellung_writes.sql). ${err.message.slice(0, 120)}`);
    }
  }

  // wirtschaftsplan per-row, not bulk: if sollstellung rows survive (blocked
  // above), the FK (on delete restrict) will reject exactly those plans —
  // a chunked bulk delete would roll back the whole chunk for one blocked
  // row; per-row isolates it to just that plan.
  console.log("  wirtschaftsplan: per-row delete (isolates plans still holding an undeletable sollstellung)...");
  let plansCleaned = 0;
  let plansSkipped = 0;
  for (const plan of plans) {
    try {
      await rest(`wirtschaftsplan?id=eq.${plan.id}`, { method: "DELETE" });
      plansCleaned += 1;
    } catch (err) {
      plansSkipped += 1;
    }
  }
  console.log(`  wirtschaftsplan: ${plansCleaned} cleaned, ${plansSkipped} skipped`);

  async function bulkStep(label, fn) {
    try {
      await fn();
      console.log(`  ${label}: deleted`);
    } catch (err) {
      console.log(`  ${label}: BLOCKED — ${err.message.slice(0, 220)}`);
    }
  }

  await bulkStep("verteilungsschluessel", () => deleteChunked("verteilungsschluessel", "weg_id", wegIds));
  await bulkStep("document", () => deleteChunked("document", "weg_id", wegIds));

  const vorgaenge = await selectChunked("vorgang", "weg_id", wegIds);
  if (vorgaenge.length > 0) {
    await bulkStep("vorgang_inbox_item", () => deleteChunked("vorgang_inbox_item", "vorgang_id", vorgaenge.map((v) => v.id)));
  }
  await bulkStep("vorgang", () => deleteChunked("vorgang", "weg_id", wegIds));

  const meetings = await selectChunked("meeting", "weg_id", wegIds);
  if (meetings.length > 0) {
    const meetingIds = meetings.map((m) => m.id);
    // vote has no meeting_id column — it hangs off resolution_id (and
    // ownership_id, per the "vote references ownership_id" invariant).
    // Confirmed via 0004_versammlung.sql after the first pass's `vote`/
    // `resolution` attempts failed: vote must be deleted before resolution
    // (vote_resolution_fk, on delete restrict), which was blocking both
    // resolution AND ownership (vote_ownership_fk) in the first pass.
    const resolutions = await selectChunked("resolution", "meeting_id", meetingIds);
    if (resolutions.length > 0) {
      await bulkStep("vote", () => deleteChunked("vote", "resolution_id", resolutions.map((r) => r.id)));
    }
    await bulkStep("resolution", () => deleteChunked("resolution", "meeting_id", meetingIds));
    // The TOP (Tagesordnungspunkt) table is actually named `agenda_item`, not
    // `top` — confirmed via 0004_versammlung.sql. The wrong name 404'd
    // silently in the first pass, so agenda_item rows were never cleared.
    await bulkStep("agenda_item", () => deleteChunked("agenda_item", "meeting_id", meetingIds));
    await bulkStep("protocol", () => deleteChunked("protocol", "meeting_id", meetingIds));
  }

  const units = await selectChunked("unit", "weg_id", wegIds);
  if (units.length > 0) {
    await bulkStep("ownership", () => deleteChunked("ownership", "unit_id", units.map((u) => u.id)));
  }
  await bulkStep("unit", () => deleteChunked("unit", "weg_id", wegIds));

  // 3) Per-row: meeting, then weg. Each request isolated — a stuck row only
  // blocks itself (beschluss_sammlung_entry's trigger, not an FK, so this
  // still surfaces as a 409/500 from PostgREST, caught and logged below).
  console.log("\n--- Phase 2: per-row meeting cleanup (skips WEGs with a Beschlussvorlage) ---");
  let meetingsCleaned = 0;
  let meetingsSkipped = 0;
  for (const meeting of meetings) {
    try {
      await rest(`meeting?id=eq.${meeting.id}`, { method: "DELETE" });
      meetingsCleaned += 1;
    } catch (err) {
      meetingsSkipped += 1;
    }
  }
  console.log(`  meetings: ${meetingsCleaned} cleaned, ${meetingsSkipped} skipped (append-only Beschlussvorlage attached)`);

  console.log("\n--- Phase 3: per-row weg cleanup ---");
  let wegsCleaned = 0;
  let wegsSkipped = 0;
  const skippedNames = [];
  for (const id of wegIds) {
    try {
      await rest(`weg?id=eq.${id}`, { method: "DELETE" });
      wegsCleaned += 1;
    } catch (err) {
      wegsSkipped += 1;
      skippedNames.push(wegIdSet.get(id));
    }
  }
  console.log(`  wegs: ${wegsCleaned} cleaned, ${wegsSkipped} skipped`);
  if (skippedNames.length > 0) {
    console.log(`  skipped (left intact — still has an undeleted meeting and/or wirtschaftsplan${sollstellungBlocked ? "; sollstellung lockdown means any WEG with an activated plan is stuck this way" : ""}): ${skippedNames.slice(0, 10).join(", ")}${skippedNames.length > 10 ? ` … and ${skippedNames.length - 10} more` : ""}`);
  }
}

// 4) Orphaned SaaS-onboarding tenants.
console.log("\n--- Phase 4: orphaned E2E tenants ---");
const tenants = await rest(`tenant?select=id,name&name=like.${encodeURIComponent("E2E Gemeinschaft %")}`);
console.log(`Matched ${tenants.length} tenant row(s).`);
if (tenants.length === 0) {
  console.log("Nothing to clean on the tenant side.");
} else if (!EXECUTE) {
  console.log("Dry run — not deleting tenants either.");
} else {
  let tenantsCleaned = 0;
  let tenantsSkipped = 0;
  for (const t of tenants) {
    try {
      await rest(`tenant_member?tenant_id=eq.${t.id}`, { method: "DELETE" });
      await rest(`tenant?id=eq.${t.id}`, { method: "DELETE" });
      tenantsCleaned += 1;
    } catch (err) {
      tenantsSkipped += 1;
    }
  }
  console.log(`  tenants: ${tenantsCleaned} cleaned, ${tenantsSkipped} skipped (still owns an undeleted weg)`);
}

console.log("\nDone.");
