"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { ResolutionFormState } from "./actions";

interface BeschlussFormProps {
  action: (
    prev: ResolutionFormState,
    formData: FormData,
  ) => Promise<ResolutionFormState>;
}

const initialState: ResolutionFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-busy={pending}>
      {pending ? "Speichern …" : "Beschluss anlegen"}
    </Button>
  );
}

export function BeschlussForm({ action }: BeschlussFormProps) {
  const [state, formAction] = useActionState(action, initialState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Beschlussvorlage</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-5" noValidate>
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
            <Label htmlFor="text">
              Beschlusstext <span aria-hidden="true">*</span>
            </Label>
            <textarea
              id="text"
              name="text"
              rows={6}
              required
              aria-required="true"
              aria-invalid={state.errors?.text ? true : undefined}
              aria-describedby={state.errors?.text ? "text-error" : undefined}
              className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm placeholder:text-[var(--color-muted-foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] resize-none"
              placeholder="Beschlusstext eingeben …"
            />
            {state.errors?.text ? (
              <p
                id="text-error"
                role="alert"
                className="text-sm text-red-600 dark:text-red-400"
              >
                {state.errors.text.join(" ")}
              </p>
            ) : null}
          </div>

          <div className="space-y-1">
            <Label htmlFor="mehrheits_typ">
              Mehrheitstyp <span aria-hidden="true">*</span>
            </Label>
            <select
              id="mehrheits_typ"
              name="mehrheits_typ"
              required
              aria-required="true"
              aria-invalid={state.errors?.mehrheits_typ ? true : undefined}
              aria-describedby={
                state.errors?.mehrheits_typ
                  ? "mehrheits_typ-error"
                  : undefined
              }
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            >
              <option value="">Bitte wählen …</option>
              <option value="einfach">Einfache Mehrheit (§ 25 Abs. 1 WEG)</option>
              <option value="qualifiziert">Qualifizierte Mehrheit</option>
              <option value="doppelt_qualifiziert">
                Doppelt qualifizierte Mehrheit
              </option>
              <option value="allstimmig">Allstimmigkeit</option>
              <option value="vereinbarungs_aenderung">
                Vereinbarungsänderung
              </option>
            </select>
            {state.errors?.mehrheits_typ ? (
              <p
                id="mehrheits_typ-error"
                role="alert"
                className="text-sm text-red-600 dark:text-red-400"
              >
                {state.errors.mehrheits_typ.join(" ")}
              </p>
            ) : null}
          </div>

          <div className="space-y-1">
            <Label htmlFor="stimmprinzip">
              Stimmprinzip <span aria-hidden="true">*</span>
            </Label>
            <select
              id="stimmprinzip"
              name="stimmprinzip"
              required
              aria-required="true"
              aria-invalid={state.errors?.stimmprinzip ? true : undefined}
              aria-describedby={
                state.errors?.stimmprinzip ? "stimmprinzip-error" : undefined
              }
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            >
              <option value="">Bitte wählen …</option>
              <option value="kopf">
                Kopfprinzip (eine Stimme je Eigentümer)
              </option>
              <option value="wert">Wertprinzip (MEA-Anteil)</option>
              <option value="objekt">
                Objektprinzip (eine Stimme je Wohnung)
              </option>
            </select>
            {state.errors?.stimmprinzip ? (
              <p
                id="stimmprinzip-error"
                role="alert"
                className="text-sm text-red-600 dark:text-red-400"
              >
                {state.errors.stimmprinzip.join(" ")}
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
