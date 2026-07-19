"use server";

import { logPostgrestError, runFormAction } from "@/modules/action-kernel";

// Server Action for Unit (Wohneinheit) creation — über den action-kernel.
//
// Section 3 invariants:
//  - tenant_id omitted: column default `auth.tenant_id()` in migration 0003
//    resolves it from the JWT. RLS WITH CHECK rejects cross-tenant writes.
//  - weg_id is taken from the URL segment (passed as hidden field in the form)
//    and validated server-side — we only insert if it looks like a UUID.

export interface UnitFormState {
  errors?: {
    bezeichnung?: string[];
    mea_zaehler?: string[];
    mea_nenner?: string[];
    _form?: string[];
  };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POSITIVE_INTEGER_RE = /^[1-9]\d*$/;

interface UnitInput {
  wegId: string;
  bezeichnung: string;
  zaehler: number;
  nenner: number;
}

export async function createUnit(
  _prev: UnitFormState,
  formData: FormData,
): Promise<UnitFormState> {
  return runFormAction<UnitInput, UnitFormState>(
    {
      scope: "createUnit",
      guardError: (message) => ({ errors: { _form: [message] } }),
      parse: (data) => {
        const wegId = String(data.get("weg_id") ?? "").trim();
        const bezeichnung = String(data.get("bezeichnung") ?? "").trim();
        const zaehlerRaw = String(data.get("mea_zaehler") ?? "").trim();
        const nennerRaw = String(data.get("mea_nenner") ?? "").trim();

        // Guard: weg_id must be a valid UUID (it comes from a hidden form
        // field, but we must not trust it).
        if (!UUID_RE.test(wegId)) {
          return {
            errors: {
              errors: { _form: ["Ungültige WEG-ID. Bitte Seite neu laden."] },
            },
          };
        }

        const errors: UnitFormState["errors"] = {};

        if (bezeichnung.length < 1) {
          errors.bezeichnung = ["Bezeichnung darf nicht leer sein."];
        } else if (bezeichnung.length > 200) {
          errors.bezeichnung = [
            "Bezeichnung darf höchstens 200 Zeichen lang sein.",
          ];
        }

        if (!POSITIVE_INTEGER_RE.test(zaehlerRaw)) {
          errors.mea_zaehler = ["MEA-Zähler muss eine positive ganze Zahl sein."];
        }

        if (!POSITIVE_INTEGER_RE.test(nennerRaw)) {
          errors.mea_nenner = ["MEA-Nenner muss eine positive ganze Zahl sein."];
        }

        if (Object.keys(errors).length > 0) {
          return { errors: { errors } };
        }

        return {
          input: {
            wegId,
            bezeichnung,
            zaehler: Number(zaehlerRaw),
            nenner: Number(nennerRaw),
          },
        };
      },
      execute: async ({ supabase }, input) => {
        const { error } = await supabase.from("unit").insert({
          weg_id: input.wegId,
          bezeichnung: input.bezeichnung,
          mea_zaehler: input.zaehler,
          mea_nenner: input.nenner,
        });

        if (error) {
          logPostgrestError("createUnit", error);
          return {
            errors: {
              errors: {
                _form: [
                  "Wohneinheit konnte nicht angelegt werden. Bitte erneut versuchen.",
                ],
              },
            },
          };
        }

        return {
          revalidate: [`/wegs/${input.wegId}`],
          redirectTo: `/wegs/${input.wegId}`,
        };
      },
    },
    formData,
  );
}
