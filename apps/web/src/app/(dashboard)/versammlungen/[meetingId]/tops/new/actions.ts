"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Server Action for agenda_item (TOP) creation.
//
// Section 3 invariants:
//  - Mandanten-Iso via RLS (invariant 1): tenant_id is never passed from app
//    code — the column default auth.tenant_id() resolves it from the JWT.
//  - Position is auto-computed server-side (max + 1) to avoid client-supplied
//    values racing each other; the UNIQUE(tenant_id, meeting_id, position)
//    constraint is the final guard.

export interface TopFormState {
  errors?: {
    titel?: string[];
    beschreibung?: string[];
    _form?: string[];
  };
}

const TITEL_MIN = 3;
const TITEL_MAX = 200;
const BESCHREIBUNG_MAX = 1000;

export async function createAgendaItem(
  meetingId: string,
  _prev: TopFormState,
  formData: FormData,
): Promise<TopFormState> {
  const titel = String(formData.get("titel") ?? "").trim();
  const beschreibungRaw = String(formData.get("beschreibung") ?? "").trim();

  const errors: TopFormState["errors"] = {};

  if (titel.length < TITEL_MIN) {
    errors.titel = [
      `Titel muss mindestens ${TITEL_MIN} Zeichen lang sein.`,
    ];
  } else if (titel.length > TITEL_MAX) {
    errors.titel = [
      `Titel darf höchstens ${TITEL_MAX} Zeichen lang sein.`,
    ];
  }

  if (beschreibungRaw.length > BESCHREIBUNG_MAX) {
    errors.beschreibung = [
      `Beschreibung darf höchstens ${BESCHREIBUNG_MAX} Zeichen lang sein.`,
    ];
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  const supabase = await createClient();

  // Auto-compute position: max existing position for this meeting + 1.
  const { data: maxRow } = await supabase
    .from("agenda_item")
    .select("position")
    .eq("meeting_id", meetingId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = (maxRow?.position ?? 0) + 1;

  const { data, error } = await supabase
    .from("agenda_item")
    .insert({
      meeting_id: meetingId,
      position,
      titel,
      beschreibung: beschreibungRaw === "" ? null : beschreibungRaw,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[createAgendaItem] insert failed", {
      code: error.code,
      hint: error.hint,
    });
    return {
      errors: {
        _form: [
          "TOP konnte nicht angelegt werden. Bitte erneut versuchen.",
        ],
      },
    };
  }

  revalidatePath(`/versammlungen/${meetingId}`);
  redirect(`/versammlungen/${meetingId}/tops/${data.id}`);
}
