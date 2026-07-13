"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { hashInvitationToken } from "@/modules/saas/invitation";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENERIC_ACCEPT_ERROR =
  "Diese Einladung ist ungültig, abgelaufen oder nicht mehr verfügbar. Bitte fragen Sie eine neue Einladung an.";

export interface InvitationSignUpState {
  status?: "success" | "error";
  message?: string;
  fieldErrors?: { email?: string; password?: string };
}

export interface AcceptInvitationState {
  message?: string;
  fieldErrors?: { vorname?: string; nachname?: string };
}

interface AcceptInvitationRpcClient {
  rpc(
    name: "accept_tenant_invitation",
    args: {
      p_token_hash: string;
      p_vorname: string;
      p_nachname: string;
    },
  ): Promise<{ error: { message: string } | null }>;
}

function emailRedirectTo(token: string): string | undefined {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return undefined;

  try {
    return new URL(
      `/auth/callback?next=${encodeURIComponent(`/einladung/${token}`)}`,
      appUrl,
    ).toString();
  } catch {
    return undefined;
  }
}

export async function signUpForInvitationAction(
  token: string,
  _previous: InvitationSignUpState,
  formData: FormData,
): Promise<InvitationSignUpState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const fieldErrors: InvitationSignUpState["fieldErrors"] = {};

  if (!EMAIL_PATTERN.test(email) || email.length > 320) {
    fieldErrors.email = "Bitte geben Sie eine gültige E-Mail-Adresse ein.";
  }
  if (password.length < 12) {
    fieldErrors.password = "Das Passwort muss mindestens 12 Zeichen lang sein.";
  }
  if (fieldErrors.email || fieldErrors.password) {
    return {
      status: "error",
      message: "Bitte prüfen Sie Ihre Eingaben.",
      fieldErrors,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: emailRedirectTo(token) },
  });

  if (error) {
    return {
      status: "error",
      message:
        "Die Registrierung konnte nicht abgeschlossen werden. Bitte versuchen Sie es später erneut.",
    };
  }

  return {
    status: "success",
    message:
      "Prüfen Sie Ihr E-Mail-Postfach und bestätigen Sie Ihre Adresse. Danach nehmen Sie die Einladung hier an.",
  };
}

export async function acceptInvitationAction(
  token: string,
  _previous: AcceptInvitationState,
  formData: FormData,
): Promise<AcceptInvitationState> {
  const vorname = String(formData.get("vorname") ?? "").trim();
  const nachname = String(formData.get("nachname") ?? "").trim();
  const fieldErrors: AcceptInvitationState["fieldErrors"] = {};

  if (vorname.length < 1) {
    fieldErrors.vorname = "Vorname darf nicht leer sein.";
  } else if (vorname.length > 100) {
    fieldErrors.vorname = "Vorname darf höchstens 100 Zeichen lang sein.";
  }
  if (nachname.length < 1) {
    fieldErrors.nachname = "Nachname darf nicht leer sein.";
  } else if (nachname.length > 100) {
    fieldErrors.nachname = "Nachname darf höchstens 100 Zeichen lang sein.";
  }
  if (fieldErrors.vorname || fieldErrors.nachname) {
    return { message: "Bitte prüfen Sie Ihre Eingaben.", fieldErrors };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { message: "Bitte melden Sie sich erneut an." };

  const invitationClient = supabase as unknown as AcceptInvitationRpcClient;
  const { error } = await invitationClient.rpc("accept_tenant_invitation", {
    p_token_hash: hashInvitationToken(token),
    p_vorname: vorname,
    p_nachname: nachname,
  });

  if (error) {
    return { message: GENERIC_ACCEPT_ERROR };
  }

  await supabase.auth.refreshSession();
  redirect("/dashboard");
}
