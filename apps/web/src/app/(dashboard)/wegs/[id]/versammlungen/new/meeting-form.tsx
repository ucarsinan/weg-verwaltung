"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MeetingFormState } from "./actions";

const initialState: MeetingFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-busy={pending}>
      {pending ? "Speichern …" : "Versammlung anlegen"}
    </Button>
  );
}

interface MeetingFormProps {
  action: (
    prev: MeetingFormState,
    formData: FormData,
  ) => Promise<MeetingFormState>;
  wegId: string;
}

export function MeetingForm({ action, wegId }: MeetingFormProps) {
  const [state, formAction] = useActionState(action, initialState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Versammlung anlegen</CardTitle>
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

          {/* Titel */}
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

          {/* Modus */}
          <div className="space-y-1">
            <Label htmlFor="modus">
              Modus <span aria-hidden="true">*</span>
            </Label>
            <select
              id="modus"
              name="modus"
              defaultValue="praesenz"
              required
              aria-required="true"
              aria-invalid={state.errors?.modus ? true : undefined}
              aria-describedby={state.errors?.modus ? "modus-error" : undefined}
              className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
            >
              <option value="praesenz">Präsenz</option>
              <option value="hybrid">Hybrid</option>
              <option value="virtuell">Virtuell</option>
              <option value="umlauf">Umlaufbeschluss</option>
            </select>
            {state.errors?.modus ? (
              <p
                id="modus-error"
                role="alert"
                className="text-sm text-red-600 dark:text-red-400"
              >
                {state.errors.modus.join(" ")}
              </p>
            ) : null}
          </div>

          {/* Termin von */}
          <div className="space-y-1">
            <Label htmlFor="termin_von">Termin von</Label>
            <input
              id="termin_von"
              name="termin_von"
              type="datetime-local"
              aria-invalid={state.errors?.termin_von ? true : undefined}
              aria-describedby={
                state.errors?.termin_von ? "termin_von-error" : undefined
              }
              className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
            />
            {state.errors?.termin_von ? (
              <p
                id="termin_von-error"
                role="alert"
                className="text-sm text-red-600 dark:text-red-400"
              >
                {state.errors.termin_von.join(" ")}
              </p>
            ) : null}
          </div>

          {/* Termin bis */}
          <div className="space-y-1">
            <Label htmlFor="termin_bis">Termin bis</Label>
            <input
              id="termin_bis"
              name="termin_bis"
              type="datetime-local"
              aria-invalid={state.errors?.termin_bis ? true : undefined}
              aria-describedby={
                state.errors?.termin_bis ? "termin_bis-error" : undefined
              }
              className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
            />
            {state.errors?.termin_bis ? (
              <p
                id="termin_bis-error"
                role="alert"
                className="text-sm text-red-600 dark:text-red-400"
              >
                {state.errors.termin_bis.join(" ")}
              </p>
            ) : null}
          </div>

          <div className="flex items-center gap-4 pt-2">
            <Link
              href={`/wegs/${wegId}`}
              className="text-sm underline underline-offset-4 hover:text-[var(--color-accent)]"
            >
              Abbrechen
            </Link>
            <SubmitButton />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
