// Next.js loading.tsx — Suspense fallback for the WEG-detail Server Component.
// Mirrors the page-layout (header → Stammdaten → Versammlungen → Aktionen) so
// the skeleton communicates structure, not just "something is loading".
//
// § 5.10 SR-pattern #2: role="status" + aria-label + sr-only fallback string
// so screen readers announce the loading state instead of silent skeletons.

import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";

function Bar({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-[color:var(--color-border)] ${className ?? ""}`}
    />
  );
}

export default function WegDetailLoading() {
  return (
    <section
      role="status"
      aria-label="Lade WEG-Details"
      aria-busy="true"
      className="mx-auto max-w-3xl space-y-6 px-6 py-12"
    >
      {/* Header — title + back-link */}
      <header className="space-y-2">
        <Bar className="h-7 w-64" />
        <Bar className="h-4 w-40" />
      </header>

      {/* Stammdaten card skeleton */}
      <Card>
        <CardHeader className="space-y-2">
          <Bar className="h-5 w-32" />
          <Bar className="h-4 w-56" />
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <Bar className="h-4 w-20" />
              <Bar className="h-4 w-48" />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Versammlungen card skeleton */}
      <Card>
        <CardHeader className="space-y-2">
          <Bar className="h-5 w-40" />
          <Bar className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-[color:var(--color-border)]">
            {[0, 1, 2].map((i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-4 py-3"
              >
                <div className="min-w-0 flex-1 space-y-2">
                  <Bar className="h-4 w-48" />
                  <Bar className="h-3 w-64" />
                </div>
                <Bar className="h-4 w-24" />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Aktionen card skeleton */}
      <Card>
        <CardHeader className="space-y-2">
          <Bar className="h-5 w-24" />
          <Bar className="h-4 w-72" />
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Bar className="h-9 w-48" />
          <Bar className="h-9 w-40" />
        </CardContent>
      </Card>

      <span className="sr-only">WEG-Details werden geladen.</span>
    </section>
  );
}
