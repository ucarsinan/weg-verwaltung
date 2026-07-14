"use server";

import { createClient } from "@/lib/supabase/server";
import { getEmailProvider } from "@/modules/saas/email";
import { renderInvitationEmail } from "@/modules/saas/invitation-email";
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
  ): Promise<{ data: string | null; error: { message: string } | null }>;
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
  const { data: invitationId, error } = await invitationClient.rpc(
    "create_tenant_invitation",
    {
      p_email: email,
      p_role: role,
      p_token_hash: tokenHashBytea,
    },
  );

  if (error) {
    console.error("[invitation-actions] create_tenant_invitation failed:", error);
    return {
      status: "error",
      message:
        "Die Einladung konnte nicht erstellt werden. Bitte versuchen Sie es später erneut.",
    };
  }

  const url = invitationUrl(rawToken) ?? undefined;
  const roleLabel = TENANT_MEMBER_ROLE_LABELS[role];

  // Best-effort email: the invitation row and link already exist, so a failed
  // or unconfigured send never fails the invitation — the link is the fallback.
  let deliveryNote = `Einladungslink für ${email} (${roleLabel}) erstellt. Gültig 7 Tage.`;
  if (url) {
    const email_ = renderInvitationEmail({ invitationUrl: url, role });
    const result = await getEmailProvider().send(
      { to: email, subject: email_.subject, html: email_.html },
      invitationId ? { idempotencyKey: `einladung/${invitationId}` } : undefined,
    );

    if (result.status === "sent") {
      deliveryNote = `Einladung per E-Mail an ${email} gesendet. Der Link (unten) ist 7 Tage gültig.`;
    } else if (result.status === "disabled") {
      // Kein verifizierter Absender eingerichtet — das ist Konfiguration, keine
      // Stoerung. Entsprechend nicht als Fehlschlag melden.
      deliveryNote = `Einladungslink für ${email} (${roleLabel}) erstellt, gültig 7 Tage. Der E-Mail-Versand ist nicht eingerichtet — bitte teilen Sie den Link unten manuell.`;
    } else if (result.status === "error") {
      deliveryNote = `Link erstellt, aber der E-Mail-Versand ist fehlgeschlagen. Bitte teilen Sie den Link unten manuell.`;
    }
  }

  return {
    status: "success",
    message: deliveryNote,
    invitationUrl: url,
  };
}
