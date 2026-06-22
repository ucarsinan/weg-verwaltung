"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface PersonFormState {
  errors?: {
    vorname?: string[];
    nachname?: string[];
    email?: string[];
    telefon?: string[];
    anschrift?: string[];
    user_id?: string[];
    _form?: string[];
  };
}

export interface FormState {
  errors?: {
    _form?: string[];
  };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validatePersonInputs(formData: FormData): {
  values: {
    vorname: string;
    nachname: string;
    email: string | null;
    telefon: string | null;
    anschrift: string | null;
    user_id: string | null;
  };
  errors: PersonFormState["errors"];
} {
  const vorname = String(formData.get("vorname") ?? "").trim();
  const nachname = String(formData.get("nachname") ?? "").trim();
  const emailRaw = String(formData.get("email") ?? "").trim();
  const telefonRaw = String(formData.get("telefon") ?? "").trim();
  const anschriftRaw = String(formData.get("anschrift") ?? "").trim();
  const userIdRaw = String(formData.get("user_id") ?? "").trim();

  const errors: PersonFormState["errors"] = {};

  if (vorname.length < 1) {
    errors.vorname = ["Vorname darf nicht leer sein."];
  } else if (vorname.length > 100) {
    errors.vorname = ["Vorname darf höchstens 100 Zeichen lang sein."];
  }

  if (nachname.length < 1) {
    errors.nachname = ["Nachname darf nicht leer sein."];
  } else if (nachname.length > 100) {
    errors.nachname = ["Nachname darf höchstens 100 Zeichen lang sein."];
  }

  if (emailRaw.length > 200) {
    errors.email = ["E-Mail darf höchstens 200 Zeichen lang sein."];
  }

  if (telefonRaw.length > 50) {
    errors.telefon = ["Telefonnummer darf höchstens 50 Zeichen lang sein."];
  }

  if (anschriftRaw.length > 500) {
    errors.anschrift = ["Anschrift darf höchstens 500 Zeichen lang sein."];
  }

  if (userIdRaw !== "" && !UUID_RE.test(userIdRaw)) {
    errors.user_id = ["Benutzer-ID muss ein gültiges UUID-Format haben."];
  }

  return {
    values: {
      vorname,
      nachname,
      email: emailRaw === "" ? null : emailRaw,
      telefon: telefonRaw === "" ? null : telefonRaw,
      anschrift: anschriftRaw === "" ? null : anschriftRaw,
      user_id: userIdRaw === "" ? null : userIdRaw,
    },
    errors,
  };
}

export async function createPerson(
  wegId: string,
  _prevState: PersonFormState,
  formData: FormData,
): Promise<PersonFormState> {
  if (!UUID_RE.test(wegId)) {
    return { errors: { _form: ["Ungültige WEG-ID. Bitte Seite neu laden."] } };
  }

  const { values, errors } = validatePersonInputs(formData);

  if (errors && Object.keys(errors).length > 0) {
    return { errors };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("person").insert(values);

  if (error) {
    console.error("[createPerson] insert failed", {
      code: error.code,
      hint: error.hint,
    });
    return {
      errors: {
        _form: ["Person konnte nicht angelegt werden. Bitte erneut versuchen."],
      },
    };
  }

  revalidatePath(`/wegs/${wegId}`);
  redirect(`/wegs/${wegId}`);
}

export async function updatePerson(
  wegId: string,
  personId: string,
  _prevState: PersonFormState,
  formData: FormData,
): Promise<PersonFormState> {
  if (!UUID_RE.test(wegId) || !UUID_RE.test(personId)) {
    return { errors: { _form: ["Ungültige IDs. Bitte Seite neu laden."] } };
  }

  const { values, errors } = validatePersonInputs(formData);

  if (errors && Object.keys(errors).length > 0) {
    return { errors };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("person")
    .update(values)
    .eq("id", personId);

  if (error) {
    console.error("[updatePerson] update failed", {
      code: error.code,
      hint: error.hint,
    });
    return {
      errors: {
        _form: ["Person konnte nicht aktualisiert werden. Bitte erneut versuchen."],
      },
    };
  }

  revalidatePath(`/wegs/${wegId}`);
  redirect(`/wegs/${wegId}`);
}

export async function deletePerson(
  wegId: string,
  personId: string,
): Promise<FormState> {
  if (!UUID_RE.test(wegId) || !UUID_RE.test(personId)) {
    return { errors: { _form: ["Ungültige IDs. Bitte Seite neu laden."] } };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("person")
    .delete()
    .eq("id", personId);

  if (error) {
    if (error.code === "23503") {
      return {
        errors: {
          _form: [
            "Die Person konnte nicht gelöscht werden, da sie noch als Eigentümer oder Co-Eigentümer eingetragen ist.",
          ],
        },
      };
    }
    console.error("[deletePerson] delete failed", {
      code: error.code,
      hint: error.hint,
    });
    return {
      errors: {
        _form: ["Die Person konnte nicht gelöscht werden. Bitte erneut versuchen."],
      },
    };
  }

  revalidatePath(`/wegs/${wegId}`);
  return {};
}
