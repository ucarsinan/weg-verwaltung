"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  DOC_TYP_LABEL,
  ERLAUBTE_MIME_TYPEN,
  MAX_UPLOAD_BYTES,
} from "@/modules/dokumente";
import type { DocTyp } from "@/lib/supabase/database.types";

import { uploadDokumentAction, type DokumentFormState } from "../actions";

const initialState: DokumentFormState = {};

const DOC_TYPEN = Object.keys(DOC_TYP_LABEL) as DocTyp[];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
    >
      {pending ? "Hochladen …" : "Hochladen"}
    </button>
  );
}

export default function UploadForm({ wegId }: { wegId: string }) {
  const [state, formAction] = useActionState(uploadDokumentAction, initialState);

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <input type="hidden" name="weg_id" value={wegId} />

      {state.errors?._form && (
        <div
          role="alert"
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-sm text-red-600 dark:text-red-400"
        >
          {state.errors._form.join(" ")}
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor="titel" className="block text-sm font-medium">
          Titel
        </label>
        <input
          id="titel"
          name="titel"
          type="text"
          required
          aria-describedby={state.errors?.titel ? "titel-error" : undefined}
          className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
          placeholder="z. B. Heizungswartung 2019"
        />
        {state.errors?.titel && (
          <p id="titel-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
            {state.errors.titel.join(" ")}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor="doc_typ" className="block text-sm font-medium">
          Art
        </label>
        <select
          id="doc_typ"
          name="doc_typ"
          defaultValue="rechnung"
          aria-describedby={state.errors?.doc_typ ? "doc-typ-error" : undefined}
          className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
        >
          {DOC_TYPEN.map((typ) => (
            <option key={typ} value={typ}>
              {DOC_TYP_LABEL[typ]}
            </option>
          ))}
        </select>
        {state.errors?.doc_typ && (
          <p id="doc-typ-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
            {state.errors.doc_typ.join(" ")}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor="dokument_datum" className="block text-sm font-medium">
          Dokumentdatum
        </label>
        <input
          id="dokument_datum"
          name="dokument_datum"
          type="date"
          required
          aria-describedby={
            state.errors?.dokument_datum ? "dokument-datum-error" : "dokument-datum-hint"
          }
          className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
        />
        {state.errors?.dokument_datum ? (
          <p
            id="dokument-datum-error"
            role="alert"
            className="text-sm text-red-600 dark:text-red-400"
          >
            {state.errors.dokument_datum.join(" ")}
          </p>
        ) : (
          <p
            id="dokument-datum-hint"
            className="text-sm text-[color:var(--color-muted-foreground)]"
          >
            Datum des Dokuments selbst, z. B. das Ausstellungsdatum einer
            Rechnung — nicht der heutige Tag. Ab dessen Jahresende beginnt die
            Aufbewahrungsfrist zu laufen.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor="datei" className="block text-sm font-medium">
          Datei
        </label>
        <input
          id="datei"
          name="datei"
          type="file"
          required
          accept={ERLAUBTE_MIME_TYPEN.join(",")}
          aria-describedby={state.errors?.datei ? "datei-error" : "datei-hint"}
          className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
        />
        {state.errors?.datei ? (
          <p id="datei-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
            {state.errors.datei.join(" ")}
          </p>
        ) : (
          <p id="datei-hint" className="text-sm text-[color:var(--color-muted-foreground)]">
            Erlaubt sind PDF, PNG, JPEG, DOCX und XLSX, maximal{" "}
            {(MAX_UPLOAD_BYTES / 1024 / 1024).toFixed(0)} MB.
          </p>
        )}
      </div>

      <SubmitButton />
    </form>
  );
}
