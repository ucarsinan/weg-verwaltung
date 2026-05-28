"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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

export async function createResolution(
  meetingId: string,
  topId: string,
  _prev: ResolutionFormState,
  formData: FormData,
): Promise<ResolutionFormState> {
  const text = String(formData.get("text") ?? "").trim();
  const mehrheits_typ_raw = String(formData.get("mehrheits_typ") ?? "").trim();
  const stimmprinzip_raw = String(formData.get("stimmprinzip") ?? "").trim();

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
    return { errors };
  }

  const mehrheits_typ = mehrheits_typ_raw as MehrheitsTyp;
  const stimmprinzip = stimmprinzip_raw as Stimmprinzip;

  const supabase = await createClient();
  const { error } = await supabase.from("resolution").insert({
    meeting_id: meetingId,
    agenda_item_id: topId,
    text,
    mehrheits_typ,
    stimmprinzip,
  });

  if (error) {
    console.error("[createResolution] insert failed", {
      code: error.code,
      hint: error.hint,
    });
    return {
      errors: {
        _form: [
          "Beschlussvorlage konnte nicht angelegt werden. Bitte erneut versuchen.",
        ],
      },
    };
  }

  revalidatePath(`/versammlungen/${meetingId}/tops/${topId}`);
  redirect(`/versammlungen/${meetingId}/tops/${topId}/abstimmung`);
}
