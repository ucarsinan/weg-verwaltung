"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  VERMOEGENSBERICHT_ABSCHNITTE,
  VERMOEGENSBERICHT_ABSCHNITT_LABEL,
} from "@/modules/finanzen";
import type { VermoegensberichtAbschnitt } from "@/lib/supabase/database.types";

import { createPositionAction, type PositionFormState } from "../actions";

const initialState: PositionFormState = {};

const BESTANDS_ABSCHNITTE: VermoegensberichtAbschnitt[] = [
  "konto",
  "ruecklage",
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
      {pending ? "Speichern …" : "Position hinzufügen"}
    </button>
  );
}

export default function PositionForm({
  wegId,
  berichtId,
}: {
  wegId: string;
  berichtId: string;
}) {
  const [state, formAction] = useActionState(createPositionAction, initialState);
  const [abschnitt, setAbschnitt] =
    useState<VermoegensberichtAbschnitt>("konto");

  const zeigtAnfangsbestand = BESTANDS_ABSCHNITTE.includes(abschnitt);
  const betragOptional = abschnitt === "sachwert";

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

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="abschnitt" className="block text-sm font-medium">
            Abschnitt
          </label>
          <select
            id="abschnitt"
            name="abschnitt"
            value={abschnitt}
            onChange={(event) =>
              setAbschnitt(event.target.value as VermoegensberichtAbschnitt)
            }
            className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
          >
            {VERMOEGENSBERICHT_ABSCHNITTE.map((wert) => (
              <option key={wert} value={wert}>
                {VERMOEGENSBERICHT_ABSCHNITT_LABEL[wert]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label htmlFor="bezeichnung" className="block text-sm font-medium">
            Bezeichnung
          </label>
          <input
            id="bezeichnung"
            name="bezeichnung"
            type="text"
            required
            placeholder="Girokonto DE.. 4711"
            aria-describedby={
              state.errors?.bezeichnung ? "bezeichnung-error" : undefined
            }
            className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
          />
          {state.errors?.bezeichnung && (
            <p
              id="bezeichnung-error"
              role="alert"
              className="text-sm text-red-600 dark:text-red-400"
            >
              {state.errors.bezeichnung.join(" ")}
            </p>
          )}
        </div>

        {zeigtAnfangsbestand && (
          <div className="space-y-2">
            <label
              htmlFor="betrag_anfang"
              className="block text-sm font-medium"
            >
              Anfangsbestand (€)
            </label>
            <input
              id="betrag_anfang"
              name="betrag_anfang"
              type="text"
              inputMode="decimal"
              placeholder="2500.00"
              aria-describedby={
                state.errors?.betrag_anfang ? "anfang-error" : undefined
              }
              className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm tabular-nums"
            />
            {state.errors?.betrag_anfang && (
              <p
                id="anfang-error"
                role="alert"
                className="text-sm text-red-600 dark:text-red-400"
              >
                {state.errors.betrag_anfang.join(" ")}
              </p>
            )}
          </div>
        )}

        <div className="space-y-2">
          <label htmlFor="betrag" className="block text-sm font-medium">
            {zeigtAnfangsbestand ? "Endbestand (€)" : "Betrag (€)"}
            {betragOptional && (
              <span className="ml-2 text-xs font-normal text-[color:var(--color-muted-foreground)]">
                optional
              </span>
            )}
          </label>
          <input
            id="betrag"
            name="betrag"
            type="text"
            inputMode="decimal"
            placeholder={betragOptional ? "leer lassen" : "3479.00"}
            aria-describedby={
              state.errors?.betrag ? "betrag-error" : "betrag-hint"
            }
            className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm tabular-nums"
          />
          {state.errors?.betrag ? (
            <p
              id="betrag-error"
              role="alert"
              className="text-sm text-red-600 dark:text-red-400"
            >
              {state.errors.betrag.join(" ")}
            </p>
          ) : (
            <p
              id="betrag-hint"
              className="text-sm text-[color:var(--color-muted-foreground)]"
            >
              {betragOptional
                ? "Bewegliche Sachen werden genannt, nicht bewertet — das Feld darf leer bleiben."
                : "Stand zum 31. Dezember."}
            </p>
          )}
        </div>
      </div>

      <SubmitButton />
    </form>
  );
}
