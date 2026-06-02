"use client";

/**
 * SignForm — "Unterzeichnen" button shown when protocol.status = "ki_entwurf".
 *
 * Calls the signProtokoll Server Action and shows a loading state.
 * Invariant: no agent interaction — purely a human finalisation step.
 */

import { useTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import type { signProtokoll } from "./protokoll-actions";

interface SignFormProps {
  protocolId: string;
  signAction: typeof signProtokoll;
}

export function SignForm({ protocolId, signAction }: SignFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSign() {
    setError(null);
    startTransition(async () => {
      try {
        await signAction(protocolId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unbekannter Fehler.");
      }
    });
  }

  return (
    <div className="space-y-3">
      {error ? (
        <div
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
        >
          {error}
        </div>
      ) : null}
      <Button onClick={handleSign} disabled={isPending}>
        {isPending ? "Unterzeichnung läuft …" : "Protokoll unterzeichnen"}
      </Button>
      <p className="text-xs text-[color:var(--color-muted-foreground)]">
        Nach der Unterzeichnung wird automatisch ein PDF erzeugt und im
        Dokumenten-Archiv abgelegt (§ 24 Abs. 7 WEG).
      </p>
    </div>
  );
}
