"use server";

import { createClient } from "@/lib/supabase/server";

export interface RegistrationState {
  status?: "success" | "error";
  message?: string;
  fieldErrors?: { email?: string; password?: string };
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emailRedirectTo(): string | undefined {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return undefined;

  try {
    return new URL("/auth/callback?next=/onboarding", appUrl).toString();
  } catch {
    return undefined;
  }
}

export async function registerAction(
  _previous: RegistrationState,
  formData: FormData,
): Promise<RegistrationState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const fieldErrors: RegistrationState["fieldErrors"] = {};

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
    options: { emailRedirectTo: emailRedirectTo() },
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
      "Prüfen Sie Ihr E-Mail-Postfach und bestätigen Sie Ihre Adresse. Danach richten Sie Ihre WEG ein.",
  };
}

