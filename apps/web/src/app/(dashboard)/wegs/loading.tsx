// Next.js loading.tsx — rendered as a React Suspense fallback while the
// server component above streams. SR pattern #2 from docs/05 §5.10:
// role="status" + aria-label so screen readers announce the loading state
// instead of silent skeletons.

export default function WegsLoading() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="h-7 w-32 animate-pulse rounded bg-[var(--color-border)]" />
      <div className="mt-3 h-4 w-80 animate-pulse rounded bg-[var(--color-border)]" />

      <div
        role="status"
        aria-label="Lade WEG-Liste"
        aria-busy="true"
        className="mt-8 divide-y divide-[var(--color-border)] rounded-md border border-[var(--color-border)]"
      >
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center justify-between gap-4 p-4">
            <div className="min-w-0 flex-1">
              <div className="h-4 w-48 animate-pulse rounded bg-[var(--color-border)]" />
              <div className="mt-2 h-3 w-64 animate-pulse rounded bg-[var(--color-border)]" />
            </div>
            <div className="h-4 w-24 animate-pulse rounded bg-[var(--color-border)]" />
          </div>
        ))}
        <span className="sr-only">WEG-Liste wird geladen.</span>
      </div>
    </div>
  );
}
