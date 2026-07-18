import { createClient } from "@/lib/supabase/server";
import { getTenantClaims } from "./claims";

export type TenantContext =
  | {
      ok: true;
      userId: string;
      tenantId: string;
      role: string | null;
    }
  | {
      ok: false;
      message: string;
    };

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

export async function requireTenantContext(): Promise<TenantContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, message: "Sie sind nicht angemeldet." };
  }

  const { claims, error } = await getTenantClaims(supabase);
  if (error) {
    console.error("[identity] getClaims failed:", error);
    return {
      ok: false,
      message: "JWT-Claims konnten nicht verifiziert werden.",
    };
  }

  if (!claims.tenantId) {
    return { ok: false, message: "Kein Mandant im aktuellen JWT-Claim." };
  }

  return {
    ok: true,
    userId: user.id,
    tenantId: claims.tenantId,
    role: claims.role,
  };
}

export async function requireTenantAdmin(): Promise<TenantAdminContext> {
  const context = await requireTenantContext();
  if (!context.ok) return context;

  if (context.role !== "tenant_admin") {
    return {
      ok: false,
      message: "Nur Mandanten-Admins dürfen Benutzer verwalten.",
    };
  }

  return { ok: true, actorUserId: context.userId, tenantId: context.tenantId };
}
