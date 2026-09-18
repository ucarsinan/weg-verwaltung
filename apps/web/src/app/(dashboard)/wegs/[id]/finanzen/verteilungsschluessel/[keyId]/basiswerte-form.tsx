"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { berechneAnteile } from "@/modules/finanzen";
import type { UnitMea } from "@/modules/finanzen";
import type { VerteilungsschluesselTyp } from "@/lib/supabase/database.types";
import { saveBasiswerteAction, type BasiswerteFormState } from "../actions";

export interface BasiswerteUnit extends UnitMea {
  bezeichnung: string;
  vorhandenerWert: number | null;
}

interface BasiswerteFormProps {
  wegId: string;
  keyId: string;
  versionId: string;
  typ: VerteilungsschluesselTyp;
  einheitVorgabe: string;
  gueltigAbVorgabe: string;
  units: BasiswerteUnit[];
}

const initialState: BasiswerteFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
    >
      {pending ? "Speichern …" : "Basiswerte speichern"}
    </button>
  );
}

function formatPercent(anteil: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(anteil);
}

export default function BasiswerteForm({
  wegId,
  keyId,
  versionId,
  typ,
  einheitVorgabe,
  gueltigAbVorgabe,
  units,
}: BasiswerteFormProps) {
  const [state, formAction] = useActionState(saveBasiswerteAction, initialState);
  const [werte, setWerte] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      units.map((unit) => [
        unit.id,
        unit.vorhandenerWert === null ? "" : String(unit.vorhandenerWert),
      ]),
    ),
  );

  // Vorschau spiegelt die Generator-Semantik aus 0060; autoritativ bleibt die DB.
  const vorschau = useMemo(
    () =>
      berechneAnteile(
        typ,
        units,
        units
          .map((unit) => ({
            unitId: unit.id,
            wert: Number((werte[unit.id] ?? "").replace(",", ".")),
          }))
          .filter((eintrag) => Number.isFinite(eintrag.wert) && eintrag.wert >= 0),
      ),
    [typ, units, werte],
  );

  const anteilProUnit = useMemo(() => {
    if (!vorschau.ok) return new Map<string, number>();
    return new Map(vorschau.anteile.map((a) => [a.unitId, a.anteil]));
  }, [vorschau]);

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <input type="hidden" name="weg_id" value={wegId} />
      <input type="hidden" name="key_id" value={keyId} />
      <input type="hidden" name="version_id" value={versionId} />

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
          Basiswerte gespeichert.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="einheit" className="block text-sm font-medium">
            Maßeinheit
          </label>
          <input
            id="einheit"
            name="einheit"
            type="text"
            required
            defaultValue={einheitVorgabe}
            aria-describedby={state.errors?.einheit ? "einheit-error" : undefined}
            className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
            placeholder="m²"
          />
          {state.errors?.einheit && (
            <p
              id="einheit-error"
              role="alert"
              className="text-sm text-red-600 dark:text-red-400"
            >
              {state.errors.einheit.join(" ")}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="gueltig_ab" className="block text-sm font-medium">
            Gültig ab
          </label>
          <input
            id="gueltig_ab"
            name="gueltig_ab"
            type="date"
            required
            defaultValue={gueltigAbVorgabe}
            aria-describedby={
              state.errors?.gueltig_ab ? "gueltig-ab-error" : undefined
            }
            className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
          />
          {state.errors?.gueltig_ab && (
            <p
              id="gueltig-ab-error"
              role="alert"
              className="text-sm text-red-600 dark:text-red-400"
            >
              {state.errors.gueltig_ab.join(" ")}
            </p>
          )}
        </div>
      </div>

      {state.errors?.werte && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.errors.werte.join(" ")}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">
            Basiswerte je Einheit mit resultierendem Anteil
          </caption>
          <thead>
            <tr className="border-b border-[color:var(--color-border)] text-left text-xs text-[color:var(--color-muted-foreground)]">
              <th className="pb-2 pr-4 font-medium">Einheit</th>
              <th className="pb-2 pr-4 font-medium">Basiswert</th>
              <th className="pb-2 text-right font-medium">Anteil</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--color-border)]">
            {units.map((unit) => {
              const anteil = anteilProUnit.get(unit.id);

              return (
                <tr key={unit.id} className="align-middle">
                  <td className="py-3 pr-4 text-[color:var(--color-foreground)]">
                    <input type="hidden" name="unit_id" value={unit.id} />
                    <label htmlFor={`wert_${unit.id}`}>{unit.bezeichnung}</label>
                  </td>
                  <td className="py-3 pr-4">
                    <input
                      id={`wert_${unit.id}`}
                      name={`wert_${unit.id}`}
                      type="number"
                      inputMode="decimal"
                      step="0.000001"
                      min="0"
                      required
                      value={werte[unit.id] ?? ""}
                      onChange={(event) =>
                        setWerte((vorher) => ({
                          ...vorher,
                          [unit.id]: event.target.value,
                        }))
                      }
                      className="w-40 rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm tabular-nums"
                    />
                  </td>
                  <td className="py-3 text-right tabular-nums font-mono text-[color:var(--color-foreground)]">
                    {anteil === undefined ? "—" : formatPercent(anteil)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!vorschau.ok && (
        <p
          role="status"
          className="rounded-md border border-dashed border-[color:var(--color-border)] p-3 text-sm text-[color:var(--color-muted-foreground)]"
        >
          {vorschau.fehler.grund === "basiswerte_fehlen"
            ? "Solange nicht jede Einheit einen Wert hat, lässt sich kein Anteil berechnen — und der Wirtschaftsplan ließe sich später nicht aktivieren."
            : vorschau.fehler.grund === "basiswert_summe_nicht_positiv"
              ? "Die Summe der Basiswerte muss größer als 0 sein."
              : "Für diesen Schlüssel lässt sich keine Vorschau berechnen."}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}
