"use server";

import { createHash } from "node:crypto";

import { logPostgrestError, runFormAction } from "@/modules/action-kernel";
import { baueStoragePfad, parseDokumentForm } from "@/modules/dokumente";
import type { DokumentFormState, DokumentInput } from "@/modules/dokumente";

export type { DokumentFormState } from "@/modules/dokumente";

export async function uploadDokumentAction(
  _prev: DokumentFormState,
  formData: FormData,
): Promise<DokumentFormState> {
  return runFormAction<DokumentInput, DokumentFormState>(
    {
      scope: "uploadDokument",
      guardError: (message) => ({ errors: { _form: [message] } }),
      parse: parseDokumentForm,
      execute: async (ctx, input) => {
        // 1. Dokumentzeile zuerst — sie liefert die ID für den Pfad.
        const { data: doc, error: docError } = await ctx.supabase
          .from("document")
          .insert({
            weg_id: input.wegId,
            doc_typ: input.docTyp,
            titel: input.titel,
            dokument_datum: input.dokumentDatum,
            created_by: ctx.userId,
          })
          .select("id")
          .single();

        if (docError || !doc) {
          logPostgrestError("uploadDokument.document", docError ?? {});
          return { errors: { errors: { _form: ["Anlegen fehlgeschlagen."] } } };
        }

        const pfad = baueStoragePfad({
          tenantId: ctx.tenantId,
          wegId: input.wegId,
          docTyp: input.docTyp,
          dokumentId: doc.id,
          dateiname: input.datei.name,
        });

        const bytes = Buffer.from(await input.datei.arrayBuffer());

        // 2. Hochladen.
        const { error: uploadError } = await ctx.supabase.storage
          .from("weg-docs")
          .upload(pfad, bytes, {
            contentType: input.datei.type,
            upsert: false,
          });

        if (uploadError) {
          // StorageError hat kein `code`/`hint` (anders als PostgrestError) —
          // deshalb hier explizit auf PostgrestErrorLike abgebildet, statt
          // logPostgrestError mit einem strukturell fremden Fehlertyp
          // aufzurufen.
          logPostgrestError("uploadDokument.storage", {
            code: uploadError.name,
            hint: uploadError.message,
          });
          return {
            errors: { errors: { datei: ["Hochladen fehlgeschlagen."] } },
          };
        }

        // 3. Version eintragen. Die Prüfsumme entsteht hier, serverseitig —
        //    eine im Browser gerechnete wäre nur eine Behauptung des Clients
        //    und könnte späteres Verändern nicht mehr belegen.
        const sha256 = "\\x" + createHash("sha256").update(bytes).digest("hex");

        const { error: versionError } = await ctx.supabase
          .from("document_version")
          .insert({
            document_id: doc.id,
            version_no: 1,
            storage_path: pfad,
            mime_type: input.datei.type,
            file_size_bytes: bytes.byteLength,
            sha256,
            uploaded_by: ctx.userId,
          });

        if (versionError) {
          logPostgrestError("uploadDokument.version", versionError);
          // Kompensation: Storage und Datenbank liegen nicht in einer
          // Transaktion. Scheitert auch das Aufräumen, wird es protokolliert
          // statt verschwiegen — sonst bleibt eine verwaiste Datei unbemerkt.
          const { error: cleanupError } = await ctx.supabase.storage
            .from("weg-docs")
            .remove([pfad]);
          if (cleanupError) {
            logPostgrestError("uploadDokument.cleanup", {
              code: cleanupError.name,
              hint: cleanupError.message,
            });
          }
          return {
            errors: { errors: { _form: ["Speichern fehlgeschlagen."] } },
          };
        }

        return {
          revalidate: [`/wegs/${input.wegId}/dokumente`],
          redirectTo: `/wegs/${input.wegId}/dokumente`,
        };
      },
    },
    formData,
  );
}
