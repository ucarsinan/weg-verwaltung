"use client";

import { Save } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProfileFormState } from "@/modules/settings/profile-actions";

interface ProfilePersonData {
  vorname: string;
  nachname: string;
  email: string | null;
  telefon: string | null;
  anschrift: string | null;
}

interface ProfileFormProps {
  action: (
    state: ProfileFormState,
    formData: FormData,
  ) => Promise<ProfileFormState>;
  person: ProfilePersonData;
}

const initialState: ProfileFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} aria-busy={pending}>
      <Save aria-hidden="true" />
      {pending ? "Speichern ..." : "Speichern"}
    </Button>
  );
}

function FieldError({
  id,
  messages,
}: {
  id: string;
  messages: string[] | undefined;
}) {
  if (!messages) return null;

  return (
    <p id={id} role="alert" className="text-sm text-[color:var(--color-destructive)]">
      {messages.join(" ")}
    </p>
  );
}

export function ProfileForm({ action, person }: ProfileFormProps) {
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.errors?._form ? (
        <div
          id="profile-form-error"
          role="alert"
          className="rounded-md border border-[color:var(--color-destructive)] bg-[color:var(--color-background)] p-3 text-sm text-[color:var(--color-destructive)]"
        >
          {state.errors._form.join(" ")}
        </div>
      ) : null}

      {state.success ? (
        <p
          id="profile-form-success"
          role="status"
          className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-100"
        >
          {state.success}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="profile-vorname">
            Vorname <span aria-hidden="true">*</span>
          </Label>
          <Input
            id="profile-vorname"
            name="vorname"
            type="text"
            required
            aria-required="true"
            aria-invalid={state.errors?.vorname ? true : undefined}
            aria-describedby={
              state.errors?.vorname ? "profile-vorname-error" : undefined
            }
            data-invalid={state.errors?.vorname ? true : undefined}
            maxLength={100}
            defaultValue={person.vorname}
            autoComplete="given-name"
          />
          <FieldError
            id="profile-vorname-error"
            messages={state.errors?.vorname}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="profile-nachname">
            Nachname <span aria-hidden="true">*</span>
          </Label>
          <Input
            id="profile-nachname"
            name="nachname"
            type="text"
            required
            aria-required="true"
            aria-invalid={state.errors?.nachname ? true : undefined}
            aria-describedby={
              state.errors?.nachname ? "profile-nachname-error" : undefined
            }
            data-invalid={state.errors?.nachname ? true : undefined}
            maxLength={100}
            defaultValue={person.nachname}
            autoComplete="family-name"
          />
          <FieldError
            id="profile-nachname-error"
            messages={state.errors?.nachname}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="profile-email">E-Mail</Label>
        <Input
          id="profile-email"
          name="email"
          type="email"
          aria-invalid={state.errors?.email ? true : undefined}
          aria-describedby={
            state.errors?.email ? "profile-email-error" : undefined
          }
          data-invalid={state.errors?.email ? true : undefined}
          maxLength={200}
          defaultValue={person.email ?? ""}
          autoComplete="email"
        />
        <FieldError id="profile-email-error" messages={state.errors?.email} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="profile-telefon">Telefon</Label>
        <Input
          id="profile-telefon"
          name="telefon"
          type="tel"
          aria-invalid={state.errors?.telefon ? true : undefined}
          aria-describedby={
            state.errors?.telefon ? "profile-telefon-error" : undefined
          }
          data-invalid={state.errors?.telefon ? true : undefined}
          maxLength={50}
          defaultValue={person.telefon ?? ""}
          autoComplete="tel"
        />
        <FieldError
          id="profile-telefon-error"
          messages={state.errors?.telefon}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="profile-anschrift">Anschrift</Label>
        <textarea
          id="profile-anschrift"
          name="anschrift"
          rows={3}
          aria-invalid={state.errors?.anschrift ? true : undefined}
          aria-describedby={
            state.errors?.anschrift ? "profile-anschrift-error" : undefined
          }
          data-invalid={state.errors?.anschrift ? true : undefined}
          maxLength={500}
          defaultValue={person.anschrift ?? ""}
          autoComplete="street-address"
          className="flex min-h-24 w-full rounded-md border border-[color:var(--color-input)] bg-transparent px-3 py-2 text-sm text-[color:var(--color-foreground)] shadow-sm transition-colors placeholder:text-[color:var(--color-muted-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-background)] disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-[color:var(--color-destructive)] aria-[invalid=true]:focus-visible:ring-[color:var(--color-destructive)] data-[invalid]:border-2"
        />
        <FieldError
          id="profile-anschrift-error"
          messages={state.errors?.anschrift}
        />
      </div>

      <div className="flex justify-end pt-2">
        <SubmitButton />
      </div>
    </form>
  );
}
