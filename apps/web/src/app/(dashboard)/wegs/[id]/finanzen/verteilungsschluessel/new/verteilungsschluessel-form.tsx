"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import type { Route } from "next";

import {
  VERTEILUNGSSCHLUESSEL_QUELLEN,
  VERTEILUNGSSCHLUESSEL_QUELLE_LABEL,
  VERTEILUNGSSCHLUESSEL_REGELWERKE,
  VERTEILUNGSSCHLUESSEL_REGELWERK_LABEL,
  VERTEILUNGSSCHLUESSEL_TYPEN,
  VERTEILUNGSSCHLUESSEL_TYP_LABEL,
  brauchtBasiswerte,
  brauchtTeile,
  isVerteilungsschluesselTyp,
} from "@/modules/finanzen";
import {
  createVerteilungsschluesselAction,
  type VerteilungsschluesselFormState,
} from "../actions";

interface VerteilungsschluesselFormProps {
  wegId: string;
}

const initialState: VerteilungsschluesselFormState = {};

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
  const [typ, setTyp] = useState<string>("mea");

  const gewaehlterTyp = isVerteilungsschluesselTyp(typ) ? typ : null;

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

      <div className="space-y-2">
        <label htmlFor="name" className="block text-sm font-medium">
          Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          aria-describedby={state.errors?.name ? "name-error" : undefined}
          className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
          placeholder="z. B. Wohnfläche"
        />
        {state.errors?.name && (
          <p id="name-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
            {state.errors.name.join(" ")}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor="typ" className="block text-sm font-medium">
          Verteilungsart
        </label>
        <select
          id="typ"
          name="typ"
          value={typ}
          onChange={(event) => setTyp(event.target.value)}
          aria-describedby={state.errors?.typ ? "typ-error" : "typ-hint"}
          className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
        >
          {VERTEILUNGSSCHLUESSEL_TYPEN.map((wert) => (
            <option key={wert} value={wert}>
              {VERTEILUNGSSCHLUESSEL_TYP_LABEL[wert]}
            </option>
          ))}
        </select>
        {state.errors?.typ ? (
          <p id="typ-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
            {state.errors.typ.join(" ")}
          </p>
        ) : (
          <p id="typ-hint" className="text-sm text-[color:var(--color-muted-foreground)]">
            {gewaehlterTyp && brauchtTeile(gewaehlterTyp)
              ? "Eine gemischte Regel setzt sich aus vorhandenen Schlüsseln zusammen — die wählen Sie gleich im nächsten Schritt aus und gewichten sie."
              : gewaehlterTyp && brauchtBasiswerte(gewaehlterTyp)
                ? "Für diesen Typ ist anschließend je Einheit ein Basiswert zu hinterlegen."
                : "Die Anteile ergeben sich aus den Stammdaten der Einheiten."}
          </p>
        )}
      </div>

      {gewaehlterTyp && brauchtTeile(gewaehlterTyp) && (
        <div className="space-y-2">
          <label htmlFor="regelwerk" className="block text-sm font-medium">
            Regelwerk
          </label>
          <select
            id="regelwerk"
            name="regelwerk"
            defaultValue="frei"
            aria-describedby="regelwerk-hint"
            className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
          >
            {VERTEILUNGSSCHLUESSEL_REGELWERKE.map((wert) => (
              <option key={wert} value={wert}>
                {VERTEILUNGSSCHLUESSEL_REGELWERK_LABEL[wert]}
              </option>
            ))}
          </select>
          <p
            id="regelwerk-hint"
            className="text-sm text-[color:var(--color-muted-foreground)]"
          >
            Für Heiz- und Warmwasserkosten schreibt die HeizkostenV vor,
            mindestens 50 und höchstens 70 Prozent nach Verbrauch zu verteilen
            und den Rest nach Fläche. Wählen Sie das passende Regelwerk, dann
            lässt die Anwendung keine unzulässige Aufteilung zu.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor="quelle" className="block text-sm font-medium">
          Rechtsgrundlage
        </label>
        <select
          id="quelle"
          name="quelle"
          defaultValue="gesetz"
          aria-describedby={state.errors?.quelle ? "quelle-error" : undefined}
          className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
        >
          {VERTEILUNGSSCHLUESSEL_QUELLEN.map((wert) => (
            <option key={wert} value={wert}>
              {VERTEILUNGSSCHLUESSEL_QUELLE_LABEL[wert]}
            </option>
          ))}
        </select>
        {state.errors?.quelle && (
          <p id="quelle-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
            {state.errors.quelle.join(" ")}
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

      <div className="flex items-center gap-4">
        <SubmitButton />
        <Link
          href={`/wegs/${wegId}/finanzen/verteilungsschluessel` as Route}
          className="text-sm underline underline-offset-4"
        >
          Abbrechen
        </Link>
      </div>
    </form>
  );
}
