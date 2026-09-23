/**
 * Reine Formularvalidierung fuer den Dokument-Upload — ohne Datenbankzugriff.
 *
 * Next.js verlangt, dass eine "use server"-Datei ausschliesslich async
 * Funktionen exportiert; ein exportiertes synchrones `parseDokumentForm`
 * wuerde den Build brechen. Die reine Logik steht deshalb hier, nach dem
 * Muster von `modules/finanzen/verteilungsschluessel.ts` (`pruefeTeile` neben
 * den Actions, die sie nutzen).
 */

import type { ParseResult } from "@/modules/action-kernel";
import type { DocTyp } from "@/lib/supabase/database.types";
import { pruefeDatei } from "./upload";

export interface DokumentFormState {
  errors?: {
    titel?: string[];
    doc_typ?: string[];
    dokument_datum?: string[];
    datei?: string[];
    _form?: string[];
  };
}

export interface DokumentInput {
  wegId: string;
  titel: string;
  docTyp: DocTyp;
  dokumentDatum: string;
  datei: File;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DOC_TYPEN: DocTyp[] = [
  "beschluss",
  "protokoll",
  "doku",
  "rechnung",
  "vertrag",
  "bescheid",
  "korrespondenz",
];

/** Exportiert, damit die Validierung ohne Datenbank testbar ist. */
export function parseDokumentForm(
  formData: FormData,
): ParseResult<DokumentInput, DokumentFormState> {
  const errors: NonNullable<DokumentFormState["errors"]> = {};

  const wegId = String(formData.get("weg_id") ?? "");
  const titel = String(formData.get("titel") ?? "").trim();
  const docTyp = String(formData.get("doc_typ") ?? "");
  const dokumentDatum = String(formData.get("dokument_datum") ?? "");
  const datei = formData.get("datei");

  if (!UUID_RE.test(wegId)) errors._form = ["Ungültige WEG."];
  if (titel.length === 0) errors.titel = ["Bitte einen Titel angeben."];
  if (!DOC_TYPEN.includes(docTyp as DocTyp)) {
    errors.doc_typ = ["Bitte eine Dokumentart wählen."];
  }

  if (!ISO_DATE_RE.test(dokumentDatum)) {
    errors.dokument_datum = ["Bitte das Datum des Dokuments angeben."];
  } else if (dokumentDatum > new Date().toISOString().slice(0, 10)) {
    // Ein Datum in der Zukunft würde die Aufbewahrungsfrist zu lang machen.
    errors.dokument_datum = ["Das Datum darf nicht in der Zukunft liegen."];
  }

  if (!(datei instanceof File)) {
    errors.datei = ["Bitte eine Datei auswählen."];
  } else {
    const pruefung = pruefeDatei(datei);
    if (!pruefung.ok) errors.datei = [pruefung.meldung];
  }

  if (Object.keys(errors).length > 0) return { errors: { errors } };

  return {
    input: {
      wegId,
      titel,
      docTyp: docTyp as DocTyp,
      dokumentDatum,
      datei: datei as File,
    },
  };
}
