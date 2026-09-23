"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { loescheDokumentAction, type LoescheDokumentFormState } from "../actions";

const initialState: LoescheDokumentFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      // Bewusst kein "Löschen": es ist ein Soft-Delete, Datei und Versionen
      // bleiben unverändert im Storage — der Verwalter verwahrt die
      // Unterlagen treuhänderisch fuer die WEG, er vernichtet sie nicht.
      aria-label="Dokument aus der Liste entfernen"
      className="shrink-0 text-sm text-red-600 underline underline-offset-4 hover:text-red-800 disabled:opacity-60 dark:text-red-400"
    >
      {pending ? "Wird entfernt …" : "Aus der Liste entfernen"}
    </button>
  );
}

export default function EntferneDokumentButton({
  wegId,
  dokumentId,
}: {
  wegId: string;
  dokumentId: string;
}) {
  const [state, formAction] = useActionState(loescheDokumentAction, initialState);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="weg_id" value={wegId} />
      <input type="hidden" name="dokument_id" value={dokumentId} />
      <SubmitButton />
      <p className="max-w-[220px] text-right text-xs text-[color:var(--color-muted-foreground)]">
        Entfernt nur den Eintrag aus dieser Liste — die Datei und alle
        Versionen bleiben im Speicher unverändert erhalten.
      </p>
      {state.errors?._form && (
        <p
          role="alert"
          className="max-w-[220px] text-right text-xs text-red-600 dark:text-red-400"
        >
          {state.errors._form.join(" ")}
        </p>
      )}
    </form>
  );
}
