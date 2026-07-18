"use server";

import { logPostgrestError, runFormAction } from "@/modules/action-kernel";

export interface UnitEditFormState {
  errors?: {
    bezeichnung?: string[];
    mea_zaehler?: string[];
    mea_nenner?: string[];
    _form?: string[];
  };
}

interface UnitEditInput {
  bezeichnung: string;
  zaehler: number;
  nenner: number;
}

export async function updateUnit(
  wegId: string,
  unitId: string,
  _prev: UnitEditFormState,
  formData: FormData,
): Promise<UnitEditFormState> {
  return runFormAction<UnitEditInput, UnitEditFormState>(
    {
      scope: "updateUnit",
      guardError: (message) => ({ errors: { _form: [message] } }),
      parse: (data) => {
        const bezeichnung = String(data.get("bezeichnung") ?? "").trim();
        const zaehlerRaw = String(data.get("mea_zaehler") ?? "").trim();
        const nennerRaw = String(data.get("mea_nenner") ?? "").trim();

        const errors: UnitEditFormState["errors"] = {};

        if (bezeichnung.length < 1) {
          errors.bezeichnung = ["Bezeichnung darf nicht leer sein."];
        } else if (bezeichnung.length > 200) {
          errors.bezeichnung = [
            "Bezeichnung darf höchstens 200 Zeichen lang sein.",
          ];
        }

        const zaehler = parseInt(zaehlerRaw, 10);
        if (!zaehlerRaw || isNaN(zaehler) || zaehler < 1) {
          errors.mea_zaehler = ["MEA-Zähler muss eine positive ganze Zahl sein."];
        }

        const nenner = parseInt(nennerRaw, 10);
        if (!nennerRaw || isNaN(nenner) || nenner < 1) {
          errors.mea_nenner = ["MEA-Nenner muss eine positive ganze Zahl sein."];
        }

        if (Object.keys(errors).length > 0) {
          return { errors: { errors } };
        }

        return { input: { bezeichnung, zaehler, nenner } };
      },
      execute: async ({ supabase }, input) => {
        const { error } = await supabase
          .from("unit")
          .update({
            bezeichnung: input.bezeichnung,
            mea_zaehler: input.zaehler,
            mea_nenner: input.nenner,
          })
          .eq("id", unitId);

        if (error) {
          logPostgrestError("updateUnit", error);
          return {
            errors: {
              errors: {
                _form: [
                  "Wohneinheit konnte nicht aktualisiert werden. Bitte erneut versuchen.",
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

export async function deleteUnit(
  wegId: string,
  unitId: string,
): Promise<{ error?: string }> {
  return runFormAction<Record<string, never>, { error?: string }>(
    {
      scope: "deleteUnit",
      guardError: (message) => ({ error: message }),
      parse: () => ({ input: {} }),
      execute: async ({ supabase }) => {
        const { error } = await supabase.from("unit").delete().eq("id", unitId);

        if (error) {
          logPostgrestError("deleteUnit", error);

          if (error.code === "23503") {
            return {
              errors: {
                error:
                  "Die Wohneinheit kann nicht gelöscht werden, da ihr noch Eigentumsverhältnisse (Eigentümer) zugeordnet sind. Bitte löschen Sie zuerst alle Eigentumsverhältnisse dieser Einheit.",
              },
            };
          }

          return {
            errors: {
              error:
                "Wohneinheit konnte nicht gelöscht werden. Bitte erneut versuchen.",
            },
          };
        }

        return {
          revalidate: [`/wegs/${wegId}`],
          redirectTo: `/wegs/${wegId}`,
        };
      },
    },
    new FormData(),
  );
}
