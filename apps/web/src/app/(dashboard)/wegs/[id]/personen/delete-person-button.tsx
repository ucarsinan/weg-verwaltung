"use client";

import { useActionState } from "react";
import { deletePerson } from "./actions";

interface DeletePersonButtonProps {
  wegId: string;
  personId: string;
}

export function DeletePersonButton({ wegId, personId }: DeletePersonButtonProps) {
  const [state, formAction, isPending] = useActionState(
    async () => {
      return await deletePerson(wegId, personId);
    },
    {}
  );

  return (
    <form action={formAction} className="inline">
      <div className="flex flex-col items-end">
        <button
          type="submit"
          disabled={isPending}
          className="text-sm text-red-600 underline underline-offset-4 hover:text-red-800 disabled:opacity-60"
          aria-label="Person löschen"
        >
          {isPending ? "Löschen …" : "Löschen"}
        </button>
        {state?.errors?._form && (
          <p
            role="alert"
            className="mt-1 max-w-[250px] text-right text-xs text-red-600 dark:text-red-400"
          >
            {state.errors._form.join(" ")}
          </p>
        )}
      </div>
    </form>
  );
}
