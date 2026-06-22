"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { MeetingStatusState } from "./actions";

const initialState: MeetingStatusState = {};

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-border)] disabled:opacity-60"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

interface MeetingStatusFormProps {
  action: (
    prev: MeetingStatusState,
    formData: FormData,
  ) => Promise<MeetingStatusState>;
  label: string;
  pendingLabel: string;
}

export function MeetingStatusForm({
  action,
  label,
  pendingLabel,
}: MeetingStatusFormProps) {
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
      <SubmitButton label={label} pendingLabel={pendingLabel} />
    </form>
  );
}
