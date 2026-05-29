"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TopFormState } from "./actions";

// Client island for the TOP-Anlage-Form. Pattern mirrors wegs/new/weg-form.tsx.
//
// A11y per §5.10:
//  - noValidate so German error messages are the single source of truth.
//  - aria-invalid + aria-describedby wire each field to its error region.
//  - Field-level errors use role="alert" for screen-reader announcement.
//  - aria-required="true" on the required Titel field.
//  - SubmitButton sets aria-busy while pending.

const initialState: TopFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
    >
      {pending ? "Speichern …" : "TOP anlegen"}
    </button>
  );
}

interface TopFormProps {
  action: (prev: TopFormState, formData: FormData) => Promise<TopFormState>;
}

export function TopForm({ action }: TopFormProps) {
  const [state, formAction] = useActionState(action, initialState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tagesordnungspunkt anlegen</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4" noValidate>
          {state.errors?._form ? (
            <div
              id="form-error"
              role="alert"
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-sm text-red-600 dark:text-red-400"
            >
              {state.errors._form.join(" ")}
            </div>
          ) : null}

          <div className="space-y-1">
            <Label htmlFor="titel">
              Titel <span aria-hidden="true">*</span>
            </Label>
            <Input
              id="titel"
              name="titel"
              type="text"
              required
              aria-required="true"
              aria-invalid={state.errors?.titel ? true : undefined}
              aria-describedby={state.errors?.titel ? "titel-error" : undefined}
              minLength={3}
              maxLength={200}
              autoComplete="off"
            />
            {state.errors?.titel ? (
              <p
                id="titel-error"
                role="alert"
                className="text-sm text-red-600 dark:text-red-400"
              >
                {state.errors.titel.join(" ")}
              </p>
            ) : null}
          </div>

          <div className="space-y-1">
            <Label htmlFor="beschreibung">Beschreibung</Label>
            <textarea
              id="beschreibung"
              name="beschreibung"
              rows={4}
              maxLength={1000}
              autoComplete="off"
              aria-invalid={state.errors?.beschreibung ? true : undefined}
              aria-describedby={
                state.errors?.beschreibung ? "beschreibung-error" : undefined
              }
              className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm placeholder:text-[var(--color-muted-foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] resize-none"
            />
            {state.errors?.beschreibung ? (
              <p
                id="beschreibung-error"
                role="alert"
                className="text-sm text-red-600 dark:text-red-400"
              >
                {state.errors.beschreibung.join(" ")}
              </p>
            ) : null}
          </div>

          <div className="flex items-center gap-4 pt-2">
            <SubmitButton />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
