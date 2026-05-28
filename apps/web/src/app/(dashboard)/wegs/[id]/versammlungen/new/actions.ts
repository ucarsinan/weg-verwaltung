"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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

export async function createMeeting(
  wegId: string,
  _prev: MeetingFormState,
  formData: FormData,
): Promise<MeetingFormState> {
  const titel = String(formData.get("titel") ?? "").trim();
  const modusRaw = String(formData.get("modus") ?? "").trim();
  const terminVonRaw = String(formData.get("termin_von") ?? "").trim();
  const terminBisRaw = String(formData.get("termin_bis") ?? "").trim();

  const errors: MeetingFormState["errors"] = {};

  if (titel.length < TITEL_MIN) {
    errors.titel = [
      `Titel muss mindestens ${TITEL_MIN} Zeichen lang sein.`,
    ];
  } else if (titel.length > TITEL_MAX) {
    errors.titel = [
      `Titel darf höchstens ${TITEL_MAX} Zeichen lang sein.`,
    ];
  }

  if (!VALID_MODI.includes(modusRaw as MeetingModus)) {
    errors.modus = ["Ungültiger Modus. Bitte einen der vorgegebenen Werte wählen."];
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
    return { errors };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meeting")
    .insert({
      weg_id: wegId,
      titel,
      modus: modusRaw as MeetingModus,
      termin_von: terminVon,
      termin_bis: terminBis,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[createMeeting] insert failed", {
      code: error.code,
      hint: error.hint,
    });
    return {
      errors: {
        _form: [
          "Versammlung konnte nicht angelegt werden. Bitte erneut versuchen.",
        ],
      },
    };
  }

  revalidatePath(`/wegs/${wegId}`);
  redirect(`/versammlungen/${data.id}`);
}
