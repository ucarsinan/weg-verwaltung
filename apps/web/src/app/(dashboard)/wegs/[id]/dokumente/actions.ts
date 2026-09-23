"use server";

import { createHash, randomUUID } from "node:crypto";

import type { ActionContext } from "@/modules/action-kernel";
import { logPostgrestError, runFormAction } from "@/modules/action-kernel";
import {
  baueStoragePfad,
  parseDokumentForm,
  parseLoescheDokumentForm,
  parseNeueVersionForm,
} from "@/modules/dokumente";
import type {
  DokumentFormState,
  DokumentInput,
  LoescheDokumentFormState,
  LoescheDokumentInput,
  NeueVersionFormState,
  NeueVersionInput,
} from "@/modules/dokumente";
import type { DocTyp } from "@/lib/supabase/database.types";

export type {
  DokumentFormState,
  LoescheDokumentFormState,
  NeueVersionFormState,
} from "@/modules/dokumente";

/**
 * Entfernt eine hochgeladene Datei wieder, wenn der Datenbankschritt danach
 * scheitert, und protokolliert einen Fehlschlag beim Aufräumen selbst statt
 * ihn zu verschlucken — sonst bleibt eine verwaiste Datei unbemerkt. Von
 * `uploadDokumentAction` und `neueVersionAction` geteilt.
 */
