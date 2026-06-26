"use client";

/**
 * DraftReviewForm — editable textarea shown when protocol.status = "awaiting_review".
 *
 * The Verwalter can edit the KI draft and click "Freigeben & speichern" to
 * submit their revision via the submitRevision Server Action.
 */

import { useRef, useTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import type { submitRevision } from "./protokoll-actions";

interface DraftReviewFormProps {
  meetingId: string;
  threadId: string;
  initialDraft: string;
  submitRevisionAction: typeof submitRevision;
}

export function DraftReviewForm({
  meetingId,
  threadId,
  initialDraft,
  submitRevisionAction,
}: DraftReviewFormProps) {
  const [draft, setDraft] = useState(initialDraft);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      try {
        await submitRevisionAction(meetingId, threadId, draft);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unbekannter Fehler.");
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* KI-Entwurf warning */}
      <div
        role="alert"
        className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
      >
        <strong>KI-Entwurf</strong> — Bitte Protokoll prüfen und ggf. anpassen,
        bevor Sie es freigeben. Der Agent ist nur ein Vorschlag — die
        Verantwortung liegt beim Verwalter.
      </div>

      {/* Editable draft textarea */}
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        disabled={isPending}
        rows={24}
        className="w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-background)] px-3 py-2 font-mono text-sm text-[color:var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-ring)] disabled:opacity-50"
        aria-label="Protokoll-Entwurf bearbeiten"
      />

      {/* Error */}
      {error ? (
        <div
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
        >
          {error}
        </div>
      ) : null}

      {/* Submit */}
      <Button onClick={handleSubmit} disabled={isPending || draft.trim() === ""}>
        {isPending ? "Wird gespeichert …" : "Freigeben & speichern"}
      </Button>
    </div>
  );
}
