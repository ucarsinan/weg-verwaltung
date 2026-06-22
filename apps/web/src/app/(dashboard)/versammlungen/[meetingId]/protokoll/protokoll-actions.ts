"use server";

import { createHash } from "crypto";
import { revalidatePath } from "next/cache";
import { agentJson, AgentAuthError, AgentResponseError } from "@/lib/agent/fetch";
import { createClient } from "@/lib/supabase/server";
import { renderProtokollPDF } from "@/lib/protokoll/render-pdf";

// ---------------------------------------------------------------------------
// Types — mirrors ProtokollResponse from apps/agent/routers/protokoll.py
// ---------------------------------------------------------------------------

export type Konfidenz = "hoch" | "mittel" | "niedrig";

export interface GenerateResult {
  status: "awaiting_review" | "completed" | "error";
  threadId: string | null;
  draft?: string;
  konfidenz?: Konfidenz;
  fehlendenDaten?: string[];
  error?: string;
}

interface AgentProtokollResponse {
  status: "awaiting_review" | "completed";
  thread_id: string;
  draft?: string;
  konfidenz?: Konfidenz;
  fehlende_daten?: string[];
}

export interface SignResult {
  documentId: string;
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

    const data = await agentJson<AgentProtokollResponse>("/agent/protokoll", {
      method: "POST",
      body: JSON.stringify({ meeting_id: meetingId }),
    });

    // Bug 1 + 2 fix: persist the awaiting_review row immediately so the page
    // can render DraftReviewForm after revalidation. The agent's persist_node
    // only runs AFTER the Verwalter resumes the HITL interrupt, so we must
    // write to DB here. Store langgraph_thread_id for the resume call (Bug 3).
    if (data.status === "awaiting_review") {
      const { error: upsertError } = await supabase.from("protocol").upsert(
        {
          meeting_id: meetingId,
          status: "awaiting_review",
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
      draft: data.draft,
      konfidenz: data.konfidenz,
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

  if (protocol.status !== "awaiting_review") {
    throw new Error(
      `Protokoll kann nicht geprüft werden — aktueller Status: ${protocol.status}`,
    );
  }

  try {
    await agentJson<AgentProtokollResponse>("/agent/protokoll", {
      method: "POST",
      body: JSON.stringify({
        meeting_id: meetingId,
        resume_token: threadId,
        edited_draft: editedDraft,
      }),
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
 * Finalizes a Protokoll: renders PDF, uploads to Storage, creates document
 * + document_version rows, and flips protocol.status → "unterzeichnet".
 *
 * This is purely a human action. The KI guard (§ 2 / 0011) already blocks
 * actor_type=agent on Protocol.unterzeichnet at DB level; here we also assert
 * the precondition in application code as a defense-in-depth check.
 */
export async function signProtokoll(protocolId: string): Promise<SignResult> {
  const supabase = await createClient();

  // 1. Load protocol + meeting
  const { data: protocol, error: fetchError } = await supabase
    .from("protocol")
    .select(
      "id, status, text, meeting_id, document_id, meeting!inner(id, weg_id, titel, termin_von, tenant_id, status)",
    )
    .eq("id", protocolId)
    .single();

  if (fetchError || !protocol) {
    throw new Error(`Protokoll nicht gefunden: ${fetchError?.message ?? "unbekannt"}`);
  }

  // 2a. Double-sign guard (Bug 5): defense-in-depth against duplicate calls
  // that would create orphaned document rows.
  if (protocol.document_id) {
    throw new Error(
      "Protokoll wurde bereits unterzeichnet — Dokument ist bereits verknüpft.",
    );
  }

  // 2b. Assert precondition: only ki_entwurf may be signed
  if (protocol.status !== "ki_entwurf") {
    throw new Error(
      `Protokoll kann nicht unterzeichnet werden — aktueller Status: ${protocol.status}`,
    );
  }

  // Cast meeting to a typed shape (Supabase join returns array or object)
  const meeting = Array.isArray(protocol.meeting)
    ? protocol.meeting[0]
    : protocol.meeting;

  if (!meeting) {
    throw new Error("Versammlung zu diesem Protokoll nicht gefunden.");
  }

  if (meeting.status !== "beendet") {
    throw new Error(
      "Protokoll kann erst nach Beenden der Versammlung unterzeichnet werden.",
    );
  }

  // 3. Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Nicht authentifiziert — bitte neu einloggen.");
  }

  // 4. Format datum (German locale)
  const datum = meeting.termin_von
    ? new Date(meeting.termin_von).toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : new Date().toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });

  // 5. Render PDF
  const pdfBuffer = await renderProtokollPDF({
    markdown: protocol.text,
    wegName: meeting.titel,
    datum,
  });

  // 6. Upload to Storage
  const storagePath = `${meeting.tenant_id}/${meeting.weg_id}/protokoll/${protocolId}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from("weg-docs")
    .upload(storagePath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`PDF-Upload fehlgeschlagen: ${uploadError.message}`);
  }

  // 7. SHA-256 checksum (bytea → raw Buffer for the DB column)
  const sha256Bytes = createHash("sha256").update(pdfBuffer).digest();

  // 8. Insert document row
  const { data: doc, error: docError } = await supabase
    .from("document")
    .insert({
      weg_id: meeting.weg_id,
      doc_typ: "protokoll",
      titel: `Protokoll ${meeting.titel}`,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (docError || !doc) {
    throw new Error(`Dokument-Eintrag fehlgeschlagen: ${docError?.message ?? "unbekannt"}`);
  }

  // 9. Insert document_version row
  const { data: version, error: versionError } = await supabase
    .from("document_version")
    .insert({
      document_id: doc.id,
      version_no: 1,
      storage_path: storagePath,
      mime_type: "application/pdf",
      file_size_bytes: pdfBuffer.length,
      sha256: sha256Bytes,
      uploaded_by: user.id,
    })
    .select("id")
    .single();

  if (versionError || !version) {
    throw new Error(
      `Dokument-Version fehlgeschlagen: ${versionError?.message ?? "unbekannt"}`,
    );
  }

  // 10. Update document.current_version_id
  // (Note: the DB trigger tg_document_set_current_version handles this
  // automatically on document_version INSERT; this explicit update is kept
  // as a belt-and-suspenders safety in case the trigger is unavailable.)
  const { error: docUpdateError } = await supabase
    .from("document")
    .update({ current_version_id: version.id })
    .eq("id", doc.id);

  if (docUpdateError) {
    throw new Error(
      `Dokument-Update fehlgeschlagen: ${docUpdateError.message}`,
    );
  }

  // 11. Update protocol → unterzeichnet
  const { error: protocolUpdateError } = await supabase
    .from("protocol")
    .update({
      status: "unterzeichnet",
      unterzeichnet_von: user.id,
      unterzeichnet_am: new Date().toISOString(),
      document_id: doc.id,
    })
    .eq("id", protocolId);

  if (protocolUpdateError) {
    throw new Error(
      `Protokoll-Status-Update fehlgeschlagen: ${protocolUpdateError.message}`,
    );
  }

  // 12. Revalidate cache
  revalidatePath(`/versammlungen/${protocol.meeting_id}/protokoll`);

  // 13. Return document ID
  return { documentId: doc.id };
}
