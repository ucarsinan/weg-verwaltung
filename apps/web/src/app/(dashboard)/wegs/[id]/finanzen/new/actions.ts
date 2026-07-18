"use server";

import { logPostgrestError, runFormAction } from "@/modules/action-kernel";

export interface WirtschaftsplanFormState {
  errors?: {
    jahr?: string[];
    bezeichnung?: string[];
    gesamtkosten?: string[];
    wirksam_ab_monat?: string[];
    _form?: string[];
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface WirtschaftsplanInput {
  wegId: string;
  jahr: number;
  bezeichnung: string;
  gesamtkosten: number;
  wirksamAbMonat: number | null;
}

export async function createWirtschaftsplanAction(
  _prev: WirtschaftsplanFormState,
  formData: FormData,
): Promise<WirtschaftsplanFormState> {
  return runFormAction<WirtschaftsplanInput, WirtschaftsplanFormState>(
    {
      scope: "createWirtschaftsplanAction",
      guardError: (message) => ({ errors: { _form: [message] } }),
      parse: (data) => {
        const wegId = String(data.get("weg_id") ?? "").trim();
        const jahrRaw = String(data.get("jahr") ?? "").trim();
        const bezeichnung = String(data.get("bezeichnung") ?? "").trim();
        const gesamtkostenRaw = String(data.get("gesamtkosten") ?? "").trim();
        const wirksamAbMonatRaw = String(
          data.get("wirksam_ab_monat") ?? "",
        ).trim();

        if (!UUID_RE.test(wegId)) {
          return {
            errors: {
              errors: { _form: ["Ungültige WEG-ID. Bitte Seite neu laden."] },
            },
          };
        }

        const errors: WirtschaftsplanFormState["errors"] = {};

        // Validate Jahr
        const jahr = parseInt(jahrRaw, 10);
        if (isNaN(jahr) || jahr < 1900 || jahr > 2100) {
          errors.jahr = ["Bitte ein gültiges Jahr zwischen 1900 und 2100 angeben."];
        }

        // Validate Bezeichnung
        if (bezeichnung.length === 0) {
          errors.bezeichnung = ["Bitte eine Bezeichnung angeben."];
        }

        // Validate Gesamtkosten (must be strictly positive according to E2E tests)
        const gesamtkosten = parseFloat(gesamtkostenRaw);
        if (isNaN(gesamtkosten) || gesamtkosten <= 0) {
          errors.gesamtkosten = ["Die Gesamtkosten müssen größer als 0 sein."];
        }

        const wirksamAbMonat =
          wirksamAbMonatRaw.length > 0 ? parseInt(wirksamAbMonatRaw, 10) : null;
        if (
          wirksamAbMonatRaw.length > 0 &&
          (!Number.isInteger(wirksamAbMonat) ||
            wirksamAbMonat === null ||
            wirksamAbMonat < 1 ||
            wirksamAbMonat > 12)
        ) {
          errors.wirksam_ab_monat = [
            "Der Wirksamkeitsmonat muss zwischen 1 und 12 liegen.",
          ];
        }

        if (Object.keys(errors).length > 0) {
          return { errors: { errors } };
        }

        return {
          input: { wegId, jahr, bezeichnung, gesamtkosten, wirksamAbMonat },
        };
      },
      execute: async ({ supabase }, input) => {
        const { data: planData, error: planError } = await supabase
          .from("wirtschaftsplan")
          .insert({
            weg_id: input.wegId,
            jahr: input.jahr,
            bezeichnung: input.bezeichnung,
            gesamtkosten: input.gesamtkosten,
            wirksam_ab_monat: input.wirksamAbMonat,
          })
          .select("id")
          .single();

        if (planError || !planData) {
          logPostgrestError("createWirtschaftsplanAction", planError ?? {});
          if (planError?.code === "23505") {
            // unique constraint violation
            return {
              errors: {
                errors: {
                  jahr: [
                    "Für dieses Jahr existiert bereits ein aktiver Wirtschaftsplan.",
                  ],
                },
              },
            };
          }
          return {
            errors: {
              errors: {
                _form: [
                  "Wirtschaftsplan konnte nicht angelegt werden. Bitte erneut versuchen.",
                ],
              },
            },
          };
        }

        return {
          revalidate: [`/wegs/${input.wegId}/finanzen`],
          redirectTo: `/wegs/${input.wegId}/finanzen`,
        };
      },
    },
    formData,
  );
}
