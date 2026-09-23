import type { DocTyp } from "@/lib/supabase/database.types";

/**
 * 10 MB. Dieselbe Zahl steht in apps/web/next.config.ts als
 * serverActions.bodySizeLimit und als file_size_limit am Bucket weg-docs.
 * Weicht eine der drei ab, scheitert der Upload an einer anderen Stelle als
 * der Nutzer erwartet.
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Identisch zur allowed_mime_types-Liste des Buckets aus 0015. */
export const ERLAUBTE_MIME_TYPEN = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export type DateiPruefung = { ok: true } | { ok: false; meldung: string };

export function pruefeDatei(datei: File): DateiPruefung {
  if (datei.size === 0) {
    return { ok: false, meldung: "Die Datei ist leer." };
  }
  if (datei.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      meldung: `Die Datei ist zu groß. Erlaubt sind 10 MB, diese hat ${(
        datei.size /
        1024 /
        1024
      ).toFixed(1)} MB.`,
    };
  }
  if (!(ERLAUBTE_MIME_TYPEN as readonly string[]).includes(datei.type)) {
    return {
      ok: false,
      meldung:
        "Dieser Dateityp ist nicht erlaubt. Möglich sind PDF, PNG, JPEG, DOCX und XLSX.",
    };
  }
  return { ok: true };
}

/**
 * Pfadmuster aus 0015: <tenant>/<weg>/<doc_typ>/<uuid>.<ext>
 *
 * Aus dem Dateinamen wird ausschliesslich die Endung uebernommen. Der Name
 * kommt aus dem Browser und ist Nutzereingabe; er darf den Pfad nicht
 * mitbestimmen.
 */
export function baueStoragePfad(args: {
  tenantId: string;
  wegId: string;
  docTyp: DocTyp;
  dokumentId: string;
  dateiname: string;
}): string {
  const endung = args.dateiname.split(".").pop()?.toLowerCase() ?? "bin";
  const sicher = /^[a-z0-9]{1,8}$/.test(endung) ? endung : "bin";
  return `${args.tenantId}/${args.wegId}/${args.docTyp}/${args.dokumentId}.${sicher}`;
}
