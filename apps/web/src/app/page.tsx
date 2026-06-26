import {
  ArrowRight,
  Bot,
  Building2,
  CheckCircle2,
  FileText,
  LockKeyhole,
  Scale,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

const portfolioSignals = [
  "Mandantenisolierung per RLS",
  "KI nur als Vorschlag",
  "Append-only Beschlusssammlung",
];

const operatingMetrics = [
  { label: "WEGs", value: "42", tone: "text-[color:var(--color-foreground)]" },
  {
    label: "offene Vorgänge",
    value: "18",
    tone: "text-amber-700 dark:text-amber-300",
  },
  {
    label: "KI-Prüfungen",
    value: "31",
    tone: "text-[color:var(--color-ai-violet)]",
  },
];

const modules = [
  {
    icon: Building2,
    title: "Objekte & Eigentum",
    text: "WEGs, Einheiten und historische Eigentümerschaften bleiben sauber getrennt.",
  },
  {
    icon: FileText,
    title: "Dokumente & Vorgänge",
    text: "Eingang, Review und Beschlussbezug werden als nachvollziehbarer Arbeitsfluss geführt.",
  },
  {
    icon: Scale,
    title: "Versammlung & Beschluss",
    text: "TOPs, Abstimmungen und Beschlusssammlung folgen dem rechtlichen Arbeitsmodell.",
  },
];

const reviewItems = [
  { label: "Einladung prüfen", status: "bereit", icon: CheckCircle2 },
  { label: "TOP 04 Beschlussvorschlag", status: "KI-Vorschlag", icon: Bot },
  { label: "Audit-Export vorbereiten", status: "gesichert", icon: ShieldCheck },
];

export default function LandingPage() {
  return (
    <main
      id="main"
      className="min-h-screen w-full max-w-full overflow-x-hidden bg-[color:var(--color-background)] text-[color:var(--color-foreground)]"
    >
      <section className="relative w-full max-w-full overflow-x-hidden border-b border-[color:var(--color-border)]">
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,color-mix(in_oklch,var(--color-secondary)_88%,transparent),transparent_44%),linear-gradient(135deg,color-mix(in_oklch,var(--color-accent-calm)_10%,transparent),transparent_62%)]" />
        <div className="mx-auto flex min-h-[82vh] w-full max-w-7xl min-w-0 flex-col px-6 py-6 sm:px-8 lg:px-10">
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
            <Button asChild variant="outline" className="hidden sm:inline-flex">
              <Link href="/login">Anmelden</Link>
            </Button>
          </header>

          <div className="grid w-full max-w-full min-w-0 flex-1 items-center gap-12 py-14 lg:grid-cols-[minmax(0,1fr)_minmax(430px,0.86fr)] lg:py-10">
            <div className="w-full max-w-xs min-w-0 sm:max-w-3xl">
              <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-card)] px-3 py-1 text-xs font-medium text-[color:var(--color-muted-foreground)] shadow-sm">
                <Sparkles className="size-3.5 text-[color:var(--color-ai-violet)]" aria-hidden="true" />
                <span className="min-w-0 truncate">
                  Portfolio-Projekt für professionelle Hausverwaltung
                </span>
              </div>
              <h1 className="mt-6 max-w-4xl break-words text-4xl font-semibold leading-tight tracking-normal text-balance sm:text-6xl lg:text-7xl">
                WEG-Verwaltung
              </h1>
              <p className="mt-6 max-w-full break-words text-lg leading-8 text-[color:var(--color-muted-foreground)] sm:max-w-2xl sm:text-xl">
                Eine operative SaaS-Oberfläche für Wohnungseigentümergemeinschaften:
                mandantensicher, KI-unterstützt und auf rechtlich
                nachvollziehbare Abläufe ausgelegt.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="h-11 px-5">
                  <Link href="/login">
                    Zur Anmeldung
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="h-11 px-5">
                  <Link href="/login?next=/dashboard">Arbeitsplatz öffnen</Link>
                </Button>
              </div>

              <div className="mt-8 flex flex-wrap gap-2">
                {portfolioSignals.map((signal) => (
                  <span
                    key={signal}
                    className="inline-flex max-w-full min-h-8 items-center gap-2 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-card)] px-3 text-xs font-medium text-[color:var(--color-muted-foreground)] shadow-sm"
                  >
                    <ShieldCheck className="size-3.5 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
                    <span className="min-w-0 truncate">{signal}</span>
                  </span>
                ))}
              </div>
            </div>

            <div className="relative w-full max-w-xs min-w-0 sm:max-w-full">
              <div className="max-w-full overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-card)] shadow-2xl shadow-black/10 dark:shadow-black/35">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--color-border)] px-5 py-4">
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase text-[color:var(--color-muted-foreground)]">
                      Betriebszentrale
                    </p>
                    <p className="mt-1 truncate text-sm font-semibold">
                      Hausverwaltung Rhein-Main
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    RLS aktiv
                  </span>
                </div>

                <div className="grid gap-px bg-[color:var(--color-border)] sm:grid-cols-3">
                  {operatingMetrics.map((metric) => (
                    <div
                      key={metric.label}
                      className="bg-[color:var(--color-card)] px-5 py-4"
                    >
                      <p className="text-xs text-[color:var(--color-muted-foreground)]">
                        {metric.label}
                      </p>
                      <p className={`mt-2 text-3xl font-semibold tracking-normal ${metric.tone}`}>
                        {metric.value}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="grid gap-5 p-5 lg:grid-cols-[1fr_0.82fr]">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-semibold">Review-Queue</h2>
                      <span className="text-xs text-[color:var(--color-muted-foreground)]">
                        heute
                      </span>
                    </div>
                    <div className="space-y-2">
                      {reviewItems.map((item) => {
                        const Icon = item.icon;
                        return (
                          <div
                            key={item.label}
                            className="flex min-h-14 items-center justify-between gap-3 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-background)] px-3 py-2"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[color:var(--color-secondary)]">
                                <Icon className="size-4" aria-hidden="true" />
                              </span>
                              <span className="min-w-0 truncate text-sm font-medium">
                                {item.label}
                              </span>
                            </div>
                            <span className="max-w-24 shrink-0 truncate rounded-full border border-[color:var(--color-border)] px-2 py-0.5 text-xs text-[color:var(--color-muted-foreground)] sm:max-w-none">
                              {item.status}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-lg border border-[color:var(--color-border)] bg-[linear-gradient(160deg,color-mix(in_oklch,var(--color-secondary)_82%,transparent),transparent)] p-4">
                    <div className="flex items-center gap-2">
                      <LockKeyhole className="size-4 text-[color:var(--color-ai-violet)]" aria-hidden="true" />
                      <h2 className="text-sm font-semibold">Governance</h2>
                    </div>
                    <dl className="mt-5 space-y-4">
                      <div>
                        <dt className="text-xs text-[color:var(--color-muted-foreground)]">
                          Stimmenmodell
                        </dt>
                        <dd className="mt-1 text-sm font-medium">
                          Eigentum statt Person
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-[color:var(--color-muted-foreground)]">
                          KI-Berechtigung
                        </dt>
                        <dd className="mt-1 text-sm font-medium">
                          Vorschläge ohne Schreibrecht
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-[color:var(--color-muted-foreground)]">
                          Audit
                        </dt>
                        <dd className="mt-1 text-sm font-medium">
                          unveränderbare Ereignisse
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-4 px-6 py-10 sm:px-8 md:grid-cols-3 lg:px-10">
        {modules.map((module) => {
          const Icon = module.icon;
          return (
            <article
              key={module.title}
              className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-5 shadow-sm"
            >
              <div className="flex size-10 items-center justify-center rounded-lg bg-[color:var(--color-secondary)]">
                <Icon className="size-5" aria-hidden="true" />
              </div>
              <h2 className="mt-5 text-base font-semibold">{module.title}</h2>
              <p className="mt-2 text-sm leading-6 text-[color:var(--color-muted-foreground)]">
                {module.text}
              </p>
            </article>
          );
        })}
      </section>
    </main>
  );
}
