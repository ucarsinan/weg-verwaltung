"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { deletePositionAction, type PositionFormState } from "../actions";

const initialState: PositionFormState = {};

function SubmitButton({ bezeichnung }: { bezeichnung: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      aria-label={`Position ${bezeichnung} entfernen`}
      className="text-sm underline underline-offset-4 hover:text-red-600 disabled:opacity-60 dark:hover:text-red-400"
    >
      {pending ? "Entfernen …" : "Entfernen"}
    </button>
  );
}

export default function PositionLoeschen({
  wegId,
  berichtId,
  positionId,
  bezeichnung,
}: {
  wegId: string;
  berichtId: string;
  positionId: string;
  bezeichnung: string;
}) {
  const [state, formAction] = useActionState(deletePositionAction, initialState);

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="weg_id" value={wegId} />
      <input type="hidden" name="bericht_id" value={berichtId} />
      <input type="hidden" name="position_id" value={positionId} />
      <SubmitButton bezeichnung={bezeichnung} />
      {state.errors?._form && (
        <span role="alert" className="ml-2 text-xs text-red-600 dark:text-red-400">
          {state.errors._form.join(" ")}
        </span>
      )}
    </form>
  );
}
