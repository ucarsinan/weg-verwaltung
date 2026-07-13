"use server";

import { createClient } from "@/lib/supabase/server";
import { generateInvitationToken } from "@/modules/saas/invitation";
import { requireTenantAdmin } from "@/modules/settings/admin/guards";
import {
  isTenantInvitationRole,
  TENANT_MEMBER_ROLE_LABELS,
  type TenantInvitationRole,
  type TenantInvitationState,
} from "@/modules/settings/admin/types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface TenantInvitationRpcClient {
  rpc(
    name: "create_tenant_invitation",
    args: {
      p_email: string;
      p_role: string;
      p_token_hash: string;
    },
  ): Promise<{ error: { message: string } | null }>;
}

function invitationUrl(rawToken: string): string | null {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return null;

  try {
    return new URL(`/einladung/${rawToken}`, appUrl).toString();
  } catch {
    console.error("[invitation-actions] invalid NEXT_PUBLIC_APP_URL:", appUrl);
    return null;
  }
}

export async function createTenantInvitationAction(
  _prevState: TenantInvitationState,
  formData: FormData,
): Promise<TenantInvitationState> {
  const context = await requireTenantAdmin();
  if (!context.ok) return { status: "error", message: context.message };

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const roleValue = formData.get("role");
  const fieldErrors: TenantInvitationState["fieldErrors"] = {};

  if (!email || email.length > 320 || !EMAIL_PATTERN.test(email)) {
    fieldErrors.email = "Bitte eine gültige E-Mail-Adresse eintragen.";
  }
  if (!isTenantInvitationRole(roleValue)) {
    fieldErrors.role = "Bitte eine gültige Rolle auswählen.";
  }
  if (fieldErrors.email || fieldErrors.role) {
    return {
      status: "error",
      message: "Die Einladung konnte nicht vorbereitet werden.",
      fieldErrors,
    };
  }
  const role = roleValue as TenantInvitationRole;

  if (!process.env.NEXT_PUBLIC_APP_URL) {
    return {
      status: "error",
      message:
        "Der Einladungslink konnte nicht erstellt werden. NEXT_PUBLIC_APP_URL ist nicht konfiguriert.",
    };
  }

  const { rawToken, tokenHashBytea } = generateInvitationToken();

  const supabase = await createClient();
  const invitationClient = supabase as unknown as TenantInvitationRpcClient;
  const { error } = await invitationClient.rpc("create_tenant_invitation", {
    p_email: email,
    p_role: role,
    p_token_hash: tokenHashBytea,
  });

  if (error) {
    console.error("[invitation-actions] create_tenant_invitation failed:", error);
    return {
      status: "error",
      message:
        "Die Einladung konnte nicht erstellt werden. Bitte versuchen Sie es später erneut.",
    };
  }

  return {
    status: "success",
    message: `Einladungslink für ${email} (${TENANT_MEMBER_ROLE_LABELS[role]}) erstellt. Gültig 7 Tage.`,
    invitationUrl: invitationUrl(rawToken) ?? undefined,
  };
}
