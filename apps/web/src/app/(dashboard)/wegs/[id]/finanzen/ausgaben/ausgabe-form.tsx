"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { createAusgabeAction, type AusgabeFormState } from "./actions";

export interface SchluesselOption {
  versionId: string;
  label: string;
}

interface AusgabeFormProps {
  wegId: string;
  schluessel: SchluesselOption[];
}

const initialState: AusgabeFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
    >
      {pending ? "Speichern …" : "Ausgabe erfassen"}
    </button>
  );
}

export default function AusgabeForm({ wegId, schluessel }: AusgabeFormProps) {
  const [state, formAction] = useActionState(createAusgabeAction, initialState);

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
            <p id="betrag-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
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
              state.errors?.wert_datum ? "wert-datum-error" : "wert-datum-hint"
            }
            className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
          />
          {state.errors?.wert_datum ? (
            <p
              id="wert-datum-error"
              role="alert"
              className="text-sm text-red-600 dark:text-red-400"
            >
              {state.errors.wert_datum.join(" ")}
            </p>
          ) : (
            <p
              id="wert-datum-hint"
              className="text-sm text-[color:var(--color-muted-foreground)]"
            >
              Bestimmt das Abrechnungsjahr — es zählt der Abfluss, nicht das
              Rechnungsdatum.
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="empfaenger" className="block text-sm font-medium">
            Empfänger
          </label>
          <input
            id="empfaenger"
            name="empfaenger"
            type="text"
            required
            placeholder="z. B. Stadtwerke"
            aria-describedby={
              state.errors?.empfaenger ? "empfaenger-error" : undefined
            }
            className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
          />
          {state.errors?.empfaenger && (
            <p
              id="empfaenger-error"
              role="alert"
              className="text-sm text-red-600 dark:text-red-400"
            >
              {state.errors.empfaenger.join(" ")}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="kostenart" className="block text-sm font-medium">
            Kostenart
          </label>
          <input
            id="kostenart"
            name="kostenart"
            type="text"
            required
            placeholder="z. B. Allgemeinstrom"
            aria-describedby={
              state.errors?.kostenart ? "kostenart-error" : undefined
            }
            className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
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
      </div>

      <div className="space-y-2">
        <label htmlFor="art" className="block text-sm font-medium">
          Art
        </label>
        <select
          id="art"
          name="art"
          defaultValue="kosten"
          className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
        >
          <option value="kosten">Kosten</option>
          <option value="ruecklage_zufuehrung">Zuführung zur Rücklage</option>
        </select>
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
          disabled={schluessel.length === 0}
          aria-describedby={
            state.errors?.verteilungsschluessel_version_id
              ? "schluessel-error"
              : "schluessel-hint"
          }
          className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm disabled:opacity-60"
        >
          {schluessel.map((option) => (
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
            {schluessel.length === 0
              ? "Für diese WEG ist noch kein Verteilungsschlüssel angelegt."
              : "Jede Ausgabe wird in der Jahresabrechnung auf die Einheiten verteilt."}
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
