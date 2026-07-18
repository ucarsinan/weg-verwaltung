"use server";

import { logPostgrestError, runFormAction } from "@/modules/action-kernel";

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

interface PersonValues {
  vorname: string;
  nachname: string;
  email: string | null;
  telefon: string | null;
  anschrift: string | null;
  user_id: string | null;
}

function validatePersonInputs(formData: FormData): {
  values: PersonValues;
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

function parsePersonForm(
  formData: FormData,
):
  | { input: PersonValues }
  | { errors: PersonFormState } {
  const { values, errors } = validatePersonInputs(formData);
  if (errors && Object.keys(errors).length > 0) {
    return { errors: { errors } };
  }
  return { input: values };
}

export async function createPerson(
  wegId: string,
  _prevState: PersonFormState,
  formData: FormData,
): Promise<PersonFormState> {
  if (!UUID_RE.test(wegId)) {
    return { errors: { _form: ["Ungültige WEG-ID. Bitte Seite neu laden."] } };
  }

  return runFormAction<PersonValues, PersonFormState>(
    {
      scope: "createPerson",
      guardError: (message) => ({ errors: { _form: [message] } }),
      parse: parsePersonForm,
      execute: async ({ supabase }, values) => {
        const { error } = await supabase.from("person").insert(values);

        if (error) {
          logPostgrestError("createPerson", error);
          return {
            errors: {
              errors: {
                _form: [
                  "Person konnte nicht angelegt werden. Bitte erneut versuchen.",
                ],
              },
            },
          };
        }

        return {
          revalidate: [`/wegs/${wegId}`],
          redirectTo: `/wegs/${wegId}`,
        };
      },
    },
    formData,
  );
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

  return runFormAction<PersonValues, PersonFormState>(
    {
      scope: "updatePerson",
      guardError: (message) => ({ errors: { _form: [message] } }),
      parse: parsePersonForm,
      execute: async ({ supabase }, values) => {
        const { error } = await supabase
          .from("person")
          .update(values)
          .eq("id", personId);

        if (error) {
          logPostgrestError("updatePerson", error);
          return {
            errors: {
              errors: {
                _form: [
                  "Person konnte nicht aktualisiert werden. Bitte erneut versuchen.",
                ],
              },
            },
          };
        }

        return {
          revalidate: [`/wegs/${wegId}`],
          redirectTo: `/wegs/${wegId}`,
        };
      },
    },
    formData,
  );
}

export async function deletePerson(
  wegId: string,
  personId: string,
): Promise<FormState> {
  if (!UUID_RE.test(wegId) || !UUID_RE.test(personId)) {
    return { errors: { _form: ["Ungültige IDs. Bitte Seite neu laden."] } };
  }

  return runFormAction<Record<string, never>, FormState>(
    {
      scope: "deletePerson",
      guardError: (message) => ({ errors: { _form: [message] } }),
      parse: () => ({ input: {} }),
      execute: async ({ supabase }) => {
        const { error } = await supabase
          .from("person")
          .delete()
          .eq("id", personId);

        if (error) {
          if (error.code === "23503") {
            return {
              errors: {
                errors: {
                  _form: [
                    "Die Person konnte nicht gelöscht werden, da sie noch als Eigentümer oder Co-Eigentümer eingetragen ist.",
                  ],
                },
              },
            };
          }
          logPostgrestError("deletePerson", error);
          return {
            errors: {
              errors: {
                _form: [
                  "Die Person konnte nicht gelöscht werden. Bitte erneut versuchen.",
                ],
              },
            },
          };
        }

        return { revalidate: [`/wegs/${wegId}`], state: {} };
      },
    },
    new FormData(),
  );
}
