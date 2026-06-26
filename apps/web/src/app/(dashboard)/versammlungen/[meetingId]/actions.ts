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

export interface MeetingStatusState {
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
    .eq("id", meetingId)
    .eq("status", "entwurf");

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

export async function startMeeting(
  meetingId: string,
  _prev: MeetingStatusState,
  _formData: FormData,
): Promise<MeetingStatusState> {
  void _prev;
  void _formData;
  const supabase = await createClient();

  const { data: meeting, error: selectError } = await supabase
    .from("meeting")
    .select("id, status")
    .eq("id", meetingId)
    .single();

  if (selectError || !meeting) {
    console.error("[startMeeting] meeting select failed:", selectError);
    return { error: "Versammlung konnte nicht geladen werden." };
  }

  if (meeting.status !== "eingeladen") {
    return {
      error: `Versammlung kann nur im Status 'Eingeladen' gestartet werden (aktuell: ${meeting.status}).`,
    };
  }

  const { error: updateError } = await supabase
    .from("meeting")
    .update({ status: "laufend" })
    .eq("id", meetingId)
    .eq("status", "eingeladen");

  if (updateError) {
    console.error("[startMeeting] update failed", {
      code: updateError.code,
      hint: updateError.hint,
    });
    return { error: "Versammlung konnte nicht gestartet werden." };
  }

  revalidatePath(`/versammlungen/${meetingId}`);
  redirect(`/versammlungen/${meetingId}`);
}

export async function endMeeting(
  meetingId: string,
  _prev: MeetingStatusState,
  _formData: FormData,
): Promise<MeetingStatusState> {
  void _prev;
  void _formData;
  const supabase = await createClient();

  const { data: meeting, error: selectError } = await supabase
    .from("meeting")
    .select("id, status")
    .eq("id", meetingId)
    .single();

  if (selectError || !meeting) {
    console.error("[endMeeting] meeting select failed:", selectError);
    return { error: "Versammlung konnte nicht geladen werden." };
  }

  if (meeting.status !== "laufend") {
    return {
      error: `Versammlung kann nur im Status 'Laufend' beendet werden (aktuell: ${meeting.status}).`,
    };
  }

  const { data: resolutions, error: resolutionsError } = await supabase
    .from("resolution")
    .select("id, festgestellt_am")
    .eq("meeting_id", meetingId);

  if (resolutionsError) {
    console.error("[endMeeting] resolution select failed:", resolutionsError);
    return { error: "Beschlussvorlagen konnten nicht geprüft werden." };
  }

  const resolutionIds = (resolutions ?? []).map((resolution) => resolution.id);
  let votedResolutionIds = new Set<string>();
  let bseResolutionIds = new Set<string>();

  if (resolutionIds.length > 0) {
    const [{ data: votes, error: votesError }, { data: entries, error: entriesError }] =
      await Promise.all([
        supabase
          .from("vote")
          .select("resolution_id")
          .in("resolution_id", resolutionIds),
        supabase
          .from("beschluss_sammlung_entry")
          .select("resolution_id")
          .in("resolution_id", resolutionIds),
      ]);

    if (votesError || entriesError) {
      console.error("[endMeeting] closing checks failed", {
        votesError,
        entriesError,
      });
      return { error: "Beschlussfeststellungen konnten nicht geprüft werden." };
    }

    votedResolutionIds = new Set((votes ?? []).map((vote) => vote.resolution_id));
    bseResolutionIds = new Set(
      (entries ?? [])
        .map((entry) => entry.resolution_id)
        .filter((id): id is string => id !== null),
    );
  }

  const unresolvedVotes = (resolutions ?? []).filter(
    (resolution) =>
      votedResolutionIds.has(resolution.id) &&
      resolution.festgestellt_am === null,
  );
  const missingCollectionEntries = (resolutions ?? []).filter(
    (resolution) =>
      resolution.festgestellt_am !== null && !bseResolutionIds.has(resolution.id),
  );

  if (unresolvedVotes.length > 0 || missingCollectionEntries.length > 0) {
    return {
      error:
        "Versammlung kann nicht beendet werden: Es gibt Stimmen ohne Beschlussfeststellung oder festgestellte Beschlüsse ohne Beschluss-Sammlung-Eintrag.",
    };
  }

  const { error: updateError } = await supabase
    .from("meeting")
    .update({ status: "beendet" })
    .eq("id", meetingId)
    .eq("status", "laufend");

  if (updateError) {
    console.error("[endMeeting] update failed", {
      code: updateError.code,
      hint: updateError.hint,
    });
    return { error: "Versammlung konnte nicht beendet werden." };
  }

  revalidatePath(`/versammlungen/${meetingId}`);
  redirect(`/versammlungen/${meetingId}`);
}
