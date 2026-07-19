"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenantAdmin } from "@/modules/identity";
import { normalizeRequiredText } from "@/modules/settings/shared";

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

export interface AdminFormState {
  success?: string;
  errors?: {
    _form?: string[];
    email?: string[];
    role?: string[];
    name?: string[];
    user_id?: string[];
  };
}

async function verifyLiveTenantAdmin(
  admin: AdminClient,
  session: { actorUserId: string; tenantId: string },
) {
  const { data, error } = await admin
    .from("tenant_member")
    .select("id")
    .eq("tenant_id", session.tenantId)
    .eq("user_id", session.actorUserId)
    .eq("role", "tenant_admin")
    .maybeSingle();

  if (error) {
    console.error("[settings] live tenant_admin check failed:", error);
    return "Admin-Berechtigung konnte nicht geprüft werden.";
  }

  if (!data) {
    return "Ihre Admin-Berechtigung ist nicht mehr aktiv. Bitte melden Sie sich erneut an.";
  }

  return null;
}

export async function updateTenantNameAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const name = normalizeRequiredText(formData.get("name"));
  if (!name) return { errors: { name: ["Bitte einen Namen eingeben."] } };
  if (name.length > 120) return { errors: { name: ["Name ist zu lang."] } };

  const session = await requireTenantAdmin();
  if (!session.ok) return { errors: { _form: ["Keine Berechtigung."] } };

  const admin = createAdminClient();
  if (!admin) {
    return { errors: { _form: ["Admin-Konfiguration fehlt."] } };
  }
  const liveAdminError = await verifyLiveTenantAdmin(admin, session);
  if (liveAdminError) {
    return { errors: { _form: [liveAdminError] } };
  }

  const { error } = await admin
    .from("tenant")
    .update({ name })
    .eq("id", session.tenantId);

  if (error) {
    console.error("[settings] tenant update failed:", error);
    return { errors: { _form: ["Mandant konnte nicht gespeichert werden."] } };
  }

  revalidatePath("/einstellungen");
  return { success: "Mandant gespeichert." };
}
