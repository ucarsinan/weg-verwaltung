"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import {
  createVerteilungsschluesselAction,
  type VerteilungsschluesselFormState,
} from "./actions";

interface VerteilungsschluesselFormProps {
  wegId: string;
}

const initialState: VerteilungsschluesselFormState = {};

const TYP_OPTIONS: { value: string; label: string }[] = [
  { value: "mea", label: "Miteigentumsanteil (MEA)" },
  { value: "einheit", label: "Gleichverteilung je Einheit" },
  { value: "flaeche", label: "Fläche (benötigt Basiswerte je Einheit)" },
  { value: "verbrauch", label: "Verbrauch (benötigt Basiswerte je Einheit)" },
  { value: "manuell", label: "Manuell (benötigt Basiswerte je Einheit)" },
  { value: "gemischt", label: "Gemischt (vom Generator noch nicht unterstützt)" },
];

const QUELLE_OPTIONS: { value: string; label: string }[] = [
  { value: "gesetz", label: "Gesetz" },
  { value: "teilungserklaerung", label: "Teilungserklärung" },
  { value: "gemeinschaftsordnung", label: "Gemeinschaftsordnung" },
  { value: "beschluss", label: "Beschluss" },
  { value: "manuell", label: "Manuell" },
];

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

export default function VerteilungsschluesselForm({
  wegId,
}: VerteilungsschluesselFormProps) {
  const [state, formAction] = useActionState(
    createVerteilungsschluesselAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <input type="hidden" name="weg_id" value={wegId} />

      {state.errors?._form ? (
        <div
          role="alert"
          className="rounded-md border border-[var(--color-border)] p-3 text-sm text-red-600 dark:text-red-400"
        >
          {state.errors._form.join(" ")}
        </div>
      ) : null}

      <div className="space-y-1">
        <label htmlFor="name" className="block text-sm font-medium">
          Name <span aria-hidden="true">*</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          aria-required="true"
          maxLength={200}
          aria-invalid={state.errors?.name ? true : undefined}
          aria-describedby={state.errors?.name ? "name-error" : undefined}
          className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
          placeholder="z. B. Fläche"
        />
        {state.errors?.name ? (
          <p id="name-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
            {state.errors.name.join(" ")}
          </p>
        ) : null}
      </div>

      <div className="space-y-1">
        <label htmlFor="typ" className="block text-sm font-medium">
          Typ <span aria-hidden="true">*</span>
        </label>
        <select
          id="typ"
          name="typ"
          required
          aria-required="true"
          defaultValue=""
          aria-invalid={state.errors?.typ ? true : undefined}
          aria-describedby={state.errors?.typ ? "typ-error" : undefined}
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
        >
          <option value="" disabled>
            Bitte auswählen
          </option>
          {TYP_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {state.errors?.typ ? (
          <p id="typ-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
            {state.errors.typ.join(" ")}
          </p>
        ) : null}
      </div>

      <div className="space-y-1">
        <label htmlFor="quelle" className="block text-sm font-medium">
          Quelle <span aria-hidden="true">*</span>
        </label>
        <select
          id="quelle"
          name="quelle"
          required
          aria-required="true"
          defaultValue=""
          aria-invalid={state.errors?.quelle ? true : undefined}
          aria-describedby={state.errors?.quelle ? "quelle-error" : undefined}
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
        >
          <option value="" disabled>
            Bitte auswählen
          </option>
          {QUELLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {state.errors?.quelle ? (
          <p id="quelle-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
            {state.errors.quelle.join(" ")}
          </p>
        ) : null}
      </div>

      <div className="space-y-1">
        <label htmlFor="gueltig_ab" className="block text-sm font-medium">
          Gültig ab <span aria-hidden="true">*</span>
        </label>
        <input
          id="gueltig_ab"
          name="gueltig_ab"
          type="date"
          required
          aria-required="true"
          aria-invalid={state.errors?.gueltig_ab ? true : undefined}
          aria-describedby={state.errors?.gueltig_ab ? "gueltig-ab-error" : undefined}
          className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
        />
        {state.errors?.gueltig_ab ? (
          <p
            id="gueltig-ab-error"
            role="alert"
            className="text-sm text-red-600 dark:text-red-400"
          >
            {state.errors.gueltig_ab.join(" ")}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-4 pt-2">
        <Link
          href={`/wegs/${wegId}/finanzen/verteilungsschluessel`}
          className="text-sm underline underline-offset-4 hover:text-[var(--color-accent)]"
        >
          Abbrechen
        </Link>
        <SubmitButton />
      </div>
    </form>
  );
}
