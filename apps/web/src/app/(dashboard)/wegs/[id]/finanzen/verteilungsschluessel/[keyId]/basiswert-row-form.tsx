"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { BasiswertFormState } from "./actions";

interface BasiswertRowFormProps {
  action: (
    prev: BasiswertFormState,
    formData: FormData,
  ) => Promise<BasiswertFormState>;
  unitLabel: string;
  initialValue: { wert: number; einheit: string; gueltig_ab: string } | null;
}

const initialState: BasiswertFormState = {};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
    >
      {pending ? "Speichert …" : "Speichern"}
    </button>
  );
}

export function BasiswertRowForm({
  action,
  unitLabel,
  initialValue,
}: BasiswertRowFormProps) {
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form
      action={formAction}
      className="grid grid-cols-1 items-end gap-2 border-b border-[var(--color-border)] py-3 sm:grid-cols-[1fr_7rem_6rem_9rem_auto]"
    >
      <p className="text-sm font-medium text-[color:var(--color-foreground)] sm:pb-2">
        {unitLabel}
      </p>
      <div>
        <label className="block text-xs text-[color:var(--color-muted-foreground)]">
          Wert
        </label>
        <input
          name="wert"
          type="number"
          step="0.000001"
          min={0}
          required
          defaultValue={initialValue?.wert ?? ""}
          aria-invalid={state.errors?.wert ? true : undefined}
          className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-2 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs text-[color:var(--color-muted-foreground)]">
          Einheit
        </label>
        <input
          name="einheit"
          type="text"
          required
          maxLength={50}
          defaultValue={initialValue?.einheit ?? ""}
          placeholder="m²"
          aria-invalid={state.errors?.einheit ? true : undefined}
          className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-2 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs text-[color:var(--color-muted-foreground)]">
          Gültig ab
        </label>
        <input
          name="gueltig_ab"
          type="date"
          required
          defaultValue={initialValue?.gueltig_ab ?? ""}
          aria-invalid={state.errors?.gueltig_ab ? true : undefined}
          className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-2 py-1.5 text-sm"
        />
      </div>
      <SaveButton />
      {state.errors?._form || state.errors?.wert || state.errors?.einheit || state.errors?.gueltig_ab ? (
        <p role="alert" className="col-span-full text-xs text-red-600 dark:text-red-400">
          {[
            ...(state.errors?._form ?? []),
            ...(state.errors?.wert ?? []),
            ...(state.errors?.einheit ?? []),
            ...(state.errors?.gueltig_ab ?? []),
          ].join(" ")}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="col-span-full text-xs text-emerald-700 dark:text-emerald-400">
          Gespeichert.
        </p>
      ) : null}
    </form>
  );
}
