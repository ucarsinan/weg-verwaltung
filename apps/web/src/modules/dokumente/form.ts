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

export interface NeueVersionFormState {
  errors?: {
    datei?: string[];
    _form?: string[];
  };
  ok?: boolean;
}

export interface NeueVersionInput {
  wegId: string;
  dokumentId: string;
  datei: File;
}

/**
 * Validiert nur die Datei — Titel, Art und Dokumentdatum gehören zum
 * Dokument, nicht zur einzelnen Version, und werden hier nicht erneut
 * abgefragt.
 */
export function parseNeueVersionForm(
  formData: FormData,
): ParseResult<NeueVersionInput, NeueVersionFormState> {
  const errors: NonNullable<NeueVersionFormState["errors"]> = {};

  const wegId = String(formData.get("weg_id") ?? "");
  const dokumentId = String(formData.get("dokument_id") ?? "");
  const datei = formData.get("datei");

  if (!UUID_RE.test(wegId) || !UUID_RE.test(dokumentId)) {
    errors._form = ["Ungültiges Dokument."];
  }

  if (!(datei instanceof File)) {
    errors.datei = ["Bitte eine Datei auswählen."];
  } else {
    const pruefung = pruefeDatei(datei);
    if (!pruefung.ok) errors.datei = [pruefung.meldung];
  }

  if (Object.keys(errors).length > 0) return { errors: { errors } };

  return { input: { wegId, dokumentId, datei: datei as File } };
}

export interface LoescheDokumentFormState {
  errors?: {
    _form?: string[];
  };
}

export interface LoescheDokumentInput {
  wegId: string;
  dokumentId: string;
}

export function parseLoescheDokumentForm(
  formData: FormData,
): ParseResult<LoescheDokumentInput, LoescheDokumentFormState> {
  const wegId = String(formData.get("weg_id") ?? "");
  const dokumentId = String(formData.get("dokument_id") ?? "");

  if (!UUID_RE.test(wegId) || !UUID_RE.test(dokumentId)) {
    return { errors: { errors: { _form: ["Ungültiges Dokument."] } } };
  }

  return { input: { wegId, dokumentId } };
}

export interface RegelFormState {
  errors?: {
    doc_typ?: string[];
    jahre?: string[];
    _form?: string[];
  };
  success?: string;
}

export interface RegelInput {
  docTyp: DocTyp;
  /** null bedeutet dauerhaft — wie in public.aufbewahrungsregel.jahre (0069). */
  jahre: number | null;
  rechtsgrundlage: string | null;
  notiz: string | null;
}

/**
 * Exportiert, damit die Mehrdeutigkeit von "0" ohne Datenbank testbar ist:
 * `Number("")` ist `0`, ein leeres Feld muss also VOR dem Parsen erkannt
 * werden — sonst würde es unbemerkt als "0 Jahre" durchgehen und die Frist
 * stillschweigend auf sofort setzen, statt auf dauerhaft (Ruling zu Task 4).
 *
 * Die Grenzen 1..100 spiegeln exakt den CHECK aus 0069
 * (`jahre is null or jahre between 1 and 100`) — eine unsinnig lange Frist
 * wird hier abgewiesen, bevor die Datenbank es müsste.
 */
export function parseRegelForm(
  formData: FormData,
): ParseResult<RegelInput, RegelFormState> {
  const errors: NonNullable<RegelFormState["errors"]> = {};

  const docTyp = String(formData.get("doc_typ") ?? "");
  const jahreRaw = String(formData.get("jahre") ?? "");
  const rechtsgrundlage = String(formData.get("rechtsgrundlage") ?? "").trim();
  const notiz = String(formData.get("notiz") ?? "").trim();

  if (!DOC_TYPEN.includes(docTyp as DocTyp)) {
    errors.doc_typ = ["Unbekannte Dokumentart."];
  }

  let jahre: number | null = null;
  if (jahreRaw !== "") {
    const parsed = Number(jahreRaw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
      errors.jahre = [
        "Bitte eine ganze Zahl zwischen 1 und 100 Jahren angeben, oder das Feld für dauerhaft leer lassen.",
      ];
    } else {
      jahre = parsed;
    }
  }

  if (Object.keys(errors).length > 0) return { errors: { errors } };

  return {
    input: {
      docTyp: docTyp as DocTyp,
      jahre,
      rechtsgrundlage: rechtsgrundlage.length > 0 ? rechtsgrundlage : null,
      notiz: notiz.length > 0 ? notiz : null,
    },
  };
}
