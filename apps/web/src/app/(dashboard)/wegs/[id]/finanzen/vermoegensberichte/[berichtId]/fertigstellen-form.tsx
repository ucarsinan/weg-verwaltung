"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  stelleFertigAction,
  type FertigstellenFormState,
} from "../actions";

const initialState: FertigstellenFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
    >
      {pending ? "Fertigstellen …" : "Bericht fertigstellen"}
    </button>
  );
}

export default function FertigstellenForm({
  wegId,
  berichtId,
}: {
  wegId: string;
  berichtId: string;
}) {
  const [state, formAction] = useActionState(stelleFertigAction, initialState);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="weg_id" value={wegId} />
      <input type="hidden" name="bericht_id" value={berichtId} />

      {state.errors?._form && (
        <div
          role="alert"
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-sm text-red-600 dark:text-red-400"
        >
          {state.errors._form.join(" ")}
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor="erstellt_am" className="block text-sm font-medium">
          Datum der Erstellung
        </label>
        <input
          id="erstellt_am"
          name="erstellt_am"
          type="date"
          required
          aria-describedby={
            state.errors?.erstellt_am ? "erstellt-error" : "erstellt-hint"
          }
          className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm sm:w-56"
        />
        {state.errors?.erstellt_am ? (
          <p
            id="erstellt-error"
            role="alert"
            className="text-sm text-red-600 dark:text-red-400"
          >
            {state.errors.erstellt_am.join(" ")}
          </p>
        ) : (
          <p
            id="erstellt-hint"
            className="text-sm text-[color:var(--color-muted-foreground)]"
          >
            Ab diesem Tag ist der Bericht unveränderlich. Er wird damit nicht
            beschlossen — er wird den Eigentümern zur Verfügung gestellt.
          </p>
        )}
      </div>

      <SubmitButton />
    </form>
  );
}
