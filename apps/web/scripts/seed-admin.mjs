#!/usr/bin/env node
// One-off seed: create a tenant + tenant_admin user via the Supabase Admin API.
//
// Usage:
//   node apps/web/scripts/seed-admin.mjs [email] [password] [tenantName] [role]
// Defaults: admin@admin.com / admin1 / "Default WEG-Verwaltung"
//
// Reads .env.local from apps/web/ (and falls back to repo root). Requires either
// SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY (new sb_secret_… format).
//
// Idempotent: if the email already exists, the tenant_member row is upserted
// against the existing auth user.

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
const serviceKey =
  env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;

if (!url || !serviceKey) {
  console.error(
    "Missing env: need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY).",
  );
  console.error("Checked: ", resolve(repoRoot, ".env.local"), "and", resolve(webDir, ".env.local"));
  process.exit(1);
}

const [, , emailArg, passwordArg, tenantNameArg, roleArg] = process.argv;
const email = emailArg || "admin@admin.com";
const password = passwordArg || "admin1";
const tenantName = tenantNameArg || "Default WEG-Verwaltung";
const role = roleArg || "tenant_admin";
const allowedRoles = new Set(["tenant_admin", "verwalter_mitarbeiter"]);

if (!allowedRoles.has(role)) {
  console.error(
    `Invalid role "${role}". Expected one of: ${Array.from(allowedRoles).join(", ")}`,
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log(`→ Target: ${url}`);
console.log(`→ Email:  ${email}`);
console.log(`→ Tenant: ${tenantName}`);
console.log(`→ Role:   ${role}`);

// 1) Create or reuse the auth user.
let userId;
{
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) {
    if (!/already.*registered|already exists/i.test(error.message)) throw error;
    console.log("  user exists — looking up…");
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 200 });
    if (listErr) throw listErr;
    const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!existing) throw new Error(`user ${email} reported as existing but not found in listUsers()`);
    userId = existing.id;
    const { error: updateErr } = await admin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });
    if (updateErr) throw updateErr;
    console.log("  password reset for existing user");
  } else {
    userId = data.user.id;
  }
  console.log(`✓ user_id = ${userId}`);
}

// 2) Tenant — reuse if a row with the same name already exists, else create.
let tenantId;
{
  const { data: existing, error: selErr } = await admin
    .from("tenant")
    .select("id")
    .eq("name", tenantName)
    .limit(1)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing) {
    tenantId = existing.id;
    console.log(`  tenant exists — reusing ${tenantId}`);
  } else {
    const { data, error } = await admin
      .from("tenant")
      .insert({ name: tenantName })
      .select("id")
      .single();
    if (error) throw error;
    tenantId = data.id;
    console.log(`✓ tenant_id = ${tenantId}`);
  }
}

// 3) Membership with role — upsert against (tenant_id, user_id).
{
  const { error } = await admin
    .from("tenant_member")
    .upsert(
      { tenant_id: tenantId, user_id: userId, role },
      { onConflict: "tenant_id,user_id" },
    );
  if (error) throw error;
  console.log(`✓ tenant_member upserted (role=${role})`);
}

console.log("\nDone. Sign in with:");
console.log(`  email:    ${email}`);
console.log(`  password: ${password}`);
