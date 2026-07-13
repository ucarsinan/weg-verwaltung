"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createPositionAction, type PositionFormState } from "./actions";

interface VersionOption {
  id: string;
  keyName: string;
  typLabel: string;
}

interface PositionFormProps {
  wegId: string;
  planId: string;
  versionOptions: VersionOption[];
}

const initialState: PositionFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
    >
      {pending ? "Speichern …" : "Position hinzufügen"}
    </button>
  );
}

export function PositionForm({ wegId, planId, versionOptions }: PositionFormProps) {
  const boundAction = createPositionAction.bind(null, wegId, planId);
  const [state, formAction] = useActionState(boundAction, initialState);

  if (versionOptions.length === 0) {
    return (
      <p className="text-sm text-[color:var(--color-muted-foreground)]">
        Es ist noch kein Verteilungsschlüssel für diese WEG angelegt. Legen Sie
        zuerst einen an, bevor Sie Positionen hinzufügen.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.errors?._form ? (
        <div
          role="alert"
          className="rounded-md border border-[var(--color-border)] p-3 text-sm text-red-600 dark:text-red-400"
        >
          {state.errors._form.join(" ")}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="kostenart" className="block text-sm font-medium">
            Kostenart <span aria-hidden="true">*</span>
          </label>
          <input
            id="kostenart"
            name="kostenart"
            type="text"
            required
            maxLength={200}
            placeholder="z. B. Hausmeister"
            aria-invalid={state.errors?.kostenart ? true : undefined}
            className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
          />
          {state.errors?.kostenart ? (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {state.errors.kostenart.join(" ")}
            </p>
          ) : null}
        </div>

        <div className="space-y-1">
          <label htmlFor="jahresbetrag" className="block text-sm font-medium">
            Jahresbetrag (€) <span aria-hidden="true">*</span>
          </label>
          <input
            id="jahresbetrag"
            name="jahresbetrag"
            type="number"
            step="0.01"
            min={0}
            required
            aria-invalid={state.errors?.jahresbetrag ? true : undefined}
            className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
          />
          {state.errors?.jahresbetrag ? (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {state.errors.jahresbetrag.join(" ")}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor="beschreibung" className="block text-sm font-medium">
          Beschreibung
        </label>
        <input
          id="beschreibung"
          name="beschreibung"
          type="text"
          maxLength={500}
          className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
        />
      </div>

      <div className="space-y-1">
        <label
          htmlFor="verteilungsschluessel_version_id"
          className="block text-sm font-medium"
        >
          Verteilungsschlüssel <span aria-hidden="true">*</span>
        </label>
        <select
          id="verteilungsschluessel_version_id"
          name="verteilungsschluessel_version_id"
          required
          defaultValue=""
          aria-invalid={
            state.errors?.verteilungsschluessel_version_id ? true : undefined
          }
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
        >
          <option value="" disabled>
            Bitte auswählen
          </option>
          {versionOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.keyName} — {option.typLabel}
            </option>
          ))}
        </select>
        {state.errors?.verteilungsschluessel_version_id ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {state.errors.verteilungsschluessel_version_id.join(" ")}
          </p>
        ) : null}
      </div>

      <SubmitButton />
    </form>
  );
}
