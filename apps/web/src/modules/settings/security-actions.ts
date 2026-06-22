"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizeRequiredText } from "@/modules/settings/shared";

export interface PasswordFormState {
  success?: string;
  errors?: {
    _form?: string[];
    password?: string[];
    confirm_password?: string[];
  };
}

export interface PasswordResetState {
  success?: string;
  error?: string;
}

function getAppLoginUrl() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return undefined;

  try {
    return new URL("/login", appUrl).toString();
  } catch {
    console.error("[settings] invalid NEXT_PUBLIC_APP_URL:", appUrl);
    return undefined;
  }
}

export async function updatePasswordAction(
  _prev: PasswordFormState,
  formData: FormData,
): Promise<PasswordFormState> {
  const password = normalizeRequiredText(formData.get("password"));
  const confirmPassword = normalizeRequiredText(formData.get("confirm_password"));
  const errors: NonNullable<PasswordFormState["errors"]> = {};

  if (password.length < 12) {
    errors.password = ["Das Passwort muss mindestens 12 Zeichen lang sein."];
  }
  if (password !== confirmPassword) {
    errors.confirm_password = ["Die Passwort-Wiederholung stimmt nicht überein."];
  }
  if (Object.keys(errors).length > 0) return { errors };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { errors: { _form: ["Bitte erneut anmelden."] } };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    console.error("[settings] password update failed:", error);
    return { errors: { _form: ["Passwort konnte nicht geändert werden."] } };
  }

  revalidatePath("/einstellungen");
  return { success: "Passwort geändert." };
}

export async function sendPasswordResetAction(): Promise<PasswordResetState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return { error: "Bitte erneut anmelden." };

  const redirectTo = getAppLoginUrl();
  const { error } = await supabase.auth.resetPasswordForEmail(
    user.email,
    redirectTo ? { redirectTo } : undefined,
  );

  if (error) {
    console.error("[settings] password reset failed:", error);
    return { error: "Reset-Mail konnte nicht versendet werden." };
  }

  return { success: "Reset-Mail wurde versendet." };
}
