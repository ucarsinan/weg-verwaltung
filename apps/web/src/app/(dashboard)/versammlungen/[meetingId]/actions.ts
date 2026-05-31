"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Status-transition Server Actions for meeting.
//
// § 24 Abs. 4 S. 2 WEG: 3-Wochen-Einladungsfrist. Mirrored by the DB
// generated column frist_einladung_ok = (termin_von - einladung_versand_am)
// >= interval '21 days'. We check the same predicate client-side at
// transition time so the verwalter gets a German error instead of a
// silently-false frist flag.

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const EINLADUNGSFRIST_DAYS = 21;

export interface SendInvitationState {
  error?: string;
}

export async function sendInvitation(
  meetingId: string,
  _prev: SendInvitationState,
  _formData: FormData,
): Promise<SendInvitationState> {
  // useActionState signature contract — neither arg carries data we need
  // here (meetingId via .bind, no form fields).
  void _prev;
  void _formData;
  const supabase = await createClient();

  const { data: meeting, error: selectError } = await supabase
    .from("meeting")
    .select("id, status, termin_von")
    .eq("id", meetingId)
    .single();

  if (selectError || !meeting) {
    console.error("[sendInvitation] meeting select failed:", selectError);
    return { error: "Versammlung konnte nicht geladen werden." };
  }

  if (meeting.status !== "entwurf") {
    return {
      error: `Einladung kann nur im Status 'Entwurf' versendet werden (aktuell: ${meeting.status}).`,
    };
  }

  if (!meeting.termin_von) {
    return {
      error:
        "Termin ist noch nicht festgelegt. Bitte zuerst einen Versammlungstermin eintragen.",
    };
  }

  const terminMs = new Date(meeting.termin_von).getTime();
  const nowMs = Date.now();
  const days = (terminMs - nowMs) / MS_PER_DAY;

  if (days < EINLADUNGSFRIST_DAYS) {
    return {
      error: `Einladungsfrist nicht eingehalten — § 24 Abs. 4 WEG verlangt mindestens ${EINLADUNGSFRIST_DAYS} Tage zwischen Versand und Termin (aktuell: ${Math.floor(days)} Tage).`,
    };
  }

  const { error: updateError } = await supabase
    .from("meeting")
    .update({
      status: "eingeladen",
      einladung_versand_am: new Date().toISOString(),
    })
    .eq("id", meetingId);

  if (updateError) {
    console.error("[sendInvitation] update failed", {
      code: updateError.code,
      hint: updateError.hint,
    });
    return { error: "Einladung konnte nicht versendet werden." };
  }

  revalidatePath(`/versammlungen/${meetingId}`);
  redirect(`/versammlungen/${meetingId}`);
}
