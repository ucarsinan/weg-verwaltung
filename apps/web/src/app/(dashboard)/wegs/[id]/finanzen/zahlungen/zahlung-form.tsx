"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { createZahlungAction, type ZahlungFormState } from "./actions";

const initialState: ZahlungFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
    >
      {pending ? "Speichern …" : "Zahlung erfassen"}
    </button>
  );
}

export default function ZahlungForm({ wegId }: { wegId: string }) {
  const [state, formAction] = useActionState(createZahlungAction, initialState);

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

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="betrag" className="block text-sm font-medium">
            Betrag (€)
          </label>
          <input
            id="betrag"
            name="betrag"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            required
            aria-describedby={state.errors?.betrag ? "betrag-error" : undefined}
            className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm tabular-nums"
          />
          {state.errors?.betrag && (
            <p
              id="betrag-error"
              role="alert"
              className="text-sm text-red-600 dark:text-red-400"
            >
              {state.errors.betrag.join(" ")}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="wert_datum" className="block text-sm font-medium">
            Wertstellung
          </label>
          <input
            id="wert_datum"
            name="wert_datum"
            type="date"
            required
            aria-describedby={
              state.errors?.wert_datum ? "wert-datum-error" : undefined
            }
            className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
          />
          {state.errors?.wert_datum && (
            <p
              id="wert-datum-error"
              role="alert"
              className="text-sm text-red-600 dark:text-red-400"
            >
              {state.errors.wert_datum.join(" ")}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="zahler_referenz" className="block text-sm font-medium">
          Einzahler / Verwendungszweck
        </label>
        <input
          id="zahler_referenz"
          name="zahler_referenz"
          type="text"
          required
          placeholder="z. B. Muster, Hausgeld Januar"
          aria-describedby={
            state.errors?.zahler_referenz ? "referenz-error" : "referenz-hint"
          }
          className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
        />
        {state.errors?.zahler_referenz ? (
          <p
            id="referenz-error"
            role="alert"
            className="text-sm text-red-600 dark:text-red-400"
          >
            {state.errors.zahler_referenz.join(" ")}
          </p>
        ) : (
          <p
            id="referenz-hint"
            className="text-sm text-[color:var(--color-muted-foreground)]"
          >
            So, wie es auf dem Kontoauszug steht — daran wird die Zahlung später
            wiedererkannt.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor="notiz" className="block text-sm font-medium">
          Notiz <span className="font-normal">(optional)</span>
        </label>
        <input
          id="notiz"
          name="notiz"
          type="text"
          className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
        />
      </div>

      <SubmitButton />
    </form>
  );
}
