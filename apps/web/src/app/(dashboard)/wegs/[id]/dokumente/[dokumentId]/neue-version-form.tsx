"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { ERLAUBTE_MIME_TYPEN, MAX_UPLOAD_BYTES } from "@/modules/dokumente";

import { neueVersionAction, type NeueVersionFormState } from "../actions";

const initialState: NeueVersionFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="shrink-0 rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-medium disabled:opacity-60"
    >
      {pending ? "Hochladen …" : "Neue Version hochladen"}
    </button>
  );
}

export default function NeueVersionForm({
  wegId,
  dokumentId,
}: {
  wegId: string;
  dokumentId: string;
}) {
  const [state, formAction] = useActionState(neueVersionAction, initialState);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-md border border-dashed border-[color:var(--color-border)] p-4 sm:flex-row sm:items-end sm:justify-between"
      noValidate
    >
      <input type="hidden" name="weg_id" value={wegId} />
      <input type="hidden" name="dokument_id" value={dokumentId} />

      <div className="min-w-0 flex-1 space-y-2">
        <label htmlFor="neue-version-datei" className="block text-sm font-medium">
          Neue Version
        </label>
        <input
          id="neue-version-datei"
          name="datei"
          type="file"
          required
          accept={ERLAUBTE_MIME_TYPEN.join(",")}
          aria-describedby={
            state.errors?.datei ? "neue-version-datei-error" : "neue-version-datei-hint"
          }
          className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
        />
        {state.errors?.datei ? (
          <p
            id="neue-version-datei-error"
            role="alert"
            className="text-sm text-red-600 dark:text-red-400"
          >
            {state.errors.datei.join(" ")}
          </p>
        ) : (
          <p
            id="neue-version-datei-hint"
            className="text-sm text-[color:var(--color-muted-foreground)]"
          >
            Ersetzt keine vorhandene Version — maximal{" "}
            {(MAX_UPLOAD_BYTES / 1024 / 1024).toFixed(0)} MB.
          </p>
        )}
        {state.errors?._form && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {state.errors._form.join(" ")}
          </p>
        )}
      </div>

      <SubmitButton />
    </form>
  );
}
