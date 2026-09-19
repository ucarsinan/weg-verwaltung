"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { erstelleAbrechnungAction, type AbrechnungFormState } from "./actions";

const initialState: AbrechnungFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
    >
      {pending ? "Erstellen …" : "Abrechnung erstellen"}
    </button>
  );
}

export default function AbrechnungForm({
  wegId,
  vorschlagJahr,
}: {
  wegId: string;
  vorschlagJahr: number;
}) {
  const [state, formAction] = useActionState(
    erstelleAbrechnungAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4" noValidate>
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
        <label htmlFor="jahr" className="block text-sm font-medium">
          Abrechnungsjahr
        </label>
        <input
          id="jahr"
          name="jahr"
          type="number"
          min="1900"
          max="2100"
          step="1"
          required
          defaultValue={vorschlagJahr}
          aria-describedby={state.errors?.jahr ? "jahr-error" : "jahr-hint"}
          className="w-40 rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm tabular-nums"
        />
        {state.errors?.jahr ? (
          <p id="jahr-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
            {state.errors.jahr.join(" ")}
          </p>
        ) : (
          <p id="jahr-hint" className="text-sm text-[color:var(--color-muted-foreground)]">
            Übernimmt alle Ausgaben dieses Jahres als Momentaufnahme. Später
            gebuchte Ausgaben ändern eine erstellte Abrechnung nicht mehr.
          </p>
        )}
      </div>

      <SubmitButton />
    </form>
  );
}
