"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { TopFormState } from "../new/actions";

// Server Actions for agenda_item edit + delete.
//
// Section 3 invariants:
//  - RLS scopes UPDATE/DELETE to the user's tenant; no tenant_id passed.
//  - meeting_id stays immutable on edit — the detail-page cross-meeting
//    guard enforces this on read; the edit action does not allow moving
//    a TOP between meetings.
//  - position stays immutable on edit (reordering is a separate concern).
//
// State shape is identical to create — reuse TopFormState so TopForm
// can render both flows without a generic type-param.
export type EditTopFormState = TopFormState;

const TITEL_MIN = 3;
const TITEL_MAX = 200;
const BESCHREIBUNG_MAX = 1000;

export async function editAgendaItem(
  meetingId: string,
  topId: string,
  _prev: EditTopFormState,
  formData: FormData,
): Promise<EditTopFormState> {
  const titel = String(formData.get("titel") ?? "").trim();
  const beschreibungRaw = String(formData.get("beschreibung") ?? "").trim();

  const errors: EditTopFormState["errors"] = {};

  if (titel.length < TITEL_MIN) {
    errors.titel = [`Titel muss mindestens ${TITEL_MIN} Zeichen lang sein.`];
  } else if (titel.length > TITEL_MAX) {
    errors.titel = [`Titel darf höchstens ${TITEL_MAX} Zeichen lang sein.`];
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
  const { error } = await supabase
    .from("agenda_item")
    .update({
      titel,
      beschreibung: beschreibungRaw === "" ? null : beschreibungRaw,
    })
    .eq("id", topId)
    .eq("meeting_id", meetingId);

  if (error) {
    console.error("[editAgendaItem] update failed", {
      code: error.code,
      hint: error.hint,
    });
    return {
      errors: {
        _form: ["TOP konnte nicht gespeichert werden. Bitte erneut versuchen."],
      },
    };
  }

  revalidatePath(`/versammlungen/${meetingId}`);
  revalidatePath(`/versammlungen/${meetingId}/tops/${topId}`);
  redirect(`/versammlungen/${meetingId}/tops/${topId}`);
}

export async function deleteAgendaItem(
  meetingId: string,
  topId: string,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("agenda_item")
    .delete()
    .eq("id", topId)
    .eq("meeting_id", meetingId);

  if (error) {
    console.error("[deleteAgendaItem] delete failed", {
      code: error.code,
      hint: error.hint,
    });
    throw new Error("TOP konnte nicht gelöscht werden.");
  }

  revalidatePath(`/versammlungen/${meetingId}`);
  redirect(`/versammlungen/${meetingId}`);
}
