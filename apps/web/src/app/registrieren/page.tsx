import Link from "next/link";

import { RegistrationForm } from "./registration-form";

export const metadata = { title: "WEG kostenlos starten — WEG-Verwaltung" };

export default function RegistrationPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl items-center px-6 py-12 sm:px-8">
      <div className="grid w-full gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.72fr)] lg:items-center">
        <section className="max-w-2xl">
          <Link href="/" className="text-sm font-semibold">WEG-Verwaltung</Link>
          <p className="mt-10 text-sm font-medium text-[color:var(--color-muted-foreground)]">Ohne Installation · Für 3–20 Einheiten</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">Ihre WEG in wenigen Minuten gemeinsam organisieren.</h1>
          <p className="mt-5 text-lg leading-8 text-[color:var(--color-muted-foreground)]">Erstellen Sie den gemeinsamen Bereich, laden Sie weitere Eigentümer ein und starten Sie mit Dokumenten, Vorgängen und Versammlungen.</p>
        </section>
        <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-6 shadow-xl sm:p-8">
          <h2 className="text-2xl font-semibold">Kostenlos starten</h2>
          <p className="mt-2 text-sm text-[color:var(--color-muted-foreground)]">Danach führen wir Sie durch die Einrichtung Ihrer WEG.</p>
          <div className="mt-7"><RegistrationForm /></div>
          <p className="mt-6 text-center text-sm text-[color:var(--color-muted-foreground)]">Schon ein Konto? <Link href="/login" className="font-medium text-[color:var(--color-primary)]">Anmelden</Link></p>
        </section>
      </div>
    </main>
  );
}
