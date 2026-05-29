"use server";

import { redirect } from "next/navigation";
import type { Route } from "next";
import { createClient } from "@/lib/supabase/server";

export interface LoginState {
  error?: string;
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/dashboard");

  if (!email || !password) {
    return { error: "Bitte E-Mail und Passwort eingeben." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Generic message — no enumeration of valid emails.
    return { error: "Anmeldung fehlgeschlagen. Bitte Eingaben prüfen." };
  }

  // `next` is a URL string from the form, validated to start with "/".
  // typedRoutes wants a branded Route; a runtime-validated relative path
  // is safe to cast.
  redirect((next.startsWith("/") ? next : "/dashboard") as Route);
}
