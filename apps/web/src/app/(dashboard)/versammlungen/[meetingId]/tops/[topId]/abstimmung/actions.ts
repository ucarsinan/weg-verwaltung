"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { evaluateMajority } from "@/lib/voting/majority";
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

  const { data: existing, error: selectError } = await supabase
    .from("resolution")
    .select("id, festgestellt_am")
    .eq("id", resolutionId)
    .single();

  if (selectError || !existing) {
    console.error("[feststellenResolution] select failed:", selectError);
    return { error: "Beschlussvorlage konnte nicht geladen werden." };
  }

  if (existing.festgestellt_am !== null) {
    return {
      error:
        "Beschluss wurde bereits festgestellt. Eine erneute Feststellung ist nicht zulässig.",
    };
  }

  const { error: updateError } = await supabase
    .from("resolution")
    .update({ festgestellt_am: new Date().toISOString() })
    .eq("id", resolutionId);

  if (updateError) {
    console.error("[feststellenResolution] update failed", {
      code: updateError.code,
      hint: updateError.hint,
    });
    return { error: "Beschluss konnte nicht festgestellt werden." };
  }

  // § 24 Abs. 7 WEG: unverzüglicher Eintrag in die Beschluss-Sammlung
  // (Invariante 3 — append-only via Trigger in 0005). Zwei-Schritt-Logik
  // bewusst nicht atomar: die Feststellung ist konstitutiv (BGH V ZR 113/12)
  // und steht auch ohne Sammlung-Eintrag; ein fehlgeschlagener Append wird
  // geloggt und kann später manuell über /wegs/[id]/beschluss-sammlung/new
  // nachgetragen werden.
  await appendToBeschlussSammlung(supabase, resolutionId, meetingId);

  revalidatePath(`/versammlungen/${meetingId}/tops/${topId}/abstimmung`);
  redirect(`/versammlungen/${meetingId}/tops/${topId}/abstimmung`);
}

async function appendToBeschlussSammlung(
  supabase: Awaited<ReturnType<typeof createClient>>,
  resolutionId: string,
  meetingId: string,
): Promise<void> {
  const [
    { data: user },
    { data: resolution },
    { data: meeting },
    { data: votes },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("resolution")
      .select("text, mehrheits_typ")
      .eq("id", resolutionId)
      .single(),
    supabase.from("meeting").select("weg_id, modus").eq("id", meetingId).single(),
    supabase.from("vote").select("wert").eq("resolution_id", resolutionId),
  ]);

  if (!user.user) {
    console.error(
      "[appendToBeschlussSammlung] no authenticated user — skipping",
    );
    return;
  }

  if (!resolution || !meeting) {
    console.error(
      "[appendToBeschlussSammlung] missing resolution or meeting — skipping",
    );
    return;
  }

  // Tally aggregation + Strategy-Modul-Auswertung. MEA-Daten und
  // total_eligible aktuell nicht ermittelt — der Strategy fällt für
  // doppelt_qualifiziert/allstimmig in einen explizit dokumentierten
  // Fallback-Pfad. Wenn das jemals fachlich kritisch wird, hier
  // ownership + MEA-Summen joinen.
  let jaCount = 0;
  let neinCount = 0;
  let enthaltungCount = 0;
  for (const vote of votes ?? []) {
    if (vote.wert === "ja") jaCount++;
    else if (vote.wert === "nein") neinCount++;
    else if (vote.wert === "enthaltung") enthaltungCount++;
  }

  const evaluation = evaluateMajority(
    { ja: jaCount, nein: neinCount, enthaltung: enthaltungCount },
    resolution.mehrheits_typ,
  );

  const typ: "positiv_beschluss" | "negativ_beschluss" | "umlaufbeschluss" =
    meeting.modus === "umlauf" ? "umlaufbeschluss" : evaluation.outcome;

  const { error: insertError } = await supabase
    .from("beschluss_sammlung_entry")
    .insert({
      weg_id: meeting.weg_id,
      meeting_id: meetingId,
      resolution_id: resolutionId,
      beschluss_text: resolution.text,
      datum: new Date().toISOString().slice(0, 10),
      typ,
      erstellt_durch: user.user.id,
    });

  if (insertError) {
    console.error("[appendToBeschlussSammlung] insert failed", {
      code: insertError.code,
      hint: insertError.hint,
    });
  }
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
