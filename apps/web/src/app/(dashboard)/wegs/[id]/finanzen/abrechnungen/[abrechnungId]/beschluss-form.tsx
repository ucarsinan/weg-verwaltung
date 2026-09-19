"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  beschliesseAbrechnungAction,
  type BeschlussFormState,
} from "../actions";

const initialState: BeschlussFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
    >
      {pending ? "Beschließen …" : "Abrechnung beschließen"}
    </button>
  );
}

export default function BeschlussForm({
  wegId,
  abrechnungId,
}: {
  wegId: string;
  abrechnungId: string;
}) {
  const [state, formAction] = useActionState(
    beschliesseAbrechnungAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="weg_id" value={wegId} />
      <input type="hidden" name="abrechnung_id" value={abrechnungId} />

      {state.errors?._form && (
        <div
          role="alert"
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-sm text-red-600 dark:text-red-400"
        >
          {state.errors._form.join(" ")}
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor="beschlossen_am" className="block text-sm font-medium">
          Datum der Beschlussfassung
        </label>
        <input
          id="beschlossen_am"
          name="beschlossen_am"
          type="date"
          required
          aria-describedby={
            state.errors?.beschlossen_am ? "beschluss-error" : "beschluss-hint"
          }
          className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm sm:w-56"
        />
        {state.errors?.beschlossen_am ? (
          <p
            id="beschluss-error"
            role="alert"
            className="text-sm text-red-600 dark:text-red-400"
          >
            {state.errors.beschlossen_am.join(" ")}
          </p>
        ) : (
          <p
            id="beschluss-hint"
            className="text-sm text-[color:var(--color-muted-foreground)]"
          >
            Die Spitze schuldet, wer zu diesem Datum Eigentümer ist — nicht, wer
            es im Abrechnungsjahr war.
          </p>
        )}
      </div>

      <SubmitButton />
    </form>
  );
}
