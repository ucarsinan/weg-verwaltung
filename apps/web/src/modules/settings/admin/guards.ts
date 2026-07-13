import { createClient } from "@/lib/supabase/server";

export interface AppMetadataClaims {
  tenant_id?: string;
  role?: string;
}

export type TenantAdminContext =
  | {
      ok: true;
      actorUserId: string;
      tenantId: string;
    }
  | {
      ok: false;
      message: string;
    };

export function readAppMetadata(value: unknown): AppMetadataClaims {
  if (!value || typeof value !== "object") return {};

  const record = value as Record<string, unknown>;
  return {
    tenant_id:
      typeof record.tenant_id === "string" ? record.tenant_id : undefined,
    role: typeof record.role === "string" ? record.role : undefined,
  };
}

export async function requireTenantAdmin(): Promise<TenantAdminContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, message: "Sie sind nicht angemeldet." };
  }

  const { data, error } = await supabase.auth.getClaims();
  if (error) {
    console.error("[settings-admin] getClaims failed:", error);
    return {
      ok: false,
      message: "JWT-Claims konnten nicht verifiziert werden.",
    };
  }

  const claims = data?.claims;
  const appMetadata = readAppMetadata(
    claims && typeof claims === "object"
      ? (claims as Record<string, unknown>).app_metadata
      : undefined,
  );

  if (!appMetadata.tenant_id) {
    return { ok: false, message: "Kein Mandant im aktuellen JWT-Claim." };
  }

  if (appMetadata.role !== "tenant_admin") {
    return {
      ok: false,
      message: "Nur Mandanten-Admins dürfen Benutzer verwalten.",
    };
  }

  return {
    ok: true,
    actorUserId: user.id,
    tenantId: appMetadata.tenant_id,
  };
}
