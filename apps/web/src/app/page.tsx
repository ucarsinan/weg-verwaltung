import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-24">
      <p className="text-sm uppercase tracking-wide text-[var(--color-muted)]">
        Portfolio-Projekt
      </p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">
        WEG-Verwaltung
      </h1>
      <p className="mt-4 text-lg text-[var(--color-muted)]">
        Verwaltungssoftware für Wohnungseigentümergemeinschaften.
        Multi-Tenant, KI-first, sicher von Anfang an.
      </p>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        Status: Design-Phase. Sections 1–5 dokumentiert; Implementierung
        beginnt mit diesem Scaffold.
      </p>
      <div className="mt-8 flex gap-4">
        <Link
          href="/login"
          className="inline-flex items-center rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white"
        >
          Anmelden
        </Link>
      </div>
    </div>
  );
}
