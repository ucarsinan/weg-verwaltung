import { ArrowRight, Building2, CheckCircle2, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Preise — WEG-Verwaltung",
  description: "Klare Monatspreise für selbstverwaltete WEGs mit 3 bis 20 Einheiten.",
};

const sharedFeatures = [
  "30 Tage kostenlos testen – ohne Kreditkarte",
  "Ein Konto pro Eigentümer",
  "Mehrere Admins oder Verwalter",
  "Dokumente, Vorgänge und Versammlungen",
  "Beschlüsse und Abstimmungen",
  "Monatlich kündbar",
];

const plans = [
  {
    name: "Start",
    units: "3–10 Einheiten",
    price: "12,90 €",
    query: "start",
    description: "Für kleine Gemeinschaften, die ihre WEG gemeinsam einfach organisieren möchten.",
  },
  {
    name: "Gemeinschaft",
    units: "11–20 Einheiten",
    price: "24,90 €",
    query: "gemeinschaft",
    description: "Für größere selbstverwaltete WEGs mit mehr Abstimmung im Alltag.",
  },
];

export default function PricesPage() {
  return (
    <main id="main" className="min-h-screen overflow-x-hidden bg-[color:var(--color-background)] text-[color:var(--color-foreground)]">
      <header className="border-b border-[color:var(--color-border)]">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 py-6 sm:px-8 lg:px-10">
          <Link href="/" className="inline-flex min-h-10 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-background)]">
            <span className="flex size-9 items-center justify-center rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-card)] shadow-sm">
              <Building2 className="size-4" aria-hidden="true" />
            </span>
            <span className="text-sm font-semibold tracking-normal">WEG-Verwaltung</span>
          </Link>
          <nav aria-label="Hauptnavigation" className="flex items-center gap-3">
            <Link href="/" className="hidden rounded-md px-3 py-2 text-sm font-medium text-[color:var(--color-muted-foreground)] transition-colors hover:text-[color:var(--color-foreground)] sm:inline-flex">Startseite</Link>
            <Button asChild variant="outline" className="hidden sm:inline-flex"><Link href="/login">Anmelden</Link></Button>
            <Button asChild className="h-10 px-3 sm:px-4"><Link href="/registrieren">Kostenlos starten</Link></Button>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-16 sm:px-8 lg:px-10 lg:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold text-[color:var(--color-accent)]">Klare Preise für eure Gemeinschaft</p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-normal text-balance sm:text-6xl">Einfach starten. Gemeinsam verwalten.</h1>
          <p className="mt-5 text-lg leading-8 text-[color:var(--color-muted-foreground)]">Für selbstverwaltete WEGs mit 3 bis 20 Einheiten. Alle Eigentümerkonten und mehrere Admins sind im Preis enthalten.</p>
        </div>

        <div className="mx-auto mt-12 grid max-w-5xl gap-5 lg:grid-cols-2">
          {plans.map((plan) => (
            <article key={plan.name} className="flex flex-col rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-6 shadow-sm sm:p-8">
              <p className="text-sm font-semibold text-[color:var(--color-accent)]">{plan.name}</p>
              <h2 className="mt-2 text-2xl font-semibold">{plan.units}</h2>
              <p className="mt-3 min-h-12 text-sm leading-6 text-[color:var(--color-muted-foreground)]">{plan.description}</p>
              <p className="mt-7 text-4xl font-semibold">{plan.price}<span className="ml-1 text-base font-normal text-[color:var(--color-muted-foreground)]">pro Monat je WEG</span></p>
              <ul className="mt-7 space-y-3 border-t border-[color:var(--color-border)] pt-6">
                {sharedFeatures.map((feature) => (
                  <li key={feature} className="flex gap-2 text-sm leading-5"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />{feature}</li>
                ))}
              </ul>
              <Button asChild className="mt-8 h-11 w-full"><Link href={`/registrieren?plan=${plan.query}`}>30 Tage kostenlos starten <ArrowRight className="size-4" aria-hidden="true" /></Link></Button>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-[color:var(--color-border)] bg-[color:var(--color-secondary)]">
        <div className="mx-auto grid max-w-5xl gap-6 px-6 py-10 sm:px-8 md:grid-cols-2">
          <div className="flex gap-3"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-[color:var(--color-ai-violet)]" aria-hidden="true" /><div><h2 className="text-sm font-semibold">Ein Bereich nur für eure WEG</h2><p className="mt-1 text-sm leading-6 text-[color:var(--color-muted-foreground)]">Alle Eigentümer erhalten ihr eigenes Konto und arbeiten getrennt von anderen Gemeinschaften.</p></div></div>
          <div><h2 className="text-sm font-semibold">Was noch nicht enthalten ist</h2><p className="mt-1 text-sm leading-6 text-[color:var(--color-muted-foreground)]">Keine Bankanbindung, keine Jahresabrechnung, kein Mahnwesen und keine Rechtsberatung.</p></div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-14 text-center sm:px-8">
        <h2 className="text-2xl font-semibold text-balance sm:text-3xl">Bereit, eure WEG gemeinsam zu organisieren?</h2>
        <p className="mt-3 text-[color:var(--color-muted-foreground)]">Startet kostenlos und richtet eure Gemeinschaft Schritt für Schritt online ein.</p>
        <Button asChild size="lg" className="mt-7 h-11 px-5"><Link href="/registrieren">30 Tage kostenlos starten <ArrowRight className="size-4" aria-hidden="true" /></Link></Button>
      </section>
    </main>
  );
}
