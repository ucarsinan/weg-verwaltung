"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { acceptSuggestion, rejectSuggestion } from "./actions";

interface SuggestionActionsProps {
  meetingId: string;
  suggestionId: string;
  acceptAction: typeof acceptSuggestion;
  rejectAction: typeof rejectSuggestion;
}

export function SuggestionActions({
  meetingId,
  suggestionId,
  acceptAction,
  rejectAction,
}: SuggestionActionsProps) {
  const [isPending, startTransition] = useTransition();

  function handleAccept() {
    startTransition(async () => {
      await acceptAction(meetingId, suggestionId);
    });
  }

  function handleReject() {
    startTransition(async () => {
      await rejectAction(meetingId, suggestionId);
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={handleAccept}
        className="border-green-600 text-green-700 hover:bg-green-50 disabled:opacity-50 dark:border-green-500 dark:text-green-400 dark:hover:bg-green-950"
      >
        {isPending ? "…" : "Übernehmen"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={handleReject}
        className="border-[color:var(--color-border)] text-[color:var(--color-foreground)] hover:bg-[color:var(--color-secondary)] disabled:opacity-50"
      >
        {isPending ? "…" : "Verwerfen"}
      </Button>
    </div>
  );
}
