"use server";

import { revalidatePath } from "next/cache";
import {
  AgentAuthError,
  AgentResponseError,
  postProtokoll,
  type Konfidenz as AgentKonfidenz,
} from "@/modules/agent-bridge";
import { createClient } from "@/lib/supabase/server";
import { renderProtokollPDF } from "@/lib/protokoll/render-pdf";
import {
  canSubmitRevision,
  executeSignProtokoll,
  type ProtocolStatus,
  type SignResult as VersammlungSignResult,
} from "@/modules/versammlung";

// Typen kommen aus agent-bridge/versammlung; hier nur als lokale Aliase
// deklariert — "use server"-Dateien vertragen keine `export type {…}`-
// Re-Exports (Turbopack behandelt jeden Re-Export als Server Action).
export type Konfidenz = AgentKonfidenz;
export type SignResult = VersammlungSignResult;

export interface GenerateResult {
  status: "awaiting_review" | "completed" | "error";
  threadId: string | null;
  draft?: string;
  konfidenz?: Konfidenz;
  fehlendenDaten?: string[];
  error?: string;
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function assertMeetingEnded(
  supabase: SupabaseServerClient,
  meetingId: string,
): Promise<string | null> {
  const { data: meeting, error } = await supabase
    .from("meeting")
    .select("id, status")
    .eq("id", meetingId)
    .single();

  if (error || !meeting) {
    console.error("[protokoll] meeting status check failed:", error);
    return "Versammlung konnte nicht geladen werden.";
  }

  if (meeting.status !== "beendet") {
    return "Protokoll-Generierung und Review sind erst nach Beenden der Versammlung verfügbar.";
  }

  return null;
}

// ---------------------------------------------------------------------------
// generateProtokoll — POST /agent/protokoll, returns structured draft
// ---------------------------------------------------------------------------

/**
 * Calls POST /agent/protokoll and returns a structured GenerateResult.
 *
 * Server Action: JWT is read server-side from the Supabase session via
 * agentJson — the browser never sees the token (§ 4.2 Security Model).
 *
 * Invariant (§ 1 / KI Guard): agent returns a draft only; the Verwalter
 * reviews and signs — the agent cannot set status=unterzeichnet.
 */
export async function generateProtokoll(
  meetingId: string,
): Promise<GenerateResult> {
  if (!meetingId) {
    return { status: "error", threadId: null, error: "Meeting-ID fehlt." };
  }

  try {
    const supabase = await createClient();
    const statusError = await assertMeetingEnded(supabase, meetingId);
    if (statusError) {
      return { status: "error", threadId: null, error: statusError };
    }

    const data = await postProtokoll({ meeting_id: meetingId });

    // Bug 1 + 2 fix: persist the awaiting_review row immediately so the page
    // can render DraftReviewForm after revalidation. The agent's persist_node
    // only runs AFTER the Verwalter resumes the HITL interrupt, so we must
    // write to DB here. Store langgraph_thread_id for the resume call (Bug 3).
    if (data.status === "awaiting_review") {
      const { error: upsertError } = await supabase.from("protocol").upsert(
        {
          meeting_id: meetingId,
          status: "awaiting_review" satisfies ProtocolStatus,
          text: data.draft ?? "",
          generierungs_quelle: "ki",
          langgraph_thread_id: data.thread_id,
        },
        { onConflict: "tenant_id,meeting_id" },
      );
      if (upsertError) {
        console.error("[generateProtokoll] protocol upsert failed:", upsertError);
        return {
          status: "error",
          threadId: null,
          error: `Protokoll konnte nicht gespeichert werden: ${upsertError.message}`,
        };
      }
      revalidatePath(`/versammlungen/${meetingId}/protokoll`);
    }

    return {
      status: data.status,
      threadId: data.thread_id,
      draft: data.draft ?? undefined,
      konfidenz: data.konfidenz ?? undefined,
      fehlendenDaten: data.fehlende_daten,
    };
  } catch (err) {
    if (err instanceof AgentAuthError) {
      return {
        status: "error",
        threadId: null,
        error: "Sitzung abgelaufen — bitte neu einloggen.",
      };
    }
    if (err instanceof AgentResponseError) {
      if (err.status === 400) {
        let detail = "Eingabe wurde vom Prüfsystem abgelehnt.";
        try {
          const parsed = JSON.parse(err.body) as { detail?: string };
          if (typeof parsed.detail === "string") detail = parsed.detail;
        } catch {
          // body was not JSON — keep the fallback
        }
        return { status: "error", threadId: null, error: detail };
      }
      return {
        status: "error",
        threadId: null,
        error: `Protokoll-Generierung temporär nicht verfügbar (${err.status}). Bitte später erneut versuchen.`,
      };
    }
    console.error("[generateProtokoll] unexpected error", err);
    return {
      status: "error",
      threadId: null,
      error: "Unbekannter Fehler bei der Protokoll-Generierung.",
    };
  }
}

// ---------------------------------------------------------------------------
// submitRevision — resume agent thread with Verwalter edits
// ---------------------------------------------------------------------------

/**
 * Resumes the agent protocol thread with the edited draft from the Verwalter.
 * Sends POST /agent/protokoll with resume_token + edited_draft.
 */
export async function submitRevision(
  meetingId: string,
  threadId: string,
  editedDraft: string,
): Promise<void> {
  const supabase = await createClient();
  const statusError = await assertMeetingEnded(supabase, meetingId);
  if (statusError) {
    throw new Error(statusError);
  }

  const { data: protocol, error: protocolError } = await supabase
    .from("protocol")
    .select("id, status")
    .eq("meeting_id", meetingId)
    .single();

  if (protocolError || !protocol) {
    throw new Error("Protokoll-Entwurf nicht gefunden.");
  }

  if (!canSubmitRevision(protocol.status)) {
    throw new Error(
      `Protokoll kann nicht geprüft werden — aktueller Status: ${protocol.status}`,
    );
  }

  try {
    await postProtokoll({
      meeting_id: meetingId,
      resume_token: threadId,
      edited_draft: editedDraft,
    });
  } catch (err) {
    if (err instanceof AgentAuthError) {
      throw new Error("Sitzung abgelaufen — bitte neu einloggen.");
    }
    if (err instanceof AgentResponseError) {
      throw new Error(
        `Revision konnte nicht übermittelt werden (${err.status}). Bitte erneut versuchen.`,
      );
    }
    console.error("[submitRevision] unexpected error", err);
    throw new Error("Unbekannter Fehler beim Übermitteln der Revision.");
  }

  revalidatePath(`/versammlungen/${meetingId}/protokoll`);
}

// ---------------------------------------------------------------------------
// signProtokoll — human-only finalization (no agent involvement)
// ---------------------------------------------------------------------------

/**
 * Finalizes a Protokoll via the Versammlungs-Modul sign pipeline (PDF →
 * Storage → document/document_version → protocol.status = unterzeichnet).
 *
 * This is purely a human action. The KI guard (§ 2 / 0011) already blocks
 * actor_type=agent on Protocol.unterzeichnet at DB level; the pipeline
 * asserts the statemachine precondition as defense-in-depth.
 */
export async function signProtokoll(protocolId: string): Promise<SignResult> {
  const supabase = await createClient();

  const result = await executeSignProtokoll(
    { supabase, renderPdf: renderProtokollPDF },
    protocolId,
  );

  revalidatePath(`/versammlungen/${result.meetingId}/protokoll`);

  return result;
}
