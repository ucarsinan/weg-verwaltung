/**
 * Unterzeichnungs-Pipeline für ein Protokoll (Mensch-only, § 24 Abs. 7 WEG).
 *
 * Implementierung hinter dem Versammlungs-Modul: PDF rendern → Storage-Upload
 * → document + document_version anlegen → protocol auf `unterzeichnet`
 * setzen. Nimmt ihre Abhängigkeiten (Supabase-Client, PDF-Renderer, Uhr)
 * entgegen, damit die Pipeline durch ihr Interface testbar ist — der
 * Next-spezifische Teil (revalidatePath) bleibt in der Server Action.
 *
 * Der KI-Guard (0011) blockt actor_type=agent auf Protocol.unterzeichnet
 * zusätzlich in der DB; `canSign` hier ist Defense-in-Depth.
 */

import { createHash } from "crypto";

import type { createClient } from "@/lib/supabase/server";
import { canSign } from "./protokoll-status";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export interface SignResult {
  documentId: string;
  meetingId: string;
}

export interface SignProtokollDeps {
  supabase: SupabaseServerClient;
  renderPdf: (input: {
    markdown: string;
    wegName: string;
    datum: string;
  }) => Promise<Buffer>;
  now?: () => Date;
}

function formatDatumDE(date: Date): string {
  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export async function executeSignProtokoll(
  deps: SignProtokollDeps,
  protocolId: string,
): Promise<SignResult> {
  const { supabase, renderPdf } = deps;
  const now = deps.now ?? (() => new Date());

  // 1. Load protocol + meeting
  const { data: protocol, error: fetchError } = await supabase
    .from("protocol")
    .select(
      "id, status, text, meeting_id, document_id, meeting!inner(id, weg_id, titel, termin_von, tenant_id, status)",
    )
    .eq("id", protocolId)
    .single();

  if (fetchError || !protocol) {
    throw new Error(
      `Protokoll nicht gefunden: ${fetchError?.message ?? "unbekannt"}`,
    );
  }

  // 2a. Double-sign guard: defense-in-depth against duplicate calls that
  // would create orphaned document rows.
  if (protocol.document_id) {
    throw new Error(
      "Protokoll wurde bereits unterzeichnet — Dokument ist bereits verknüpft.",
    );
  }

  // 2b. Statemachine-Vorbedingung: nur ki_entwurf darf unterzeichnet werden.
  if (!canSign(protocol.status)) {
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
  const datum = formatDatumDE(
    meeting.termin_von ? new Date(meeting.termin_von) : now(),
  );

  // 5. Render PDF
  const pdfBuffer = await renderPdf({
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

  // 7. SHA-256 checksum. PostgREST expects a bytea argument as a "\x"-prefixed
  // hex string; a raw Buffer would be JSON-serialized as {"type":"Buffer",...}
  // and is not valid bytea input.
  const sha256Hex =
    "\\x" + createHash("sha256").update(pdfBuffer).digest("hex");

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
    throw new Error(
      `Dokument-Eintrag fehlgeschlagen: ${docError?.message ?? "unbekannt"}`,
    );
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
      sha256: sha256Hex,
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
    throw new Error(`Dokument-Update fehlgeschlagen: ${docUpdateError.message}`);
  }

  // 11. Update protocol → unterzeichnet
  const { error: protocolUpdateError } = await supabase
    .from("protocol")
    .update({
      status: "unterzeichnet",
      unterzeichnet_von: user.id,
      unterzeichnet_am: now().toISOString(),
      document_id: doc.id,
    })
    .eq("id", protocolId);

  if (protocolUpdateError) {
    throw new Error(
      `Protokoll-Status-Update fehlgeschlagen: ${protocolUpdateError.message}`,
    );
  }

  return { documentId: doc.id, meetingId: protocol.meeting_id };
}
