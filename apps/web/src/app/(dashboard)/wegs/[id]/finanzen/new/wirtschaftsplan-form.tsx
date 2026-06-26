"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { createWirtschaftsplanAction, type WirtschaftsplanFormState } from "./actions";

interface Unit {
  id: string;
  bezeichnung: string;
  mea_zaehler: number;
  mea_nenner: number;
}

interface WirtschaftsplanFormProps {
  wegId: string;
  units: Unit[];
}

const initialState: WirtschaftsplanFormState = {};

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

export default function WirtschaftsplanForm({ wegId, units }: WirtschaftsplanFormProps) {
  const [state, formAction] = useActionState(createWirtschaftsplanAction, initialState);
  const [gesamtkosten, setGesamtkosten] = useState<string>("");

  const handleCostsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Keep it as a raw string to allow typing decimals
    setGesamtkosten(e.target.value);
  };

  const numCosts = parseFloat(gesamtkosten) || 0;

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <input type="hidden" name="weg_id" value={wegId} />

      {state.errors?._form && (
        <div
          id="form-error"
          role="alert"
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-sm text-red-600 dark:text-red-400"
        >
          {state.errors._form.join(" ")}
        </div>
      )}

      {/* 1. Jahr */}
      <div className="space-y-1">
        <label htmlFor="jahr" className="block text-sm font-medium">
          Jahr <span aria-hidden="true">*</span>
        </label>
        <input
          id="jahr"
          name="jahr"
          type="number"
          required
          aria-required="true"
          aria-invalid={state.errors?.jahr ? true : undefined}
          aria-describedby={state.errors?.jahr ? "jahr-error" : undefined}
          className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
          placeholder="z. B. 2026"
        />
        {state.errors?.jahr && (
          <p
            id="jahr-error"
            role="alert"
            className="text-sm text-red-600 dark:text-red-400"
          >
            {state.errors.jahr.join(" ")}
          </p>
        )}
      </div>

      {/* 2. Bezeichnung */}
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
          aria-describedby={state.errors?.bezeichnung ? "bezeichnung-error" : undefined}
          className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
          placeholder="z. B. Wirtschaftsplan 2026"
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

      {/* 3. Gesamtkosten */}
      <div className="space-y-1">
        <label htmlFor="gesamtkosten" className="block text-sm font-medium">
          Gesamtkosten (€) <span aria-hidden="true">*</span>
        </label>
        <input
          id="gesamtkosten"
          name="gesamtkosten"
          type="number"
          step="0.01"
          required
          aria-required="true"
          value={gesamtkosten}
          onChange={handleCostsChange}
          aria-invalid={state.errors?.gesamtkosten ? true : undefined}
          aria-describedby={state.errors?.gesamtkosten ? "gesamtkosten-error" : undefined}
          className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
          placeholder="z. B. 12000"
        />
        {state.errors?.gesamtkosten && (
          <p
            id="gesamtkosten-error"
            role="alert"
            className="text-sm text-red-600 dark:text-red-400"
          >
            {state.errors.gesamtkosten.join(" ")}
          </p>
        )}
      </div>

      <div className="space-y-1">
        <label htmlFor="wirksam_ab_monat" className="block text-sm font-medium">
          Wirksam ab Monat
        </label>
        <input
          id="wirksam_ab_monat"
          name="wirksam_ab_monat"
          type="number"
          min={1}
          max={12}
          step={1}
          aria-invalid={state.errors?.wirksam_ab_monat ? true : undefined}
          aria-describedby={
            state.errors?.wirksam_ab_monat
              ? "wirksam-ab-monat-error"
              : undefined
          }
          className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
          placeholder="1"
        />
        {state.errors?.wirksam_ab_monat && (
          <p
            id="wirksam-ab-monat-error"
            role="alert"
            className="text-sm text-red-600 dark:text-red-400"
          >
            {state.errors.wirksam_ab_monat.join(" ")}
          </p>
        )}
      </div>

      {/* 4. Live Hausgeld Preview */}
      <div className="rounded-md border border-[var(--color-border)] p-4 space-y-3">
        <h3 className="text-sm font-semibold text-[color:var(--color-foreground)]">
          Vorschau: Monatliches Hausgeld pro Einheit
        </h3>
        <p className="text-xs text-[color:var(--color-muted-foreground)]">
          Basierend auf den Miteigentumsanteilen (MEA). Sollstellungen entstehen
          erst bei Aktivierung.
        </p>

        {units.length === 0 ? (
          <p className="text-xs italic text-[color:var(--color-muted-foreground)]">
            Keine Wohneinheiten in dieser WEG vorhanden, um Miteigentumsanteile zu berechnen.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--color-border)] text-sm">
            {units.map((unit) => {
              const monthlyHausgeld = unit.mea_nenner > 0
                ? Math.round(( (unit.mea_zaehler / unit.mea_nenner) * numCosts / 12 ) * 100) / 100
                : 0;
              const formattedHausgeld = monthlyHausgeld.toLocaleString("de-DE", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              });

              return (
                <li key={unit.id} className="flex justify-between py-2">
                  <span>
                    {unit.bezeichnung}{" "}
                    <span className="text-xs text-[color:var(--color-muted-foreground)]">
                      (MEA: {unit.mea_zaehler}/{unit.mea_nenner})
                    </span>
                  </span>
                  <span className="font-mono font-semibold">{formattedHausgeld} €</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex items-center gap-4 pt-2">
        <Link
          href={`/wegs/${wegId}/finanzen`}
          className="text-sm underline underline-offset-4 hover:text-[var(--color-accent)]"
        >
          Abbrechen
        </Link>
        <SubmitButton />
      </div>
    </form>
  );
}
