"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getTenantClaims } from "@/modules/identity";

export interface ProfileFormState {
  success?: string;
  errors?: {
    vorname?: string[];
    nachname?: string[];
    email?: string[];
    telefon?: string[];
    anschrift?: string[];
    _form?: string[];
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readText(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function validateProfileInputs(formData: FormData): {
  values: {
    vorname: string;
    nachname: string;
    email: string | null;
    telefon: string | null;
    anschrift: string | null;
  };
  errors: ProfileFormState["errors"];
} {
  const vorname = readText(formData, "vorname");
  const nachname = readText(formData, "nachname");
  const emailRaw = readText(formData, "email");
  const telefonRaw = readText(formData, "telefon");
  const anschriftRaw = readText(formData, "anschrift");
  const errors: ProfileFormState["errors"] = {};

  if (vorname.length < 1) {
    errors.vorname = ["Bitte geben Sie einen Vornamen an."];
  } else if (vorname.length > 100) {
    errors.vorname = ["Der Vorname darf höchstens 100 Zeichen lang sein."];
  }

  if (nachname.length < 1) {
    errors.nachname = ["Bitte geben Sie einen Nachnamen an."];
  } else if (nachname.length > 100) {
    errors.nachname = ["Der Nachname darf höchstens 100 Zeichen lang sein."];
  }

  if (emailRaw.length > 200) {
    errors.email = ["Die E-Mail-Adresse darf höchstens 200 Zeichen lang sein."];
  } else if (emailRaw !== "" && !EMAIL_RE.test(emailRaw)) {
    errors.email = ["Bitte geben Sie eine gültige E-Mail-Adresse an."];
  }

  if (telefonRaw.length > 50) {
    errors.telefon = ["Die Telefonnummer darf höchstens 50 Zeichen lang sein."];
  }

  if (anschriftRaw.length > 500) {
    errors.anschrift = ["Die Anschrift darf höchstens 500 Zeichen lang sein."];
  }

  return {
    values: {
      vorname,
      nachname,
      email: emailRaw === "" ? null : emailRaw,
      telefon: telefonRaw === "" ? null : telefonRaw,
      anschrift: anschriftRaw === "" ? null : anschriftRaw,
    },
    errors,
  };
}

export async function updateProfilePersonAction(
  _prevState: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { claims, error: claimsError } = await getTenantClaims(supabase);
  const tenantId = claims.tenantId;

  if (claimsError || !tenantId) {
    if (claimsError) {
      console.error("[settings] profile getClaims failed:", claimsError);
    }
    return {
      errors: {
        _form: [
          "Der Mandantenkontext konnte nicht geprüft werden. Bitte melden Sie sich erneut an.",
        ],
      },
    };
  }

  const { values, errors } = validateProfileInputs(formData);

  if (Object.keys(errors ?? {}).length > 0) {
    return { errors };
  }

  const { data: person, error: personError } = await supabase
    .from("person")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (personError) {
    console.error("[settings] profile person select failed:", personError);
    return {
      errors: {
        _form: [
          "Die verknüpfte Person konnte nicht geladen werden. Bitte erneut versuchen.",
        ],
      },
    };
  }

  if (!person) {
    return {
      errors: {
        _form: [
          "Für diesen Login ist keine Person verknüpft. Profildaten können deshalb nicht gespeichert werden.",
        ],
      },
    };
  }

  const { data: updatedPerson, error: updateError } = await supabase
    .from("person")
    .update({
      ...values,
      updated_at: new Date().toISOString(),
    })
    .eq("id", person.id)
    .eq("tenant_id", tenantId)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (updateError) {
    console.error("[settings] profile person update failed:", {
      code: updateError.code,
      hint: updateError.hint,
    });
    return {
      errors: {
        _form: [
          "Die Profildaten konnten nicht gespeichert werden. Bitte erneut versuchen.",
        ],
      },
    };
  }

  if (!updatedPerson) {
    return {
      errors: {
        _form: [
          "Die verknüpfte Person wurde nicht aktualisiert. Bitte laden Sie die Seite neu.",
        ],
      },
    };
  }

  revalidatePath("/einstellungen");

  return { success: "Profildaten wurden gespeichert." };
}
