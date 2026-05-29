"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function acceptSuggestion(
  meetingId: string,
  suggestionId: string,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Nicht authentifiziert." };
  }

  const { error } = await supabase
    .from("agent_suggestion")
    .update({
      status: "uebernommen",
      entschieden_von: user.id,
      entschieden_am: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", suggestionId)
    .eq("status", "vorschlag");

  if (error) {
    console.error("[acceptSuggestion] update failed", {
      code: error.code,
      hint: error.hint,
    });
    return { error: "Vorschlag konnte nicht übernommen werden." };
  }

  revalidatePath(`/versammlungen/${meetingId}/vorschlaege`);
  return {};
}

export async function rejectSuggestion(
  meetingId: string,
  suggestionId: string,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Nicht authentifiziert." };
  }

  const { error } = await supabase
    .from("agent_suggestion")
    .update({
      status: "verworfen",
      entschieden_von: user.id,
      entschieden_am: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", suggestionId)
    .eq("status", "vorschlag");

  if (error) {
    console.error("[rejectSuggestion] update failed", {
      code: error.code,
      hint: error.hint,
    });
    return { error: "Vorschlag konnte nicht verworfen werden." };
  }

  revalidatePath(`/versammlungen/${meetingId}/vorschlaege`);
  return {};
}
