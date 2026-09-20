"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { createPositionAction, type PositionFormState } from "./actions";

export interface SchluesselOption {
  versionId: string;
  label: string;
  buchbar: boolean;
}

interface PositionFormProps {
  wegId: string;
  planId: string;
  schluessel: SchluesselOption[];
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
      {pending ? "Hinzufügen …" : "Position hinzufügen"}
    </button>
  );
}

export default function PositionForm({
  wegId,
  planId,
  schluessel,
}: PositionFormProps) {
  const [state, formAction] = useActionState(createPositionAction, initialState);
  const buchbare = schluessel.filter((option) => option.buchbar);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="weg_id" value={wegId} />
      <input type="hidden" name="plan_id" value={planId} />

      {state.errors?._form && (
        <div
          role="alert"
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-sm text-red-600 dark:text-red-400"
        >
          {state.errors._form.join(" ")}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="kostenart" className="block text-sm font-medium">
            Kostenart
          </label>
          <input
            id="kostenart"
            name="kostenart"
            type="text"
            required
            aria-describedby={
              state.errors?.kostenart ? "kostenart-error" : undefined
            }
            className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
            placeholder="z. B. Hausreinigung"
          />
          {state.errors?.kostenart && (
            <p
              id="kostenart-error"
              role="alert"
              className="text-sm text-red-600 dark:text-red-400"
            >
              {state.errors.kostenart.join(" ")}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="jahresbetrag" className="block text-sm font-medium">
            Jahresbetrag (€)
          </label>
          <input
            id="jahresbetrag"
            name="jahresbetrag"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            required
            aria-describedby={
              state.errors?.jahresbetrag ? "jahresbetrag-error" : undefined
            }
            className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm tabular-nums"
          />
          {state.errors?.jahresbetrag && (
            <p
              id="jahresbetrag-error"
              role="alert"
              className="text-sm text-red-600 dark:text-red-400"
            >
              {state.errors.jahresbetrag.join(" ")}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="beschreibung" className="block text-sm font-medium">
          Beschreibung <span className="font-normal">(optional)</span>
        </label>
        <input
          id="beschreibung"
          name="beschreibung"
          type="text"
          className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
        />
      </div>

      <div className="space-y-2">
        <label
          htmlFor="verteilungsschluessel_version_id"
          className="block text-sm font-medium"
        >
          Verteilungsschlüssel
        </label>
        <select
          id="verteilungsschluessel_version_id"
          name="verteilungsschluessel_version_id"
          required
          disabled={buchbare.length === 0}
          aria-describedby={
            state.errors?.verteilungsschluessel_version_id
              ? "schluessel-error"
              : "schluessel-hint"
          }
          className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm disabled:opacity-60"
        >
          {buchbare.map((option) => (
            <option key={option.versionId} value={option.versionId}>
              {option.label}
            </option>
          ))}
        </select>
        {state.errors?.verteilungsschluessel_version_id ? (
          <p
            id="schluessel-error"
            role="alert"
            className="text-sm text-red-600 dark:text-red-400"
          >
            {state.errors.verteilungsschluessel_version_id.join(" ")}
          </p>
        ) : (
          <p
            id="schluessel-hint"
            className="text-sm text-[color:var(--color-muted-foreground)]"
          >
            {buchbare.length === 0
              ? "Für diese WEG ist noch kein verwendbarer Verteilungsschlüssel angelegt."
              : "Ein gemischter Schlüssel verteilt über seine Teile — die müssen auf seiner Detailseite hinterlegt sein."}
          </p>
        )}
      </div>

      <SubmitButton />
    </form>
  );
}