async function raeumeDateiAuf(
  ctx: ActionContext,
  pfad: string,
  scope: string,
): Promise<void> {
  const { error } = await ctx.supabase.storage.from("weg-docs").remove([pfad]);
  if (error) {
    logPostgrestError(scope, { code: error.name, hint: error.message });
  }
}

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
        // Reihenfolge bewusst umgedreht gegenüber einer naiven "Zeile zuerst"-
        // Implementierung: erst hochladen, dann schreiben. `document` hat laut
        // 0015 keine DELETE-Policy (nur Soft-Delete) — ein Dokument ohne Datei
        // wäre also unlöschbar hängen geblieben, wenn der Upload danach
        // scheitert. Der häufigste Fehler (schlechte Datei, Storage-Problem)
        // hinterlässt so gar keine Datenbankzeile.
        const documentId = randomUUID();

        const pfad = baueStoragePfad({
          tenantId: ctx.tenantId,
          wegId: input.wegId,
          docTyp: input.docTyp,
          dokumentId: documentId,
          versionNo: 1,
          dateiname: input.datei.name,
        });

        const bytes = Buffer.from(await input.datei.arrayBuffer());

        // 1. Hochladen.
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

        // 2. Dokumentzeile — mit der schon feststehenden ID.
        const { data: doc, error: docError } = await ctx.supabase
          .from("document")
          .insert({
            id: documentId,
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
          await raeumeDateiAuf(ctx, pfad, "uploadDokument.cleanup.storage");
          return { errors: { errors: { _form: ["Anlegen fehlgeschlagen."] } } };
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
          // Kompensation in zwei Richtungen: Storage und Datenbank liegen
          // nicht in einer Transaktion. Die Datei wird entfernt, UND die
          // gerade erst angelegte Dokumentzeile wird soft-gelöscht — ohne
          // Version wäre sie eine Sackgasse (kein Hard-Delete möglich, 0015).
          // Scheitert eines von beidem, wird das protokolliert statt
          // verschwiegen.
          await raeumeDateiAuf(ctx, pfad, "uploadDokument.cleanup.storage");

          const { error: documentCleanupError } = await ctx.supabase
            .from("document")
            .update({ deleted_at: new Date().toISOString() })
            .eq("id", doc.id);
          if (documentCleanupError) {
            logPostgrestError(
              "uploadDokument.cleanup.document",
              documentCleanupError,
            );
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

export async function neueVersionAction(
  _prev: NeueVersionFormState,
  formData: FormData,
): Promise<NeueVersionFormState> {
  return runFormAction<NeueVersionInput, NeueVersionFormState>(
    {
      scope: "neueVersion",
      guardError: (message) => ({ errors: { _form: [message] } }),
      parse: parseNeueVersionForm,
      execute: async (ctx, input) => {
        // Das Dokument muss existieren, zu dieser WEG gehören und darf nicht
        // soft-gelöscht sein — RLS filtert deleted_at bereits heraus, die
        // weg_id-Prüfung ist zusätzliche Verteidigung gegen eine erratene
        // fremde dokument_id innerhalb desselben Mandanten.
        const { data: doc, error: docError } = await ctx.supabase
          .from("document")
          .select("id, doc_typ")
          .eq("id", input.dokumentId)
          .eq("weg_id", input.wegId)
          .single();

        if (docError || !doc) {
          logPostgrestError("neueVersion.document", docError ?? {});
          return {
            errors: { errors: { _form: ["Dokument wurde nicht gefunden."] } },
          };
        }

        const { data: bisherige, error: bisherigeError } = await ctx.supabase
          .from("document_version")
          .select("version_no")
          .eq("document_id", input.dokumentId)
          .order("version_no", { ascending: false })
          .limit(1);

        if (bisherigeError) {
          logPostgrestError("neueVersion.versionen", bisherigeError);
          return {
            errors: {
              errors: { _form: ["Bisherige Versionen konnten nicht geladen werden."] },
            },
          };
        }

        const naechsteVersionNo = (bisherige?.[0]?.version_no ?? 0) + 1;

        const pfad = baueStoragePfad({
          tenantId: ctx.tenantId,
          wegId: input.wegId,
          docTyp: doc.doc_typ as DocTyp,
          dokumentId: input.dokumentId,
          versionNo: naechsteVersionNo,
          dateiname: input.datei.name,
        });

        const bytes = Buffer.from(await input.datei.arrayBuffer());

        const { error: uploadError } = await ctx.supabase.storage
          .from("weg-docs")
          .upload(pfad, bytes, {
            contentType: input.datei.type,
            upsert: false,
          });

        if (uploadError) {
          logPostgrestError("neueVersion.storage", {
            code: uploadError.name,
            hint: uploadError.message,
          });
          return {
            errors: { errors: { datei: ["Hochladen fehlgeschlagen."] } },
          };
        }

        const sha256 = "\\x" + createHash("sha256").update(bytes).digest("hex");

        const { error: versionError } = await ctx.supabase
          .from("document_version")
          .insert({
            document_id: input.dokumentId,
            version_no: naechsteVersionNo,
            storage_path: pfad,
            mime_type: input.datei.type,
            file_size_bytes: bytes.byteLength,
            sha256,
            uploaded_by: ctx.userId,
          });

        if (versionError) {
          logPostgrestError("neueVersion.version", versionError);
          // Das Dokument selbst bleibt unangetastet — anders als beim
          // Erst-Upload existiert es schon mit mindestens einer gültigen
          // Version, ein Soft-Delete wäre hier falsch.
          await raeumeDateiAuf(ctx, pfad, "neueVersion.cleanup.storage");
          return {
            errors: { errors: { _form: ["Speichern fehlgeschlagen."] } },
          };
        }

        return {
          revalidate: [
            `/wegs/${input.wegId}/dokumente`,
            `/wegs/${input.wegId}/dokumente/${input.dokumentId}`,
          ],
          state: { ok: true },
        };
      },
    },
    formData,
  );
}

export async function loescheDokumentAction(
  _prev: LoescheDokumentFormState,
  formData: FormData,
): Promise<LoescheDokumentFormState> {
  return runFormAction<LoescheDokumentInput, LoescheDokumentFormState>(
    {
      scope: "loescheDokument",
      guardError: (message) => ({ errors: { _form: [message] } }),
      parse: parseLoescheDokumentForm,
      execute: async (ctx, input) => {
        // Nur Soft-Delete: 0015 vergibt bewusst keine DELETE-Policy auf
        // `document`, und das Storage-Objekt bleibt unangetastet — die
        // Verwaltungsunterlagen gehören der WEG, der Verwalter verwahrt sie
        // treuhänderisch und gibt sie heraus, statt sie zu vernichten.
        const { error } = await ctx.supabase
          .from("document")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", input.dokumentId)
          .eq("weg_id", input.wegId);

        if (error) {
          logPostgrestError("loescheDokument", error);
          return {
            errors: {
              errors: { _form: ["Entfernen aus der Liste fehlgeschlagen."] },
            },
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
