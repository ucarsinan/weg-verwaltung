"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { createUnit, type UnitFormState } from "./actions";

interface UnitFormProps {
  wegId: string;
}

const initialState: UnitFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "Speichern ..." : "Speichern"}
    </button>
  );
}

export function UnitForm({ wegId }: UnitFormProps) {
  const [state, formAction] = useActionState(createUnit, initialState);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="weg_id" value={wegId} />

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
        <label htmlFor="bezeichnung" className="block text-sm font-medium">
          Bezeichnung <span aria-hidden="true">*</span>
        </label>
        <input
          id="bezeichnung"
          name="bezeichnung"
          type="text"
          required
          aria-required="true"
          aria-invalid={state.errors?.bezeichnung ? true : undefined}
          aria-describedby={
            state.errors?.bezeichnung ? "bezeichnung-error" : undefined
          }
          maxLength={200}
          autoComplete="off"
          placeholder="z.B. Whg. 12, 3. OG links"
          className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
        />
        {state.errors?.bezeichnung ? (
          <p
            id="bezeichnung-error"
            role="alert"
            className="text-sm text-red-600 dark:text-red-400"
          >
            {state.errors.bezeichnung.join(" ")}
          </p>
        ) : null}
      </div>

      <fieldset className="space-y-1">
        <legend className="block text-sm font-medium">
          Miteigentumsanteil (MEA) <span aria-hidden="true">*</span>
        </legend>
        <div className="flex items-center gap-3">
          <div className="flex-1 space-y-1">
            <label
              htmlFor="mea_zaehler"
              className="block text-xs text-[var(--color-muted)]"
            >
              Zähler
            </label>
            <input
              id="mea_zaehler"
              name="mea_zaehler"
              type="number"
              required
              aria-required="true"
              aria-invalid={state.errors?.mea_zaehler ? true : undefined}
              aria-describedby={
                state.errors?.mea_zaehler ? "zaehler-error" : undefined
              }
              min={1}
              step={1}
              className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
            />
            {state.errors?.mea_zaehler ? (
              <p
                id="zaehler-error"
                role="alert"
                className="text-sm text-red-600 dark:text-red-400"
              >
                {state.errors.mea_zaehler.join(" ")}
              </p>
            ) : null}
          </div>
          <span className="mt-5 text-lg text-[var(--color-muted)]">/</span>
          <div className="flex-1 space-y-1">
            <label
              htmlFor="mea_nenner"
              className="block text-xs text-[var(--color-muted)]"
            >
              Nenner
            </label>
            <input
              id="mea_nenner"
              name="mea_nenner"
              type="number"
              required
              aria-required="true"
              aria-invalid={state.errors?.mea_nenner ? true : undefined}
              aria-describedby={
                state.errors?.mea_nenner ? "nenner-error" : undefined
              }
              min={1}
              step={1}
              defaultValue={1000}
              className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
            />
            {state.errors?.mea_nenner ? (
              <p
                id="nenner-error"
                role="alert"
                className="text-sm text-red-600 dark:text-red-400"
              >
                {state.errors.mea_nenner.join(" ")}
              </p>
            ) : null}
          </div>
        </div>
      </fieldset>

      <div className="flex items-center gap-4 pt-2">
        <Link
          href={`/wegs/${wegId}`}
          className="text-sm underline underline-offset-4 hover:text-[var(--color-accent)]"
        >
          Abbrechen
        </Link>
        <SubmitButton />
      </div>
    </form>
  );
}
