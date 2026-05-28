"use client";

// Next.js error boundary — must be a Client Component. Catches render-time
// errors thrown below this segment (the server component's `throw`-paths,
// not the swallowed PostgREST error which we render inline as role="alert").
//
// We do NOT render `error.message` — it may contain stack frames or DB
// internals. The console.error path lands in the server log via Next's
// error reporter.

import { useEffect } from "react";

export default function WegsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[wegs] render error:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">WEGs</h1>
      <div
        role="alert"
        className="mt-6 rounded-md border border-[var(--color-border)] p-4"
      >
        <p className="text-sm font-medium">Etwas ist schiefgelaufen.</p>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Die WEG-Liste konnte nicht angezeigt werden.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-4 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:border-[var(--color-accent)]"
        >
          Erneut versuchen
        </button>
      </div>
    </div>
  );
}
