#!/usr/bin/env node
// Cleanup for E2E-generated Supabase Auth users (Cloud Frankfurt).
//
// DESIGNED, NOT EXECUTED. Written for review after the 2026-07-14 Cloud E2E
// session — no agent has run this against Cloud. Defaults to a dry run; only
// deletes when passed --execute.
//
// Usage:
//   node apps/web/scripts/cleanup-e2e-users.mjs             # dry run, lists matches
//   node apps/web/scripts/cleanup-e2e-users.mjs --execute    # actually deletes
//
// Matches auth.users whose email starts with "e2e-" AND ends in "@example.test"
// (the pattern every e2e/*.spec.ts + e2e/helpers/admin-api.ts test-user
// creator uses). Never touches the two persistent seed fixtures, even if a
// future pattern change would otherwise match them — belt and suspenders.
//
// Reads .env.local from apps/web/ (and falls back to repo root), same as
// seed-admin.mjs. Requires SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY.

import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

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
  console.error(
    "Missing env: need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY).",
  );
  process.exit(1);
}

const EXECUTE = process.argv.includes("--execute");

// Never delete these regardless of what the pattern below matches — they are
// the persistent fixtures every e2e run (and just about everything in this
// Cloud project) depends on. See e2e/auth.setup.ts.
const NEVER_DELETE = new Set(["admin@admin.com", "tenant_b@admin.com"]);

const MATCH_PATTERN = /^e2e-.*@example\.test$/i;

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log(`→ Target: ${url}`);
console.log(`→ Mode:   ${EXECUTE ? "EXECUTE (will delete)" : "dry run (no changes)"}`);
console.log(`→ Pattern: ${MATCH_PATTERN} (excluding: ${[...NEVER_DELETE].join(", ")})`);
console.log();

// listUsers() is paginated; walk every page rather than trusting perPage to
// cover everything in one call.
const matches = [];
let page = 1;
for (;;) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw error;
  if (data.users.length === 0) break;
  for (const user of data.users) {
    const email = user.email?.toLowerCase() ?? "";
    if (NEVER_DELETE.has(email)) continue;
    if (MATCH_PATTERN.test(email)) {
      matches.push({ id: user.id, email: user.email, created_at: user.created_at });
    }
  }
  if (data.users.length < 200) break;
  page += 1;
}

matches.sort((a, b) => a.created_at.localeCompare(b.created_at));

console.log(`Found ${matches.length} matching user(s):`);
for (const m of matches) {
  console.log(`  ${m.created_at}  ${m.email}  (${m.id})`);
}

if (!EXECUTE) {
  console.log("\nDry run only — nothing deleted. Re-run with --execute to delete these.");
  process.exit(0);
}

if (matches.length === 0) {
  console.log("\nNothing to delete.");
  process.exit(0);
}

console.log("\nDeleting…");
let deleted = 0;
let failed = 0;
for (const m of matches) {
  const { error } = await admin.auth.admin.deleteUser(m.id);
  if (error) {
    failed += 1;
    console.error(`  ✗ ${m.email}: ${error.message}`);
  } else {
    deleted += 1;
    console.log(`  ✓ ${m.email}`);
  }
}
console.log(`\nDone: ${deleted} deleted, ${failed} failed.`);
