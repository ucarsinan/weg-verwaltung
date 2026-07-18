"use server";

import { logPostgrestError, runFormAction } from "@/modules/action-kernel";
import type { MeetingModus } from "@/lib/supabase/database.types";

export interface MeetingFormState {
  errors?: {
    titel?: string[];
    modus?: string[];
    termin_von?: string[];
    termin_bis?: string[];
    _form?: string[];
  };
}

const TITEL_MIN = 3;
const TITEL_MAX = 200;

const VALID_MODI: MeetingModus[] = ["praesenz", "hybrid", "virtuell", "umlauf"];

interface MeetingInput {
  titel: string;
  modus: MeetingModus;
  terminVon: string | null;
  terminBis: string | null;
}

export async function createMeeting(
  wegId: string,
  _prev: MeetingFormState,
  formData: FormData,
): Promise<MeetingFormState> {
  return runFormAction<MeetingInput, MeetingFormState>(
    {
      scope: "createMeeting",
      guardError: (message) => ({ errors: { _form: [message] } }),
      parse: (data) => {
        const titel = String(data.get("titel") ?? "").trim();
        const modusRaw = String(data.get("modus") ?? "").trim();
        const terminVonRaw = String(data.get("termin_von") ?? "").trim();
        const terminBisRaw = String(data.get("termin_bis") ?? "").trim();

        const errors: MeetingFormState["errors"] = {};

        if (titel.length < TITEL_MIN) {
          errors.titel = [`Titel muss mindestens ${TITEL_MIN} Zeichen lang sein.`];
        } else if (titel.length > TITEL_MAX) {
          errors.titel = [`Titel darf höchstens ${TITEL_MAX} Zeichen lang sein.`];
        }

        if (!VALID_MODI.includes(modusRaw as MeetingModus)) {
          errors.modus = [
            "Ungültiger Modus. Bitte einen der vorgegebenen Werte wählen.",
          ];
        }

        let terminVon: string | null = null;
        if (terminVonRaw !== "") {
          const d = new Date(terminVonRaw);
          if (isNaN(d.getTime())) {
            errors.termin_von = ["Ungültiges Datum für Termin von."];
          } else {
            terminVon = d.toISOString();
          }
        }

        let terminBis: string | null = null;
        if (terminBisRaw !== "") {
          const d = new Date(terminBisRaw);
          if (isNaN(d.getTime())) {
            errors.termin_bis = ["Ungültiges Datum für Termin bis."];
          } else {
            terminBis = d.toISOString();
            if (terminVon !== null && terminBis < terminVon) {
              errors.termin_bis = [
                "Termin bis muss gleich oder nach Termin von liegen.",
              ];
            }
          }
        }

        if (Object.keys(errors).length > 0) {
          return { errors: { errors } };
        }

        return {
          input: { titel, modus: modusRaw as MeetingModus, terminVon, terminBis },
        };
      },
      execute: async ({ supabase }, input) => {
        const { data, error } = await supabase
          .from("meeting")
          .insert({
            weg_id: wegId,
            titel: input.titel,
            modus: input.modus,
            termin_von: input.terminVon,
            termin_bis: input.terminBis,
          })
          .select("id")
          .single();

        if (error) {
          logPostgrestError("createMeeting", error);
          return {
            errors: {
              errors: {
                _form: [
                  "Versammlung konnte nicht angelegt werden. Bitte erneut versuchen.",
                ],
              },
            },
          };
        }

        return {
          revalidate: [`/wegs/${wegId}`],
          redirectTo: `/versammlungen/${data.id}`,
        };
      },
    },
    formData,
  );
}
