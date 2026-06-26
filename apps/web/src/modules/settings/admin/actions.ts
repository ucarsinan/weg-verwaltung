"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import {
  isTenantMemberRole,
  TENANT_MEMBER_ROLE_LABELS,
  type AdminUserActionState,
  type TenantMemberRole,
} from "@/modules/settings/admin/types";

type TenantMemberRow = Database["public"]["Tables"]["tenant_member"]["Row"];
type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

interface AppMetadataClaims {
  tenant_id?: string;
  role?: string;
}

type TenantAdminContext =
  | {
      ok: true;
      actorUserId: string;
      tenantId: string;
    }
  | {
      ok: false;
      message: string;
    };

const SETTINGS_PATH = "/einstellungen";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readAppMetadata(value: unknown): AppMetadataClaims {
  if (!value || typeof value !== "object") return {};

  const record = value as Record<string, unknown>;
  return {
    tenant_id:
      typeof record.tenant_id === "string" ? record.tenant_id : undefined,
    role: typeof record.role === "string" ? record.role : undefined,
  };
}

async function requireTenantAdmin(): Promise<TenantAdminContext> {
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

function adminUnavailableState(): AdminUserActionState {
  return {
    status: "error",
    message:
      "Benutzerverwaltung ist serverseitig deaktiviert: SUPABASE_SERVICE_ROLE_KEY oder SUPABASE_SECRET_KEY fehlt.",
  };
}

function getInviteRedirectUrl(): string | undefined {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return undefined;

  try {
    return new URL("/login", appUrl).toString();
  } catch {
    console.error("[settings-admin] invalid NEXT_PUBLIC_APP_URL:", appUrl);
    return undefined;
  }
}

function readRole(formData: FormData): TenantMemberRole | null {
  const role = formData.get("role");
  return isTenantMemberRole(role) ? role : null;
}

function formatRole(role: TenantMemberRole): string {
  return TENANT_MEMBER_ROLE_LABELS[role];
}

async function verifyLiveTenantAdmin(
  admin: AdminClient,
  context: Extract<TenantAdminContext, { ok: true }>,
): Promise<AdminUserActionState | null> {
  const { data, error } = await admin
    .from("tenant_member")
    .select("id")
    .eq("tenant_id", context.tenantId)
    .eq("user_id", context.actorUserId)
    .eq("role", "tenant_admin")
    .maybeSingle();

  if (error) {
    console.error("[settings-admin] live tenant_admin check failed:", error);
    return {
      status: "error",
      message: "Admin-Berechtigung konnte nicht geprüft werden.",
    };
  }

  if (!data) {
    return {
      status: "error",
      message:
        "Ihre Admin-Berechtigung ist nicht mehr aktiv. Bitte melden Sie sich erneut an.",
    };
  }

  return null;
}

export async function inviteTenantUserAction(
  _prevState: AdminUserActionState,
  formData: FormData,
): Promise<AdminUserActionState> {
  const context = await requireTenantAdmin();
  if (!context.ok) return { status: "error", message: context.message };

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const role = readRole(formData);
  const fieldErrors: AdminUserActionState["fieldErrors"] = {};

  if (!email || email.length > 320 || !EMAIL_PATTERN.test(email)) {
    fieldErrors.email = "Bitte eine gültige E-Mail-Adresse eintragen.";
  }
  if (!role) {
    fieldErrors.role = "Bitte eine gültige Rolle auswählen.";
  }
  if (fieldErrors.email || fieldErrors.role) {
    return {
      status: "error",
      message: "Die Einladung konnte nicht vorbereitet werden.",
      fieldErrors,
    };
  }
  const validRole = role as TenantMemberRole;

  const admin = createAdminClient();
  if (!admin) return adminUnavailableState();
  const liveAdminError = await verifyLiveTenantAdmin(admin, context);
  if (liveAdminError) return liveAdminError;

  const redirectTo = getInviteRedirectUrl();
  const { data: inviteData, error: inviteError } =
    await admin.auth.admin.inviteUserByEmail(
      email,
      redirectTo ? { redirectTo } : undefined,
    );

  const invitedUserId = inviteData.user?.id;
  if (inviteError || !invitedUserId) {
    console.error("[settings-admin] inviteUserByEmail failed:", inviteError);
    return {
      status: "error",
      message:
        "Die Einladung konnte nicht erstellt werden. Ist die E-Mail eventuell bereits registriert?",
    };
  }

  const { error: memberError } = await admin.from("tenant_member").insert({
    tenant_id: context.tenantId,
    user_id: invitedUserId,
    role: validRole,
  });

  if (memberError) {
    console.error("[settings-admin] tenant_member insert failed:", memberError);
    const { error: rollbackError } =
      await admin.auth.admin.deleteUser(invitedUserId);
    if (rollbackError) {
      console.error("[settings-admin] invite rollback failed:", rollbackError);
    }
    return {
      status: "error",
      message:
        "Die Einladung wurde erstellt, aber die Mandantenrolle konnte nicht gespeichert werden. Bitte Admin-Daten prüfen.",
    };
  }

  revalidatePath(SETTINGS_PATH);
  return {
    status: "success",
    message: `Einladung für ${email} wurde mit Rolle ${formatRole(validRole)} angelegt.`,
  };
}

export async function updateTenantUserRoleAction(
  _prevState: AdminUserActionState,
  formData: FormData,
): Promise<AdminUserActionState> {
  const context = await requireTenantAdmin();
  if (!context.ok) return { status: "error", message: context.message };

  const memberId = String(formData.get("memberId") ?? "").trim();
  const role = readRole(formData);
  const fieldErrors: AdminUserActionState["fieldErrors"] = {};

  if (!memberId) {
    fieldErrors.memberId = "Mitgliedschaft fehlt.";
  }
  if (!role) {
    fieldErrors.role = "Bitte eine gültige Rolle auswählen.";
  }
  if (fieldErrors.memberId || fieldErrors.role) {
    return {
      status: "error",
      message: "Die Rolle konnte nicht aktualisiert werden.",
      fieldErrors,
    };
  }
  const validRole = role as TenantMemberRole;

  const admin = createAdminClient();
  if (!admin) return adminUnavailableState();
  const liveAdminError = await verifyLiveTenantAdmin(admin, context);
  if (liveAdminError) return liveAdminError;

  const { data: member, error: memberError } = await admin
    .from("tenant_member")
    .select("*")
    .eq("id", memberId)
    .eq("tenant_id", context.tenantId)
    .maybeSingle<TenantMemberRow>();

  if (memberError || !member) {
    console.error("[settings-admin] tenant_member lookup failed:", memberError);
    return {
      status: "error",
      message: "Diese Mitgliedschaft gehört nicht zum aktuellen Mandanten.",
    };
  }

  if (member.user_id === context.actorUserId && validRole !== "tenant_admin") {
    return {
      status: "error",
      message: "Die eigene Mandanten-Admin-Rolle kann hier nicht entzogen werden.",
    };
  }

  if (member.role === validRole) {
    return {
      status: "success",
      message: "Die Rolle war bereits unverändert.",
    };
  }

  if (member.role === "tenant_admin" && validRole !== "tenant_admin") {
    const { count, error: countError } = await admin
      .from("tenant_member")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", context.tenantId)
      .eq("role", "tenant_admin");

    if (countError) {
      console.error("[settings-admin] tenant_admin count failed:", countError);
      return {
        status: "error",
        message: "Admin-Schutz konnte nicht geprüft werden.",
      };
    }

    if ((count ?? 0) <= 1) {
      return {
        status: "error",
        message: "Der letzte Mandanten-Admin kann nicht herabgestuft werden.",
      };
    }
  }

  const { error: updateError } = await admin
    .from("tenant_member")
    .update({ role: validRole })
    .eq("id", member.id)
    .eq("tenant_id", context.tenantId);

  if (updateError) {
    console.error("[settings-admin] tenant_member update failed:", updateError);
    return {
      status: "error",
      message: "Die Rolle konnte nicht gespeichert werden.",
    };
  }

  revalidatePath(SETTINGS_PATH);
  return {
    status: "success",
    message: `Rolle wurde auf ${formatRole(validRole)} geändert. Bestehende Sitzungen sehen die Änderung erst nach Token-Erneuerung.`,
  };
}
