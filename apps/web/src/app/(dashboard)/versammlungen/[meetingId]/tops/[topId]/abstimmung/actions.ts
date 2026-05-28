"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { VoteWert, VoteQuelle } from "@/lib/supabase/database.types";

const VALID_WERT: VoteWert[] = ["ja", "nein", "enthaltung"];

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
  const { error } = await supabase.from("vote").upsert(
    {
      resolution_id: resolutionId,
      ownership_id,
      wert: wert as VoteWert,
      quelle: "praesenz" as VoteQuelle,
    },
    { onConflict: "resolution_id,ownership_id" },
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
