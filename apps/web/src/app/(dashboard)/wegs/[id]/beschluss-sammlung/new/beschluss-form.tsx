"use client";

import { useActionState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import BeschlussReviewPanel from "./beschluss-review-panel";
import type { BeschlussSammlungFormState } from "./actions";

const TYP_OPTIONS = [
  { value: "positiv_beschluss", label: "Positiv-Beschluss (angenommen)" },
  { value: "negativ_beschluss", label: "Negativ-Beschluss (abgelehnt)" },
  { value: "umlaufbeschluss", label: "Umlaufbeschluss" },
] as const;

interface BeschlussSammlungFormProps {
  wegId: string;
  action: (
    prev: BeschlussSammlungFormState,
    formData: FormData,
  ) => Promise<BeschlussSammlungFormState>;
}

export default function BeschlussSammlungForm({
  wegId,
  action,
}: BeschlussSammlungFormProps) {
  const [state, formAction, isPending] = useActionState(action, {});
  // Ref so the review panel can read the current textarea value at submit time
  // without requiring the textarea to be inside the review panel's own form.
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const getDraftText = useCallback(() => textareaRef.current?.value ?? "", []);

  return (
    <div className="space-y-8">
      <form action={formAction} className="space-y-6" noValidate>
        {state.errors?._form ? (
          <p
            id="beschluss-form-error"
            role="alert"
            className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
          >
            {state.errors._form[0]}
          </p>
        ) : null}

        {/* Beschlusstext */}
        <div className="space-y-2">
          <Label htmlFor="beschluss_text">
            Beschlusstext{" "}
            <span className="text-[color:var(--color-muted-foreground)]">
              (vollständiger Wortlaut gem. § 24 Abs. 7 WEG)
            </span>
          </Label>
          <textarea
            ref={textareaRef}
            id="beschluss_text"
            name="beschluss_text"
            rows={6}
            required
            minLength={20}
            maxLength={10000}
            aria-describedby={
              state.errors?.beschluss_text ? "beschluss_text-error" : undefined
            }
            aria-invalid={state.errors?.beschluss_text ? true : undefined}
            className="w-full rounded-md border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm placeholder:text-[color:var(--color-muted-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-(--color-background) disabled:opacity-50"
          />
          {state.errors?.beschluss_text ? (
            <p
              id="beschluss_text-error"
              role="alert"
              className="text-sm text-red-600 dark:text-red-400"
            >
              {state.errors.beschluss_text[0]}
            </p>
          ) : null}
        </div>

        {/* Datum */}
        <div className="space-y-2">
          <Label htmlFor="datum">Datum der Beschlussfassung</Label>
          <Input
            id="datum"
            name="datum"
            type="date"
            required
            aria-describedby={state.errors?.datum ? "datum-error" : undefined}
            aria-invalid={state.errors?.datum ? true : undefined}
          />
          {state.errors?.datum ? (
            <p
              id="datum-error"
              role="alert"
              className="text-sm text-red-600 dark:text-red-400"
            >
              {state.errors.datum[0]}
            </p>
          ) : null}
        </div>

        {/* Typ */}
        <div className="space-y-2">
          <Label htmlFor="typ">Beschluss-Typ</Label>
          <select
            id="typ"
            name="typ"
            required
            defaultValue=""
            aria-describedby={state.errors?.typ ? "typ-error" : undefined}
            aria-invalid={state.errors?.typ ? true : undefined}
            className="w-full rounded-md border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
          >
            <option value="" disabled>
              Typ auswählen …
            </option>
            {TYP_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {state.errors?.typ ? (
            <p
              id="typ-error"
              role="alert"
              className="text-sm text-red-600 dark:text-red-400"
            >
              {state.errors.typ[0]}
            </p>
          ) : null}
        </div>

        <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
          {isPending ? "Wird gespeichert …" : "Eintrag speichern"}
        </Button>
      </form>

      {/* KI-Prüfung — separate visual section, separate form action */}
      <div className="border-t border-[color:var(--color-border)] pt-6">
        <p className="mb-3 text-sm font-medium text-[color:var(--color-foreground)]">
          KI-gestützte Vorprüfung
        </p>
        <BeschlussReviewPanel wegId={wegId} getDraftText={getDraftText} />
      </div>
    </div>
  );
}
