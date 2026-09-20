"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  VERTEILUNGSSCHLUESSEL_REGELWERK_LABEL,
  VERTEILUNGSSCHLUESSEL_TYP_LABEL,
  pruefeTeile,
} from "@/modules/finanzen";
import type { TeilEingabe } from "@/modules/finanzen";
import type {
  VerteilungsschluesselRegelwerk,
  VerteilungsschluesselTyp,
} from "@/lib/supabase/database.types";

import { saveTeileAction, type TeileFormState } from "../actions";

const initialState: TeileFormState = {};

export interface TeilKandidat {
  versionId: string;
  name: string;
  typ: VerteilungsschluesselTyp;
  /** Gewicht aus einem bereits gespeicherten Teil, sonst leer. */
  gewicht: string;
  gewaehlt: boolean;
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
      {pending ? "Speichern …" : "Teile speichern"}
    </button>
  );
}

export default function TeileForm({
  wegId,
  keyId,
  versionId,
  regelwerk,
  kandidaten,
}: {
  wegId: string;
  keyId: string;
  versionId: string;
  regelwerk: VerteilungsschluesselRegelwerk;
  kandidaten: readonly TeilKandidat[];
}) {
  const [state, formAction] = useActionState(saveTeileAction, initialState);
  const [zeilen, setZeilen] = useState<TeilKandidat[]>([...kandidaten]);

  const gewaehlt = zeilen.filter((zeile) => zeile.gewaehlt);

  // Dieselbe Prüfung wie in Migration 0067, nur sofort und ohne Speichern.
  const vorschau = useMemo(() => {
    const eingaben: TeilEingabe[] = gewaehlt.map((zeile) => ({
      typ: zeile.typ,
      gewicht: Number(zeile.gewicht.replace(",", ".")),
    }));

    if (eingaben.some((eingabe) => !Number.isFinite(eingabe.gewicht))) {
      return { ok: false as const, meldung: "Bitte für jeden Teil ein Gewicht angeben." };
    }

    return pruefeTeile(eingaben, regelwerk);
  }, [gewaehlt, regelwerk]);

  function setzeZeile(versionIdDerZeile: string, patch: Partial<TeilKandidat>) {
    setZeilen((vorher) =>
      vorher.map((zeile) =>
        zeile.versionId === versionIdDerZeile ? { ...zeile, ...patch } : zeile,
      ),
    );
  }

  if (kandidaten.length === 0) {
    return (
      <p
        role="status"
        className="rounded-md border border-dashed border-[color:var(--color-border)] p-6 text-center text-sm text-[color:var(--color-muted-foreground)]"
      >
        Diese WEG hat noch keine einfachen Verteilungsschlüssel, aus denen sich
        eine gemischte Regel zusammensetzen ließe. Legen Sie zuerst je einen an —
        für die HeizkostenV einen nach Verbrauch und einen nach Wohnfläche.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="weg_id" value={wegId} />
      <input type="hidden" name="key_id" value={keyId} />
      <input type="hidden" name="version_id" value={versionId} />
      <input type="hidden" name="regelwerk" value={regelwerk} />

      {state.errors?._form && (
        <div
          role="alert"
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-sm text-red-600 dark:text-red-400"
        >
          {state.errors._form.join(" ")}
        </div>
      )}

      <p className="text-sm text-[color:var(--color-muted-foreground)]">
        Regelwerk: {VERTEILUNGSSCHLUESSEL_REGELWERK_LABEL[regelwerk]}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[color:var(--color-border)] text-left text-xs text-[color:var(--color-muted-foreground)]">
              <th className="pb-2 pr-4 font-medium">Teil</th>
              <th className="pb-2 pr-4 font-medium">Art</th>
              <th className="pb-2 text-right font-medium">Gewicht (%)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--color-border)]">
            {zeilen.map((zeile) => (
              <tr key={zeile.versionId} className="align-middle">
                <td className="py-3 pr-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="teil_version_id"
                      value={zeile.versionId}
                      checked={zeile.gewaehlt}
                      onChange={(event) =>
                        setzeZeile(zeile.versionId, {
                          gewaehlt: event.target.checked,
                        })
                      }
                      className="size-4"
                    />
                    <span>{zeile.name}</span>
                  </label>
                </td>
                <td className="py-3 pr-4 text-[color:var(--color-muted-foreground)]">
                  {VERTEILUNGSSCHLUESSEL_TYP_LABEL[zeile.typ]}
                  {zeile.gewaehlt && (
                    <input
                      type="hidden"
                      name={`typ_${zeile.versionId}`}
                      value={zeile.typ}
                    />
                  )}
                </td>
                <td className="py-3 text-right">
                  <input
                    type="text"
                    inputMode="decimal"
                    name={`gewicht_${zeile.versionId}`}
                    value={zeile.gewicht}
                    disabled={!zeile.gewaehlt}
                    onChange={(event) =>
                      setzeZeile(zeile.versionId, { gewicht: event.target.value })
                    }
                    aria-label={`Gewicht für ${zeile.name}`}
                    className="w-24 rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-right text-sm tabular-nums disabled:opacity-40"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p
        role="status"
        className={
          vorschau.ok
            ? "text-sm text-[color:var(--color-muted-foreground)]"
            : "text-sm text-amber-700 dark:text-amber-400"
        }
      >
        {vorschau.ok
          ? "Die Aufteilung ist zulässig und ergibt zusammen 100 %."
          : vorschau.meldung}
      </p>

      {state.errors?.teile && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.errors.teile.join(" ")}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}
