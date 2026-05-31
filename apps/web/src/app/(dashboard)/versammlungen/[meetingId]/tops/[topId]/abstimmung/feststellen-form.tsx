"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { FeststellenResolutionState } from "./actions";

const initialState: FeststellenResolutionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
    >
      {pending ? "Feststellen …" : "Beschluss feststellen"}
    </button>
  );
}

interface FeststellenFormProps {
  action: (
    prev: FeststellenResolutionState,
    formData: FormData,
  ) => Promise<FeststellenResolutionState>;
}

export function FeststellenForm({ action }: FeststellenFormProps) {
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {state.error}
        </p>
      ) : null}
      <SubmitButton />
    </form>
  );
}
