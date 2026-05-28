"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { createWeg, type WegFormState } from "./actions";

// Client island for the Anlage-Form. Uses React 19 useActionState +
// useFormStatus for the pending-state surface (docs/05 §5.9 — Auto-Save is
// out of scope here; this is a Lifecycle-Button with explicit Intent).
//
// A11y per §5.10:
//  - noValidate on the form so we control German error messaging instead
//    of browser-native en-US fallbacks.
//  - aria-invalid + aria-describedby wire each field to its error region.
//  - Form-level error and per-field errors use role="alert" so screen
//    readers announce them on update.
//  - aria-required="true" mirrors the visible asterisk for the name field.
//  - SubmitButton sets aria-busy while pending (no spinner needed — the
//    text changes are sufficient and quieter for AT users).
//
// Safe defaults per §5.6:
//  - No pre-filled values. A WEG name is a legal commitment; the form must
//    start empty so the act of typing the name is captured as user intent.
//  - Most-required field first (name → adresse).

const initialState: WegFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
    >
      {pending ? "Speichern …" : "Speichern"}
    </button>
  );
}

export function WegForm() {
  const [state, formAction] = useActionState(createWeg, initialState);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.errors?._form ? (
        <div
          id="form-error"
          role="alert"
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-sm text-red-600 dark:text-red-400"
        >
          {state.errors._form.join(" ")}
        </div>
      ) : null}

      <div className="space-y-1">
        <label htmlFor="name" className="block text-sm font-medium">
          Name der WEG <span aria-hidden="true">*</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          aria-required="true"
          aria-invalid={state.errors?.name ? true : undefined}
          aria-describedby={state.errors?.name ? "name-error" : undefined}
          minLength={3}
          maxLength={200}
          autoComplete="off"
          className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
        />
        {state.errors?.name ? (
          <p
            id="name-error"
            role="alert"
            className="text-sm text-red-600 dark:text-red-400"
          >
            {state.errors.name.join(" ")}
          </p>
        ) : null}
      </div>

      <div className="space-y-1">
        <label htmlFor="adresse" className="block text-sm font-medium">
          Adresse
        </label>
        <textarea
          id="adresse"
          name="adresse"
          rows={3}
          maxLength={500}
          autoComplete="off"
          aria-invalid={state.errors?.adresse ? true : undefined}
          aria-describedby={
            state.errors?.adresse ? "adresse-error" : undefined
          }
          className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
        />
        {state.errors?.adresse ? (
          <p
            id="adresse-error"
            role="alert"
            className="text-sm text-red-600 dark:text-red-400"
          >
            {state.errors.adresse.join(" ")}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-4 pt-2">
        <Link
          href="/wegs"
          className="text-sm underline underline-offset-4 hover:text-[var(--color-accent)]"
        >
          Abbrechen
        </Link>
        <SubmitButton />
      </div>
    </form>
  );
}
