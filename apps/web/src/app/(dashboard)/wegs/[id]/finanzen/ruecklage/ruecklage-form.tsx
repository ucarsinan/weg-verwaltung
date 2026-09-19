"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { pruefeEntnahme, RUECKLAGEN_RICHTUNG_LABEL } from "@/modules/finanzen";
import type { RuecklagenBewegung } from "@/modules/finanzen";
import {
  createRuecklagenBewegungAction,
  type RuecklageFormState,
} from "../ausgaben/actions";

interface RuecklageFormProps {
  wegId: string;
  bewegungen: RuecklagenBewegung[];
  /** Ein Anfangsbestand ist je WEG nur einmal möglich. */
  hatAnfangsbestand: boolean;
}

const initialState: RuecklageFormState = {};

function formatCurrencyDE(amount: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
    >
      {pending ? "Speichern …" : "Bewegung erfassen"}
    </button>
  );
}

export default function RuecklageForm({
  wegId,
  bewegungen,
  hatAnfangsbestand,
}: RuecklageFormProps) {
  const [state, formAction] = useActionState(
    createRuecklagenBewegungAction,
    initialState,
  );
  const [richtung, setRichtung] = useState(
    hatAnfangsbestand ? "zufuehrung" : "anfangsbestand",
  );
  const [datum, setDatum] = useState("");
  const [betrag, setBetrag] = useState("");

  // Vorschau nur für Entnahmen: dort ist die Stichtagsgrenze nicht offensichtlich.
  const pruefung = useMemo(() => {
    if (richtung !== "entnahme" || datum.length === 0 || betrag.length === 0) {
      return null;
    }

    const wert = Number(betrag.replace(",", "."));
    if (!Number.isFinite(wert) || wert <= 0) return null;

    return pruefeEntnahme(bewegungen, { datum, betrag: wert });
  }, [richtung, datum, betrag, bewegungen]);

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

      {state.ok && (
        <div
          role="status"
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-sm text-green-700 dark:text-green-400"
        >
          Bewegung gespeichert.
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor="richtung" className="block text-sm font-medium">
          Bewegungsart
        </label>
        <select
          id="richtung"
          name="richtung"
          value={richtung}
          onChange={(event) => setRichtung(event.target.value)}
          aria-describedby={state.errors?.richtung ? "richtung-error" : undefined}
          className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
        >
          {!hatAnfangsbestand && (
            <option value="anfangsbestand">
              {RUECKLAGEN_RICHTUNG_LABEL.anfangsbestand}
            </option>
          )}
          <option value="zufuehrung">
            {RUECKLAGEN_RICHTUNG_LABEL.zufuehrung}
          </option>
          <option value="entnahme">{RUECKLAGEN_RICHTUNG_LABEL.entnahme}</option>
        </select>
        {state.errors?.richtung && (
          <p
            id="richtung-error"
            role="alert"
            className="text-sm text-red-600 dark:text-red-400"
          >
            {state.errors.richtung.join(" ")}
          </p>
        )}
      </div>

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
            value={betrag}
            onChange={(event) => setBetrag(event.target.value)}
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
          <label htmlFor="datum" className="block text-sm font-medium">
            Datum
          </label>
          <input
            id="datum"
            name="datum"
            type="date"
            required
            value={datum}
            onChange={(event) => setDatum(event.target.value)}
            aria-describedby={state.errors?.datum ? "datum-error" : undefined}
            className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
          />
          {state.errors?.datum && (
            <p
              id="datum-error"
              role="alert"
              className="text-sm text-red-600 dark:text-red-400"
            >
              {state.errors.datum.join(" ")}
            </p>
          )}
        </div>
      </div>

      {pruefung && (
        <p
          role="status"
          className="rounded-md border border-dashed border-[color:var(--color-border)] p-3 text-sm text-[color:var(--color-muted-foreground)]"
        >
          {pruefung.ok
            ? `Bestand nach der Entnahme: ${formatCurrencyDE(pruefung.bestandDanach)}.`
            : `Zu diesem Datum sind erst ${formatCurrencyDE(pruefung.verfuegbar)} vorhanden. Später zugeführtes Geld deckt eine früher datierte Entnahme nicht.`}
        </p>
      )}

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
