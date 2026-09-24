"use client";

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";

import { FRIST_HERKUNFT_LABEL, formatJahreLabel } from "@/modules/dokumente";
import type { DocTyp, FristHerkunft } from "@/lib/supabase/database.types";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { speichereRegelAction, type RegelFormState } from "./actions";

const initialState: RegelFormState = {};

// Reine Zitat-Vorschläge — sie setzen AUSSCHLIESSLICH rechtsgrundlage, nie
// jahre. Fix Round 1 (Review): eine frühere Fassung hängte "— acht Jahre"
// bzw. "— sechs Jahre" an die Beschriftung UND schrieb diese Zahlen fest in
// die Jahre-Eingabe. Das war eine zweite, in TypeScript hartkodierte Kopie
// derselben Rückfallwerte, die ausschließlich in
// public.aufbewahrung_effektiv (0071) stehen dürfen: ändert eine spätere
// Migration den gesetzlichen Rückfall, hätte der Chip stillschweigend die
// alte Zahl weiterangeboten — ein Klick hätte dann einen expliziten
// Mandanten-Override mit einem falschen Wert erzeugt, gerade weil er wie
// eine Hilfe aussah. Diese beiden Chips sind deshalb reiner Text, ihre
// Beschriftung nennt keine Zahl mehr, weil sie keine setzen.
const RECHTSGRUNDLAGE_VORSCHLAEGE: ReadonlyArray<{
  label: string;
  rechtsgrundlage: string;
}> = [
  { label: "§ 147 Abs. 3 Nr. 4 AO", rechtsgrundlage: "§ 147 Abs. 3 Nr. 4 AO" },
  { label: "§ 147 Abs. 3", rechtsgrundlage: "§ 147 Abs. 3" },
];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending} aria-busy={pending}>
      {pending ? "Speichern ..." : "Speichern"}
    </Button>
  );
}

function FormMessage({ state }: { state: RegelFormState }) {
  if (state.errors?._form) {
    return (
      <p role="alert" className="text-sm text-red-600 dark:text-red-400">
        {state.errors._form.join(" ")}
      </p>
    );
  }
  if (state.success) {
    return (
      <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">
        {state.success}
      </p>
    );
  }
  return null;
}

export interface RegelFormProps {
  docTyp: DocTyp;
  label: string;
  effektiv: {
    jahre: number | null;
    herkunft: FristHerkunft;
    rechtsgrundlage: string | null;
    notiz: string | null;
  };
}

