"use server";

import { createHash, randomUUID } from "node:crypto";

import { logPostgrestError, runFormAction } from "@/modules/action-kernel";
import {
  baueStoragePfad,
  parseDokumentForm,
  parseLoescheDokumentForm,
  parseNeueVersionForm,
} from "@/modules/dokumente";
import type {
  DokumentFormState as ModuleDokumentFormState,
  DokumentInput,
  LoescheDokumentFormState as ModuleLoescheDokumentFormState,
  LoescheDokumentInput,
  NeueVersionFormState as ModuleNeueVersionFormState,
  NeueVersionInput,
} from "@/modules/dokumente";
import type { DocTyp } from "@/lib/supabase/database.types";

// Lokale Typ-Aliase statt `export type {...} from …` — dasselbe Muster wie
// agent-actions.ts: "use server"-Dateien vertragen laut dortigem Kommentar
// keine `export type {…}`-Re-Exports unter Turbopack.
export type DokumentFormState = ModuleDokumentFormState;
export type LoescheDokumentFormState = ModuleLoescheDokumentFormState;
export type NeueVersionFormState = ModuleNeueVersionFormState;

/**
 * `weg-docs` vergibt laut 0015 bewusst weder eine UPDATE- noch eine
 * DELETE-Policy auf `storage.objects`: "if a real delete is ever needed, it
 * goes through a SECURITY DEFINER admin function with audit log entry. No
 * app-side path." Eine Server Action kann eine schon hochgeladene Datei also
 * grundsätzlich nicht mehr zurücknehmen, wenn der Datenbankschritt danach
 * scheitert — es gibt keine Kompensation, die das ausführen könnte. Diese
 * Funktion verschweigt die verwaiste Datei deshalb nicht, sondern
 * protokolliert sie auffindbar: vollständiger Pfad und Dokument-ID, damit ein
 * Betreiber sie bei Bedarf über die Admin-Funktion aus 0015 von Hand entfernt.
 */
