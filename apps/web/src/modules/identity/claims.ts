import { createClient } from "@/lib/supabase/server";

// Hook-injected claims live in the JWT, not in auth.users.raw_app_meta_data.
// getUser() returns the persistent row -> tenant_id/role would be missing.
// getClaims() verifies + decodes the access_token, so the Custom Access Token
// Hook output (docs/02 §2.4) is visible. Never read user_metadata for
// authorisation: that surface is client-mutable.

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export interface TenantClaims {
  tenantId: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
}

const EMPTY_CLAIMS: TenantClaims = {
  tenantId: null,
  role: null,
  email: null,
  phone: null,
};

export function readTenantClaims(claims: unknown): TenantClaims {
  if (!claims || typeof claims !== "object") return EMPTY_CLAIMS;

  const record = claims as Record<string, unknown>;
  const appMetadata =
    record.app_metadata && typeof record.app_metadata === "object"
      ? (record.app_metadata as Record<string, unknown>)
      : {};

  return {
    tenantId:
      typeof appMetadata.tenant_id === "string" ? appMetadata.tenant_id : null,
    role: typeof appMetadata.role === "string" ? appMetadata.role : null,
    email: typeof record.email === "string" ? record.email : null,
    phone: typeof record.phone === "string" ? record.phone : null,
  };
}

export interface TenantClaimsResult {
  claims: TenantClaims;
  error: Error | null;
}

export async function getTenantClaims(
  client?: ServerClient,
): Promise<TenantClaimsResult> {
  const supabase = client ?? (await createClient());
  const { data, error } = await supabase.auth.getClaims();
  return { claims: readTenantClaims(data?.claims), error: error ?? null };
}