export function RegelForm({ docTyp, label, effektiv }: RegelFormProps) {
  const [state, formAction] = useActionState(speichereRegelAction, initialState);
  const jahreRef = useRef<HTMLInputElement>(null);
  const rechtsgrundlageRef = useRef<HTMLInputElement>(null);

  const istMandantenregel = effektiv.herkunft === "mandantenregel";
  const jahreFeldId = `aufbewahrung-jahre-${docTyp}`;
  const rechtsgrundlageFeldId = `aufbewahrung-rechtsgrundlage-${docTyp}`;
  const notizFeldId = `aufbewahrung-notiz-${docTyp}`;

  return (
    <div className="space-y-3 border-t border-[color:var(--color-border)] pt-5 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-[color:var(--color-foreground)]">{label}</p>
          <p className="text-sm text-[color:var(--color-muted-foreground)]">
            Aktuell: {formatJahreLabel(effektiv.jahre)}
            {!istMandantenregel ? " (Vorschlag)" : ""}
          </p>
        </div>
        <StatusBadge variant={istMandantenregel ? "success" : "warning"}>
          {FRIST_HERKUNFT_LABEL[effektiv.herkunft]}
        </StatusBadge>
      </div>

      <form action={formAction} className="space-y-3" noValidate>
        <FormMessage state={state} />
        <input type="hidden" name="doc_typ" value={docTyp} />

        <div className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
          <div className="space-y-1">
            <label htmlFor={jahreFeldId} className="block text-sm font-medium">
              Jahre
            </label>
            <input
              id={jahreFeldId}
              ref={jahreRef}
              name="jahre"
              type="number"
              min={1}
              max={100}
              placeholder="dauerhaft"
              // Nur bei einer bestehenden Mandantenregel vorbefüllt. Der
              // gesetzliche Rückfall bleibt bewusst leer im Feld — ein leeres
              // Feld bedeutet beim Speichern "dauerhaft" (siehe unten), eine
              // Vorbefüllung mit dem Rückfallwert würde das beim
              // unveränderten Absenden in eine echte Mandantenregel
              // verwandeln, ohne dass jemand das entschieden hat.
              defaultValue={istMandantenregel ? effektiv.jahre ?? "" : ""}
              aria-invalid={state.errors?.jahre ? true : undefined}
              aria-describedby={`${jahreFeldId}-hinweis`}
              className="w-full rounded-md border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
            />
            <p
              id={`${jahreFeldId}-hinweis`}
              className="text-xs text-[color:var(--color-muted-foreground)]"
            >
              Leer = dauerhaft.
            </p>
            {state.errors?.jahre ? (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {state.errors.jahre.join(" ")}
              </p>
            ) : null}
          </div>

          <div className="space-y-1">
            <label htmlFor={rechtsgrundlageFeldId} className="block text-sm font-medium">
              Rechtsgrundlage
            </label>
            <input
              id={rechtsgrundlageFeldId}
              ref={rechtsgrundlageRef}
              name="rechtsgrundlage"
              type="text"
              maxLength={200}
              defaultValue={istMandantenregel ? effektiv.rechtsgrundlage ?? "" : ""}
              className="w-full rounded-md border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {/*
            Nur anzeigen, solange (noch) keine Mandantenregel besteht: der
            Wert kommt live aus effektiv.jahre (aufbewahrung_effektiv, 0071),
            nie aus einem Literal — bei einer bestehenden Mandantenregel
            kennt die Seite den ursprünglichen Rückfallwert gar nicht mehr
            (er wurde durch die Regel ersetzt), ein Chip könnte hier also nur
            raten.
          */}
          {!istMandantenregel ? (
            <button
              type="button"
              onClick={() => {
                if (jahreRef.current) {
                  jahreRef.current.value = effektiv.jahre === null ? "" : String(effektiv.jahre);
                }
              }}
              className="rounded-full border border-[color:var(--color-border)] px-3 py-1 text-xs text-[color:var(--color-muted-foreground)] hover:text-[color:var(--color-foreground)]"
            >
              Gesetzlichen Vorschlag übernehmen ({formatJahreLabel(effektiv.jahre)})
            </button>
          ) : null}

          {RECHTSGRUNDLAGE_VORSCHLAEGE.map((vorschlag) => (
            <button
              key={vorschlag.label}
              type="button"
              onClick={() => {
                if (rechtsgrundlageRef.current) {
                  rechtsgrundlageRef.current.value = vorschlag.rechtsgrundlage;
                }
              }}
              className="rounded-full border border-[color:var(--color-border)] px-3 py-1 text-xs text-[color:var(--color-muted-foreground)] hover:text-[color:var(--color-foreground)]"
            >
              {vorschlag.label}
            </button>
          ))}

          {/*
            Berührt ausschließlich das Jahresfeld. Eine frühere Fassung
            leerte hier auch rechtsgrundlage ohne jeden Hinweis darauf im
            einwortigen Label "dauerhaft" — ein Klick hätte eine bereits
            eingetragene Begründung unbemerkt gelöscht (Fix Round 1).
          */}
          <button
            type="button"
            onClick={() => {
              if (jahreRef.current) jahreRef.current.value = "";
            }}
            className="rounded-full border border-[color:var(--color-border)] px-3 py-1 text-xs text-[color:var(--color-muted-foreground)] hover:text-[color:var(--color-foreground)]"
          >
            dauerhaft
          </button>
        </div>

        <div className="space-y-1">
          <label htmlFor={notizFeldId} className="block text-sm font-medium">
            Notiz
          </label>
          <textarea
            id={notizFeldId}
            name="notiz"
            rows={2}
            placeholder="Warum weicht dieser Mandant ab?"
            defaultValue={istMandantenregel ? effektiv.notiz ?? "" : ""}
            className="w-full rounded-md border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
          />
        </div>

        <SubmitButton />
      </form>
    </div>
  );
}
