"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import type { PersonFormState } from "./actions";

interface PersonFormProps {
  wegId: string;
  action: (state: PersonFormState, formData: FormData) => Promise<PersonFormState>;
  initialData?: {
    vorname: string;
    nachname: string;
    email?: string | null;
    telefon?: string | null;
    anschrift?: string | null;
    user_id?: string | null;
  };
}

const initialState: PersonFormState = {};

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

export function PersonForm({ wegId, action, initialData }: PersonFormProps) {
  const [state, formAction] = useActionState(action, initialState);

  return (
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
        <label htmlFor="vorname" className="block text-sm font-medium">
          Vorname <span aria-hidden="true">*</span>
        </label>
        <input
          id="vorname"
          name="vorname"
          type="text"
          required
          aria-required="true"
          aria-invalid={state.errors?.vorname ? true : undefined}
          aria-describedby={state.errors?.vorname ? "vorname-error" : undefined}
          maxLength={100}
          defaultValue={initialData?.vorname ?? ""}
          autoComplete="off"
          className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
        />
        {state.errors?.vorname ? (
          <p
            id="vorname-error"
            role="alert"
            className="text-sm text-red-600 dark:text-red-400"
          >
            {state.errors.vorname.join(" ")}
          </p>
        ) : null}
      </div>

      <div className="space-y-1">
        <label htmlFor="nachname" className="block text-sm font-medium">
          Nachname <span aria-hidden="true">*</span>
        </label>
        <input
          id="nachname"
          name="nachname"
          type="text"
          required
          aria-required="true"
          aria-invalid={state.errors?.nachname ? true : undefined}
          aria-describedby={state.errors?.nachname ? "nachname-error" : undefined}
          maxLength={100}
          defaultValue={initialData?.nachname ?? ""}
          autoComplete="off"
          className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
        />
        {state.errors?.nachname ? (
          <p
            id="nachname-error"
            role="alert"
            className="text-sm text-red-600 dark:text-red-400"
          >
            {state.errors.nachname.join(" ")}
          </p>
        ) : null}
      </div>

      <div className="space-y-1">
        <label htmlFor="email" className="block text-sm font-medium">
          E-Mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          aria-invalid={state.errors?.email ? true : undefined}
          aria-describedby={state.errors?.email ? "email-error" : undefined}
          maxLength={200}
          defaultValue={initialData?.email ?? ""}
          autoComplete="off"
          className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
        />
        {state.errors?.email ? (
          <p
            id="email-error"
            role="alert"
            className="text-sm text-red-600 dark:text-red-400"
          >
            {state.errors.email.join(" ")}
          </p>
        ) : null}
      </div>

      <div className="space-y-1">
        <label htmlFor="telefon" className="block text-sm font-medium">
          Telefon
        </label>
        <input
          id="telefon"
          name="telefon"
          type="text"
          aria-invalid={state.errors?.telefon ? true : undefined}
          aria-describedby={state.errors?.telefon ? "telefon-error" : undefined}
          maxLength={50}
          defaultValue={initialData?.telefon ?? ""}
          autoComplete="off"
          className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
        />
        {state.errors?.telefon ? (
          <p
            id="telefon-error"
            role="alert"
            className="text-sm text-red-600 dark:text-red-400"
          >
            {state.errors.telefon.join(" ")}
          </p>
        ) : null}
      </div>

      <div className="space-y-1">
        <label htmlFor="anschrift" className="block text-sm font-medium">
          Anschrift
        </label>
        <textarea
          id="anschrift"
          name="anschrift"
          rows={3}
          aria-invalid={state.errors?.anschrift ? true : undefined}
          aria-describedby={state.errors?.anschrift ? "anschrift-error" : undefined}
          maxLength={500}
          defaultValue={initialData?.anschrift ?? ""}
          autoComplete="off"
          className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
        />
        {state.errors?.anschrift ? (
          <p
            id="anschrift-error"
            role="alert"
            className="text-sm text-red-600 dark:text-red-400"
          >
            {state.errors.anschrift.join(" ")}
          </p>
        ) : null}
      </div>

      <div className="space-y-1">
        <label htmlFor="user_id" className="block text-sm font-medium">
          Benutzer-ID (UUID)
        </label>
        <input
          id="user_id"
          name="user_id"
          type="text"
          aria-invalid={state.errors?.user_id ? true : undefined}
          aria-describedby={state.errors?.user_id ? "user-error" : undefined}
          defaultValue={initialData?.user_id ?? ""}
          autoComplete="off"
          placeholder="z.B. aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
          className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
        />
        {state.errors?.user_id ? (
          <p
            id="user-error"
            role="alert"
            className="text-sm text-red-600 dark:text-red-400"
          >
            {state.errors.user_id.join(" ")}
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
  );
}
