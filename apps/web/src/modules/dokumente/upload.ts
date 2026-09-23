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
 * Pfadmuster: <tenant>/<weg>/<doc_typ>/<uuid>-v<version_no>-<eindeutig>.<ext>
 *
 * Die Versionsnummer ist Teil des Pfads, nicht nur der Datenbankzeile:
 * `weg-docs` vergibt laut 0015 bewusst keine UPDATE-Policy auf
 * `storage.objects` ("new versions = new object paths, never overwrite").
 * Ohne den Versions-Segment würde eine zweite Version derselben Datei-Endung
 * denselben Pfad treffen wie die erste, und der Upload schlüge mit
 * "already exists" fehl.
 *
 * `eindeutig` ist zusätzlich Pflicht, weil dasselbe für einen *Retry* gilt:
 * `weg-docs` vergibt auch keine DELETE-Policy (0015), eine hochgeladene Datei
 * kann also nicht zurückgenommen werden, wenn der Datenbank-Insert danach
 * scheitert — sie bleibt verwaist im Bucket stehen (protokolliert, siehe
 * `dokumente/actions.ts`). Ohne diesen Zufallsanteil würde ein erneuter
 * Versuch exakt denselben Pfad wie der gescheiterte errechnen
 * (`max(version_no) + 1` ändert sich nicht, wenn der Insert nie ankam) und
 * mit "already exists" scheitern — das Dokument wäre für immer
 * unversionierbar. Der Aufrufer liefert die Zufälligkeit (z. B.
 * `randomUUID().slice(0, 8)`), diese Funktion bleibt dadurch rein und
 * testbar.
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
  versionNo: number;
  eindeutig: string;
  dateiname: string;
}): string {
  const endung = args.dateiname.split(".").pop()?.toLowerCase() ?? "bin";
  const sicher = /^[a-z0-9]{1,8}$/.test(endung) ? endung : "bin";
  return `${args.tenantId}/${args.wegId}/${args.docTyp}/${args.dokumentId}-v${args.versionNo}-${args.eindeutig}.${sicher}`;
}
