import {
  ArrowRight,
  Building2,
  CheckCircle2,
  FileText,
  LockKeyhole,
  MessagesSquare,
  Scale,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

const benefits = [
  {
    icon: FileText,
    title: "Alles an einem Ort",
    text: "Dokumente, Vorgänge und Beschlüsse liegen für alle Eigentümer an einem klaren Ort.",
  },
  {
    icon: MessagesSquare,
    title: "Gemeinsam vorankommen",
    text: "Themen einreichen, Aufgaben klären und Versammlungen ohne E-Mail-Chaos vorbereiten.",
  },
  {
    icon: ShieldCheck,
    title: "Nachvollziehbar entscheiden",
    text: "Abstimmungen und Beschlüsse bleiben sauber dokumentiert – mit einem eigenen Bereich pro WEG.",
  },
];

const setupSteps = [
  {
    number: "01",
    title: "WEG anlegen",
    text: "Name, Adresse und Anzahl der Einheiten eingeben.",
  },
  {
    number: "02",
    title: "Eigentümer einladen",
    text: "Jeder erhält ein eigenes Konto und sieht nur eure WEG.",
  },
  {
    number: "03",
    title: "Gemeinsam starten",
    text: "Dokumente teilen, Themen organisieren und Beschlüsse festhalten.",
  },
];

const included = [
  "Ein eigenes Konto für jeden Eigentümer",
  "Mehrere Admins oder Verwalter möglich",
  "Dokumente, Vorgänge und Versammlungen",
  "Beschlüsse und Abstimmungen",
];

export default function LandingPage() {
  return (
    <main
      id="main"
      className="min-h-screen overflow-x-hidden bg-[color:var(--color-background)] text-[color:var(--color-foreground)]"
    >
      <section className="relative overflow-hidden border-b border-[color:var(--color-border)]">
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,color-mix(in_oklch,var(--color-secondary)_92%,transparent),transparent_55%),linear-gradient(135deg,color-mix(in_oklch,var(--color-accent-calm)_11%,transparent),transparent_62%)]" />
        <div className="mx-auto w-full max-w-7xl px-6 py-6 sm:px-8 lg:px-10">
          <header className="flex items-center justify-between gap-4">
            <Link
              href="/"
              className="inline-flex min-h-10 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-background)]"
            >
              <span className="flex size-9 items-center justify-center rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-card)] shadow-sm">
                <Building2 className="size-4" aria-hidden="true" />
              </span>
              <span className="text-sm font-semibold tracking-normal">
                WEG-Verwaltung
              </span>
            </Link>

            <nav aria-label="Hauptnavigation" className="flex items-center gap-2 sm:gap-3">
              <Link
                href="/preise"
                className="hidden rounded-md px-3 py-2 text-sm font-medium text-[color:var(--color-muted-foreground)] transition-colors hover:text-[color:var(--color-foreground)] sm:inline-flex"
              >
                Preise
              </Link>
              <Button asChild variant="outline" className="hidden sm:inline-flex">
                <Link href="/login">Anmelden</Link>
              </Button>
              <Button asChild className="h-10 px-3 sm:px-4">
                <Link href="/registrieren">Kostenlos starten</Link>
              </Button>
            </nav>
          </header>

          <div className="grid items-center gap-12 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.86fr)] lg:py-20">
            <div className="max-w-3xl">
              <p className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-card)] px-3 py-1 text-xs font-medium text-[color:var(--color-muted-foreground)] shadow-sm">
                <UsersRound className="size-3.5 text-[color:var(--color-accent-calm)]" aria-hidden="true" />
                Für selbstverwaltete WEGs mit 3–20 Einheiten
              </p>
              <h1 className="mt-6 max-w-4xl text-4xl font-semibold leading-tight tracking-normal text-balance sm:text-6xl lg:text-7xl">
                Eure WEG. Gemeinsam organisiert.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-[color:var(--color-muted-foreground)] sm:text-xl">
                Verwalte Dokumente, Vorgänge, Versammlungen und Beschlüsse an
                einem gemeinsamen Online-Ort – ohne Installation und ohne
                Expertenwissen.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="h-11 px-5">
                  <Link href="/registrieren">
                    30 Tage kostenlos starten
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="h-11 px-5">
                  <Link href="/preise">Preise ansehen</Link>
                </Button>
              </div>
              <p className="mt-4 text-sm text-[color:var(--color-muted-foreground)]">
                Keine Kreditkarte. Monatlich kündbar. Alle Eigentümerkonten inklusive.
              </p>
            </div>

            <div className="overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-card)] shadow-2xl shadow-black/10 dark:shadow-black/35">
              <div className="flex items-center justify-between gap-4 border-b border-[color:var(--color-border)] px-5 py-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-muted-foreground)]">
                    Eure WEG
                  </p>
                  <p className="mt-1 text-sm font-semibold">Am Birkenhof 12</p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  Bereit
                </span>
              </div>

              <div className="grid gap-px bg-[color:var(--color-border)] sm:grid-cols-3">
                <div className="bg-[color:var(--color-card)] px-5 py-4">
                  <p className="text-xs text-[color:var(--color-muted-foreground)]">Eigentümer</p>
                  <p className="mt-2 text-3xl font-semibold">8</p>
                </div>
                <div className="bg-[color:var(--color-card)] px-5 py-4">
                  <p className="text-xs text-[color:var(--color-muted-foreground)]">Offene Themen</p>
                  <p className="mt-2 text-3xl font-semibold text-amber-700 dark:text-amber-300">3</p>
                </div>
                <div className="bg-[color:var(--color-card)] px-5 py-4">
                  <p className="text-xs text-[color:var(--color-muted-foreground)]">Nächster Termin</p>
                  <p className="mt-2 text-lg font-semibold">18. Sep.</p>
                </div>
              </div>

              <div className="p-5">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="text-sm font-semibold">Heute erledigen</h2>
                  <span className="text-xs text-[color:var(--color-muted-foreground)]">3 Schritte</span>
                </div>
                <div className="mt-3 space-y-2">
                  {[
                    "Einladung zur Eigentümerversammlung prüfen",
                    "Angebot zur Dachreparatur besprechen",
                    "Protokoll der letzten Versammlung freigeben",
                  ].map((item) => (
                    <div
                      key={item}
                      className="flex min-h-12 items-center gap-3 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-background)] px-3 py-2"
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[color:var(--color-secondary)]">
                        <CheckCircle2 className="size-4 text-[color:var(--color-accent-calm)]" aria-hidden="true" />
                      </span>
                      <span className="text-sm font-medium">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-16 sm:px-8 lg:px-10">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-[color:var(--color-accent)]">Einfach im Alltag</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-normal text-balance sm:text-4xl">
            Was eure Gemeinschaft wirklich braucht.
          </h2>
        </div>
        <div className="mt-9 grid gap-4 md:grid-cols-3">
          {benefits.map((benefit) => {
            const Icon = benefit.icon;
            return (
              <article
                key={benefit.title}
                className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-5 shadow-sm"
              >
                <div className="flex size-10 items-center justify-center rounded-lg bg-[color:var(--color-secondary)]">
                  <Icon className="size-5" aria-hidden="true" />
                </div>
                <h3 className="mt-5 text-base font-semibold">{benefit.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[color:var(--color-muted-foreground)]">
                  {benefit.text}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="border-y border-[color:var(--color-border)] bg-[color:var(--color-secondary)]">
        <div className="mx-auto max-w-7xl px-6 py-16 sm:px-8 lg:px-10">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-[color:var(--color-accent)]">In wenigen Minuten bereit</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-normal text-balance sm:text-4xl">
              Kein Installieren. Kein kompliziertes Einrichten.
            </h2>
          </div>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {setupSteps.map((step) => (
              <li key={step.number} className="border-t border-[color:var(--color-line-strong)] pt-4">
                <p className="text-xs font-semibold tracking-widest text-[color:var(--color-accent)]">{step.number}</p>
                <h3 className="mt-3 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[color:var(--color-muted-foreground)]">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-10 px-6 py-16 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.72fr)] lg:px-10">
        <div>
          <p className="text-sm font-semibold text-[color:var(--color-accent)]">Klarer Start, fairer Preis</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-normal text-balance sm:text-4xl">
            Passend für kleine, selbstverwaltete WEGs.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[color:var(--color-muted-foreground)]">
            Wählt den Tarif nach Anzahl eurer Einheiten. Alle Eigentümerkonten und mehrere Admins sind immer inklusive.
          </p>
          <Link
            href="/preise"
            className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--color-accent)] hover:underline"
          >
            Tarife vergleichen
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
        <aside className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">Start</p>
              <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">Für 3–10 Einheiten</p>
            </div>
            <p className="text-right text-2xl font-semibold">12,90 €<span className="text-sm font-normal text-[color:var(--color-muted-foreground)]">/Monat</span></p>
          </div>
          <ul className="mt-6 space-y-3">
            {included.map((item) => (
              <li key={item} className="flex gap-2 text-sm leading-5">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
          <Button asChild className="mt-7 h-11 w-full">
            <Link href="/registrieren?plan=start">30 Tage kostenlos starten</Link>
          </Button>
        </aside>
      </section>

      <section className="border-t border-[color:var(--color-border)] bg-[color:var(--color-secondary)]">
        <div className="mx-auto grid max-w-7xl gap-6 px-6 py-10 sm:px-8 md:grid-cols-2 lg:px-10">
          <div className="flex gap-3">
            <LockKeyhole className="mt-0.5 size-5 shrink-0 text-[color:var(--color-ai-violet)]" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold">Ein geschützter Bereich pro WEG</h2>
              <p className="mt-1 text-sm leading-6 text-[color:var(--color-muted-foreground)]">Jede Eigentümergemeinschaft arbeitet getrennt und mit eigenen Konten.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Scale className="mt-0.5 size-5 shrink-0 text-[color:var(--color-ai-violet)]" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold">Ehrlich auf das Wesentliche fokussiert</h2>
              <p className="mt-1 text-sm leading-6 text-[color:var(--color-muted-foreground)]">Keine Bankanbindung, keine Jahresabrechnung und keine Rechtsberatung im ersten Release.</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
