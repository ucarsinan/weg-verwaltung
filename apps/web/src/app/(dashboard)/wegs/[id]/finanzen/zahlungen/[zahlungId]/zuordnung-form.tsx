"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  formatMonat,
  pruefeZuordnungen,
  verteileAufAeltesteOffen,
} from "@/modules/finanzen";
import type { OffenerPosten } from "@/modules/finanzen";
import { saveZuordnungenAction, type ZuordnungFormState } from "../actions";

interface ZuordnungFormProps {
  wegId: string;
  zahlungId: string;
  zahlbetrag: number;
  posten: OffenerPosten[];
  /** Bereits gespeicherte Zuordnungen dieser Zahlung, je Sollstellung. */
  bestehend: Record<string, number>;
}

const initialState: ZuordnungFormState = {};

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
      {pending ? "Speichern …" : "Zuordnung speichern"}
    </button>
  );
}

export default function ZuordnungForm({
  wegId,
  zahlungId,
  zahlbetrag,
  posten,
  bestehend,
}: ZuordnungFormProps) {
  const [state, formAction] = useActionState(
    saveZuordnungenAction,
    initialState,
  );
  const [betraege, setBetraege] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      posten.map((p) => [
        p.sollstellungId,
        bestehend[p.sollstellungId] === undefined
          ? ""
          : String(bestehend[p.sollstellungId]),
      ]),
    ),
  );

  const pruefung = useMemo(
    () =>
      pruefeZuordnungen(
        zahlbetrag,
        posten,
        posten
          .map((p) => ({
            sollstellungId: p.sollstellungId,
            roh: (betraege[p.sollstellungId] ?? "").trim(),
          }))
          .filter((e) => e.roh.length > 0)
          .map((e) => ({
            sollstellungId: e.sollstellungId,
            betrag: Number(e.roh.replace(",", ".")),
          })),
      ),
    [zahlbetrag, posten, betraege],
  );

  function uebernehmeVorschlag() {
    const vorschlag = verteileAufAeltesteOffen(zahlbetrag, posten);
    const naechste: Record<string, string> = Object.fromEntries(
      posten.map((p) => [p.sollstellungId, ""]),
    );
    for (const wunsch of vorschlag) {
      naechste[wunsch.sollstellungId] = String(wunsch.betrag);
    }
    setBetraege(naechste);
  }

  const fehlertext = !pruefung.ok
    ? pruefung.fehler.grund === "zahlung_ueberschritten"
      ? `Die Summe von ${formatCurrencyDE(pruefung.fehler.summe)} überschreitet den Zahlbetrag von ${formatCurrencyDE(pruefung.fehler.zahlbetrag)}.`
      : pruefung.fehler.grund === "posten_ueberzahlt"
        ? `Ein Posten wäre überzahlt: offen sind nur ${formatCurrencyDE(pruefung.fehler.offen)}.`
        : pruefung.fehler.grund === "kein_betrag"
          ? "Noch nichts zugeordnet."
          : "Die Zuordnung ist nicht gültig."
    : null;

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <input type="hidden" name="weg_id" value={wegId} />
      <input type="hidden" name="zahlung_id" value={zahlungId} />

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
          Zuordnung gespeichert.
        </div>
      )}

      {state.errors?.betraege && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.errors.betraege.join(" ")}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[color:var(--color-muted-foreground)]">
          Zahlbetrag: <strong>{formatCurrencyDE(zahlbetrag)}</strong>
          {pruefung.ok && (
            <>
              {" · noch frei: "}
              <strong>{formatCurrencyDE(pruefung.restbetrag)}</strong>
            </>
          )}
        </p>
        <button
          type="button"
          onClick={uebernehmeVorschlag}
          className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm"
        >
          Auf älteste offene Posten verteilen
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">
            Offene Posten mit zuzuordnendem Betrag
          </caption>
          <thead>
            <tr className="border-b border-[color:var(--color-border)] text-left text-xs text-[color:var(--color-muted-foreground)]">
              <th className="pb-2 pr-4 font-medium">Einheit</th>
              <th className="pb-2 pr-4 font-medium">Monat</th>
              <th className="pb-2 pr-4 text-right font-medium">Offen</th>
              <th className="pb-2 text-right font-medium">Zuordnen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--color-border)]">
            {posten.map((p) => (
              <tr key={p.sollstellungId} className="align-middle">
                <td className="py-3 pr-4 text-[color:var(--color-foreground)]">
                  <input
                    type="hidden"
                    name="sollstellung_id"
                    value={p.sollstellungId}
                  />
                  <label htmlFor={`betrag_${p.sollstellungId}`}>
                    {p.unitBezeichnung}
                  </label>
                </td>
                <td className="py-3 pr-4 tabular-nums text-[color:var(--color-foreground)]">
                  {formatMonat(p.jahr, p.monat)}
                </td>
                <td className="py-3 pr-4 text-right tabular-nums font-mono text-[color:var(--color-foreground)]">
                  {formatCurrencyDE(p.offenBetrag)}
                </td>
                <td className="py-3 text-right">
                  <input
                    id={`betrag_${p.sollstellungId}`}
                    name={`betrag_${p.sollstellungId}`}
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    max={p.offenBetrag}
                    value={betraege[p.sollstellungId] ?? ""}
                    onChange={(event) =>
                      setBetraege((vorher) => ({
                        ...vorher,
                        [p.sollstellungId]: event.target.value,
                      }))
                    }
                    className="w-32 rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm tabular-nums"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {fehlertext && pruefung.ok === false && (
        <p
          role="status"
          className="rounded-md border border-dashed border-[color:var(--color-border)] p-3 text-sm text-[color:var(--color-muted-foreground)]"
        >
          {fehlertext}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}