function protokolliereVerwaisteDatei(
  scope: string,
  pfad: string,
  dokumentId: string,
): void {
  console.error(
    `[${scope}] orphaned storage object — weg-docs grants no delete policy ` +
      "(0015); an uploaded file with no database row was left behind and " +
      "needs manual cleanup via the SECURITY DEFINER admin function",
    { pfad, dokumentId },
  );
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
        // 0. WEG muss existieren und zum Mandanten des Aufrufers gehören —
        // ein reiner Read, KEIN Schreibvorgang, und deshalb kein Widerspruch
        // zur Reihenfolge weiter unten ("Storage vor Dokumentzeile"). Die
        // RLS-Policy `weg_select_own_tenant` (0008) filtert bereits nach
        // `tenant_id`, eine fremde WEG ist hier also ununterscheidbar von
        // einer nicht existierenden — dieselbe Fehlermeldung für beide Fälle
        // verrät nichts über fremde Mandanten. Ohne diesen Read könnte jeder
        // authentifizierte Tenant-User mit einer erfundenen oder fremden
        // `weg_id` einen bis zu 10 MB großen Storage-Eintrag anlegen, den
        // niemand mehr entfernen kann: `weg-docs` vergibt laut 0015 keine
        // DELETE-Policy auf `storage.objects`, verwaiste Objekte werden nur
        // protokolliert (`protokolliereVerwaisteDatei`), nie automatisch
        // gelöscht — und ohne diesen Check wäre das Objekt für eine WEG, die
        // es nie gab, das Ergebnis von jedem einzelnen Versuch.
        const { data: weg, error: wegError } = await ctx.supabase
          .from("weg")
          .select("id")
          .eq("id", input.wegId)
          .single();

        if (wegError || !weg) {
          logPostgrestError("uploadDokument.weg", wegError ?? {});
          return {
            errors: { errors: { _form: ["WEG wurde nicht gefunden."] } },
          };
        }

        // Reihenfolge ab hier bewusst umgedreht gegenüber einer naiven "Zeile
        // zuerst"-Implementierung: erst hochladen, dann schreiben. `document`
        // hat laut 0015 keine DELETE-Policy (nur Soft-Delete) — ein Dokument
        // ohne Datei wäre also unlöschbar hängen geblieben, wenn der Upload
        // danach scheitert. Der häufigste Fehler (schlechte Datei,
        // Storage-Problem) hinterlässt so gar keine Datenbankzeile. Der
        // WEG-Check oben verletzt das nicht: er liest, schreibt aber nichts,
        // verzögert also nur den ersten Schreibschritt (den Upload) um eine
        // Prüfung, die ihn im Fehlerfall verhindert.
        const documentId = randomUUID();
        // Macht einen Retry nach einem gescheiterten Insert kollisionsfrei —
        // siehe Doc-Kommentar von baueStoragePfad.
        const eindeutig = randomUUID().slice(0, 8);

        const pfad = baueStoragePfad({
          tenantId: ctx.tenantId,
          wegId: input.wegId,
          docTyp: input.docTyp,
          dokumentId: documentId,
          versionNo: 1,
          eindeutig,
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
          // Keine Kompensation möglich (siehe protokolliereVerwaisteDatei) —
          // die Datei bleibt im Bucket stehen, protokolliert statt verschwiegen.
          protokolliereVerwaisteDatei("uploadDokument", pfad, documentId);
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
          // Auch hier keine Kompensation der Datei möglich. Die Dokumentzeile
          // wird trotzdem soft-gelöscht — ohne Version wäre sie sonst eine
          // Sackgasse (kein Hard-Delete möglich, 0015); scheitert das,
          // protokolliert wie jeder andere Fehler.
          protokolliereVerwaisteDatei("uploadDokument", pfad, doc.id);

          // Über dieselbe RPC wie loescheDokumentAction (0072) — ein
          // direktes UPDATE scheiterte hier genauso an der SELECT-Policy aus
          // 0015. Nicht still: PostgREST liefert die WITH-CHECK-Ablehnung als
          // harten 42501, `error` war also gesetzt und wurde protokolliert.
          // Ungelesen blieb die Trefferzahl — eine Kompensation, die null
          // Zeilen trifft, blieb deshalb stumm. Beides deckt der
          // Rückgabewert jetzt ab.
          const { data: aufgeraeumt, error: documentCleanupError } =
            await ctx.supabase.rpc("dokument_entfernen", {
              p_dokument_id: doc.id,
              p_weg_id: input.wegId,
            });
          if (documentCleanupError) {
            logPostgrestError(
              "uploadDokument.cleanup.document",
              documentCleanupError,
            );
          } else if (!aufgeraeumt) {
            // Kein Fehler, aber auch kein Treffer. Die Dokumentzeile bleibt
            // ohne Version stehen; sie ist mangels DELETE-Policy nicht
            // entfernbar, also wird sie protokolliert statt verschwiegen.
            logPostgrestError("uploadDokument.cleanup.document", {
              code: "no_rows",
              hint: `dokument_entfernen matched no row for ${doc.id}`,
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
        // Macht einen Retry nach einem gescheiterten Insert kollisionsfrei —
        // ohne diesen Anteil würde ein erneuter Versuch mit unverändertem
        // `naechsteVersionNo` exakt denselben Pfad treffen wie der
        // gescheiterte, und "already exists" scheitern, ohne dass die alte
        // Datei entfernbar wäre (0015: keine DELETE-Policy).
        const eindeutig = randomUUID().slice(0, 8);

        const pfad = baueStoragePfad({
          tenantId: ctx.tenantId,
          wegId: input.wegId,
          docTyp: doc.doc_typ as DocTyp,
          dokumentId: input.dokumentId,
          versionNo: naechsteVersionNo,
          eindeutig,
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
          // Keine Kompensation möglich (0015: keine DELETE-Policy auf
          // storage.objects) — protokolliert statt verschwiegen. Das
          // Dokument selbst bleibt unangetastet: es existiert schon mit
          // mindestens einer gültigen Version, ein Soft-Delete wäre falsch.
          protokolliereVerwaisteDatei("neueVersion", pfad, input.dokumentId);
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
        //
        // Der Soft-Delete geht über die RPC aus 0072, nicht mehr über ein
        // direktes UPDATE. Grund: die SELECT-Policy aus 0015 filtert
        // `deleted_at is null`, und PostgreSQL verlangt, dass die neue Zeile
        // eines UPDATE unter der SELECT-Policy sichtbar bleibt. Ein UPDATE,
        // das `deleted_at` setzt, macht sie unsichtbar und wird abgelehnt
        // (`new row violates row-level security policy for table
        // "document"`). Das lag nicht am `.select("id")` — die Prüfung
        // greift auch ohne RETURNING. Die Policy bleibt, wie sie ist; der
        // Schreibpfad wandert in eine eng geschnittene SECURITY-DEFINER-
        // Funktion, die den Mandanten selbst auflöst und die weg_id weiterhin
        // verlangt.
        //
        // Der Rückgabewert ist Pflicht, nicht Kosmetik: `false` heißt
        // "nichts getroffen" (falsche weg_id, schon entfernt, erratene ID) —
        // ohne die Prüfung würde der Nutzer "entfernt" hören, obwohl nichts
        // passiert ist.
        const { data: entfernt, error } = await ctx.supabase.rpc(
          "dokument_entfernen",
          { p_dokument_id: input.dokumentId, p_weg_id: input.wegId },
        );

        if (error) {
          logPostgrestError("loescheDokument", error);
          return {
            errors: {
              errors: { _form: ["Entfernen aus der Liste fehlgeschlagen."] },
            },
          };
        }

        if (!entfernt) {
          return {
            errors: { errors: { _form: ["Dokument wurde nicht gefunden."] } },
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
