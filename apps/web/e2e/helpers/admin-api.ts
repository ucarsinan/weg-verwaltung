import { createClient } from "@supabase/supabase-js";

// Service-role bootstrap for E2E-only test accounts. Mirrors the Admin-API
// pattern scripts/seed-admin.mjs already uses in this suite
// (`email_confirm: true`) — the only way to bridge a real Supabase Auth
// email-confirmation gate in a headless browser run, since there is no
// inbox to click a link from. Never used for anything but throwaway
// e2e-*@example.test accounts created and torn down within a single spec.

function requiredEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  throw new Error(
    `Missing env: one of ${names.join(", ")} is required for e2e Admin-API bootstrap (see .env.local).`,
  );
}

function adminClient() {
  const url = requiredEnv("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL");
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY");
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Creates a pre-confirmed auth user, bypassing the real email-confirmation
 * click. Idempotent-ish: if the email already exists, resets its password
 * and re-confirms it (same recovery path as seed-admin.mjs).
 */
export async function createConfirmedTestUser(
  email: string,
  password: string,
): Promise<string> {
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (!error) return data.user.id;
  if (!/already.*registered|already exists/i.test(error.message)) throw error;

  const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (listError) throw listError;
  const existing = list.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
  if (!existing) throw new Error(`user ${email} reported as existing but not found in listUsers()`);

  const { error: updateError } = await admin.auth.admin.updateUserById(existing.id, {
    password,
    email_confirm: true,
  });
  if (updateError) throw updateError;
  return existing.id;
}
