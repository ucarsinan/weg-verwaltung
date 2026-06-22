"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { WegAddressFields } from "../../address-fields";
import { updateWeg, type WegEditFormState } from "./actions";
import { parseWegAddress } from "../../address";

interface WegEditFormProps {
  id: string;
  initialData: {
    name: string;
    adresse: string | null;
  };
}

const initialState: WegEditFormState = {};

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

export function WegEditForm({ id, initialData }: WegEditFormProps) {
  const updateWegWithId = updateWeg.bind(null, id);
  const [state, formAction] = useActionState(updateWegWithId, initialState);
  const address = parseWegAddress(initialData.adresse);
  const addressErrors = state.errors?.address;

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
        <label htmlFor="name" className="block text-sm font-medium">
          Name der WEG <span aria-hidden="true">*</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          aria-required="true"
          aria-invalid={state.errors?.name ? true : undefined}
          aria-describedby={state.errors?.name ? "name-error" : undefined}
          minLength={3}
          maxLength={200}
          defaultValue={initialData.name}
          autoComplete="off"
          className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
        />
        {state.errors?.name ? (
          <p
            id="name-error"
            role="alert"
            className="text-sm text-red-600 dark:text-red-400"
          >
            {state.errors.name.join(" ")}
          </p>
        ) : null}
      </div>

      <WegAddressFields defaultValue={address} errors={addressErrors} />

      <div className="flex items-center gap-4 pt-2">
        <Link
          href={`/wegs/${id}`}
          className="text-sm underline underline-offset-4 hover:text-[var(--color-accent)]"
        >
          Abbrechen
        </Link>
        <SubmitButton />
      </div>
    </form>
  );
}
