"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { updateUnit, deleteUnit, type UnitEditFormState } from "./actions";

interface UnitEditFormProps {
  wegId: string;
  unitId: string;
  initialData: {
    bezeichnung: string;
    mea_zaehler: number;
    mea_nenner: number;
  };
}

const initialState: UnitEditFormState = {};

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

export function UnitEditForm({ wegId, unitId, initialData }: UnitEditFormProps) {
  const updateUnitWithParams = updateUnit.bind(null, wegId, unitId);
  const [state, formAction] = useActionState(updateUnitWithParams, initialState);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    const confirmed = window.confirm(
      "Sind Sie sicher, dass Sie diese Wohneinheit unwiderruflich löschen möchten?"
    );
    if (!confirmed) return;

    setIsDeleting(true);
    setDeleteError(null);

    try {
      const res = await deleteUnit(wegId, unitId);
      if (res && res.error) {
        setDeleteError(res.error);
      }
    } catch {
      setDeleteError("Ein unerwarteter Fehler ist aufgetreten.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-8">
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

        {/* Bezeichnung */}
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
            defaultValue={initialData.bezeichnung}
            autoComplete="off"
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

        {/* MEA */}
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
                defaultValue={initialData.mea_zaehler}
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
                defaultValue={initialData.mea_nenner}
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

      <hr className="border-[var(--color-border)]" />

      {/* Danger Zone */}
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/20">
        <h2 className="text-sm font-semibold text-red-800 dark:text-red-300">
          Gefahrenzone
        </h2>
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
          Durch das Löschen wird die Wohneinheit unwiderruflich aus dem System entfernt.
          Dies ist nur möglich, wenn keine Eigentumsverhältnisse oder Abstimmungen mit der Einheit verknüpft sind.
        </p>

        {deleteError ? (
          <div
            role="alert"
            className="mt-3 rounded-md border border-red-200 bg-white p-3 text-xs text-red-600 dark:border-red-900/50 dark:bg-zinc-950 dark:text-red-400"
          >
            {deleteError}
          </div>
        ) : null}

        <button
          type="button"
          disabled={isDeleting}
          onClick={handleDelete}
          className="mt-4 rounded-md border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:bg-zinc-950 dark:text-red-400 dark:hover:bg-red-950/50"
        >
          {isDeleting ? "Wird gelöscht …" : "Wohneinheit unwiderruflich löschen"}
        </button>
      </div>
    </div>
  );
}
