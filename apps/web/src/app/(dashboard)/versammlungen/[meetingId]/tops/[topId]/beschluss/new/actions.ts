"use server";

import { logPostgrestError, runFormAction } from "@/modules/action-kernel";
import type { MehrheitsTyp, Stimmprinzip } from "@/lib/supabase/database.types";

export interface ResolutionFormState {
  errors?: {
    text?: string[];
    mehrheits_typ?: string[];
    stimmprinzip?: string[];
    _form?: string[];
  };
}

const VALID_MEHRHEITS_TYP: MehrheitsTyp[] = [
  "einfach",
  "qualifiziert",
  "doppelt_qualifiziert",
  "allstimmig",
  "vereinbarungs_aenderung",
];

const VALID_STIMMPRINZIP: Stimmprinzip[] = ["kopf", "wert", "objekt"];

const TEXT_MIN = 10;
const TEXT_MAX = 5000;

interface ResolutionInput {
  text: string;
  mehrheits_typ: MehrheitsTyp;
  stimmprinzip: Stimmprinzip;
}

export async function createResolution(
  meetingId: string,
  topId: string,
  _prev: ResolutionFormState,
  formData: FormData,
): Promise<ResolutionFormState> {
  return runFormAction<ResolutionInput, ResolutionFormState>(
    {
      scope: "createResolution",
      guardError: (message) => ({ errors: { _form: [message] } }),
      parse: (data) => {
        const text = String(data.get("text") ?? "").trim();
        const mehrheits_typ_raw = String(data.get("mehrheits_typ") ?? "").trim();
        const stimmprinzip_raw = String(data.get("stimmprinzip") ?? "").trim();

        const errors: ResolutionFormState["errors"] = {};

        if (text.length < TEXT_MIN) {
          errors.text = [
            `Beschlusstext muss mindestens ${TEXT_MIN} Zeichen lang sein.`,
          ];
        } else if (text.length > TEXT_MAX) {
          errors.text = [
            `Beschlusstext darf höchstens ${TEXT_MAX} Zeichen lang sein.`,
          ];
        }

        if (!VALID_MEHRHEITS_TYP.includes(mehrheits_typ_raw as MehrheitsTyp)) {
          errors.mehrheits_typ = ["Bitte einen gültigen Mehrheitstyp auswählen."];
        }

        if (!VALID_STIMMPRINZIP.includes(stimmprinzip_raw as Stimmprinzip)) {
          errors.stimmprinzip = ["Bitte ein gültiges Stimmprinzip auswählen."];
        }

        if (Object.keys(errors).length > 0) {
          return { errors: { errors } };
        }

        return {
          input: {
            text,
            mehrheits_typ: mehrheits_typ_raw as MehrheitsTyp,
            stimmprinzip: stimmprinzip_raw as Stimmprinzip,
          },
        };
      },
      execute: async ({ supabase }, input) => {
        const { error } = await supabase.from("resolution").insert({
          meeting_id: meetingId,
          agenda_item_id: topId,
          text: input.text,
          mehrheits_typ: input.mehrheits_typ,
          stimmprinzip: input.stimmprinzip,
        });

        if (error) {
          logPostgrestError("createResolution", error);
          return {
            errors: {
              errors: {
                _form: [
                  "Beschlussvorlage konnte nicht angelegt werden. Bitte erneut versuchen.",
                ],
              },
            },
          };
        }

        return {
          revalidate: [`/versammlungen/${meetingId}/tops/${topId}`],
          redirectTo: `/versammlungen/${meetingId}/tops/${topId}/abstimmung`,
        };
      },
    },
    formData,
  );
}
