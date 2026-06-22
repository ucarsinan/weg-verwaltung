"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { VoteWert, VoteQuelle } from "@/lib/supabase/database.types";

const VALID_WERT: VoteWert[] = ["ja", "nein", "enthaltung"];

export interface FeststellenResolutionState {
  error?: string;
}

export async function feststellenResolution(
  resolutionId: string,
  meetingId: string,
  topId: string,
  _prev: FeststellenResolutionState,
  _formData: FormData,
): Promise<FeststellenResolutionState> {
  void _prev;
  void _formData;

  const supabase = await createClient();

  const { error } = await supabase.rpc("feststellen_resolution", {
    p_resolution_id: resolutionId,
  });

  if (error) {
    console.error("[feststellenResolution] rpc failed", {
      code: error.code,
      hint: error.hint,
      message: error.message,
    });
    return {
      error:
        error.code === "23505"
          ? "Beschluss wurde bereits festgestellt. Eine erneute Feststellung ist nicht zulässig."
          : "Beschluss konnte nicht festgestellt werden. Bitte prüfen Sie Stimmen, Eigentümerschaft und Beschluss-Sammlung.",
    };
  }

  revalidatePath(`/versammlungen/${meetingId}/tops/${topId}/abstimmung`);
  redirect(`/versammlungen/${meetingId}/tops/${topId}/abstimmung`);
}

export async function castVote(
  resolutionId: string,
  meetingId: string,
  topId: string,
  formData: FormData,
): Promise<void> {
  const ownership_id = String(formData.get("ownership_id") ?? "").trim();
  const wert = String(formData.get("wert") ?? "").trim();

  if (!ownership_id || !VALID_WERT.includes(wert as VoteWert)) {
    return;
  }

  const supabase = await createClient();
  const { data: resolution, error: resolutionError } = await supabase
    .from("resolution")
    .select("id, festgestellt_am")
    .eq("id", resolutionId)
    .single();

  if (resolutionError || !resolution) {
    console.error("[castVote] resolution select failed", {
      code: resolutionError?.code,
      hint: resolutionError?.hint,
    });
    return;
  }

  if (resolution.festgestellt_am !== null) {
    console.warn("[castVote] rejected vote after Feststellung", {
      resolutionId,
    });
    return;
  }

  const { data: meeting, error: meetingError } = await supabase
    .from("meeting")
    .select("id, status")
    .eq("id", meetingId)
    .single();

  if (meetingError || !meeting) {
    console.error("[castVote] meeting select failed", {
      code: meetingError?.code,
      hint: meetingError?.hint,
    });
    return;
  }

  if (meeting.status !== "laufend") {
    console.warn("[castVote] rejected vote outside laufend meeting", {
      meetingId,
      status: meeting.status,
    });
    return;
  }

  // Vote-UNIQUE in 0004: (tenant_id, resolution_id, ownership_id) — alle
  // drei Spalten müssen in onConflict referenziert werden, sonst 42P10
  // (invalid_column_reference: kein passendes UNIQUE). tenant_id wird
  // beim Insert vom Column-Default `public.tenant_id()` aufgelöst, so
  // dass der Konflikt-Check trotzdem matched.
  const { error } = await supabase.from("vote").upsert(
    {
      resolution_id: resolutionId,
      ownership_id,
      wert: wert as VoteWert,
      quelle: "praesenz" as VoteQuelle,
    },
    { onConflict: "tenant_id,resolution_id,ownership_id" },
  );

  if (error) {
    console.error("[castVote] upsert failed", {
      code: error.code,
      hint: error.hint,
    });
    return;
  }

  revalidatePath(`/versammlungen/${meetingId}/tops/${topId}/abstimmung`);
  redirect(`/versammlungen/${meetingId}/tops/${topId}/abstimmung`);
}
