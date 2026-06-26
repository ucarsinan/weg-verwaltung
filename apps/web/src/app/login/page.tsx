import {
  Bot,
  Building2,
  CheckCircle2,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";

import { LoginForm } from "./login-form";

export const metadata = {
  title: "Anmelden — WEG-Verwaltung",
};

interface LoginPageProps {
  searchParams: Promise<{ next?: string }>;
}

const assurances = [
  "Mandantenisolierte Sitzungen",
  "KI-Aktionen bleiben prüfpflichtig",
  "Audit-Trail ohne Löschpfad",
];

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { next } = await searchParams;
  const nextPath = next && next.startsWith("/") ? next : "/dashboard";

  return (
    <main
      id="main"
      className="min-h-screen w-full max-w-full overflow-x-hidden bg-[color:var(--color-background)] text-[color:var(--color-foreground)]"
    >
      <div className="mx-auto grid min-h-screen w-full max-w-7xl min-w-0 lg:grid-cols-[minmax(0,0.95fr)_minmax(420px,0.72fr)]">
        <section className="relative hidden overflow-hidden border-r border-[color:var(--color-border)] px-10 py-8 lg:flex lg:flex-col">
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,color-mix(in_oklch,var(--color-secondary)_90%,transparent),transparent_48%),linear-gradient(145deg,color-mix(in_oklch,var(--color-accent-calm)_9%,transparent),transparent_68%)]" />
          <Link
            href="/"
            className="inline-flex w-fit items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-background)]"
          >
            <span className="flex size-9 items-center justify-center rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-card)] shadow-sm">
              <Building2 className="size-4" aria-hidden="true" />
            </span>
            <span className="text-sm font-semibold tracking-normal">
              WEG-Verwaltung
            </span>
          </Link>

          <div className="flex flex-1 flex-col justify-center">
            <div className="max-w-xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-card)] px-3 py-1 text-xs font-medium text-[color:var(--color-muted-foreground)] shadow-sm">
                <LockKeyhole className="size-3.5 text-[color:var(--color-ai-violet)]" aria-hidden="true" />
                Gesicherter Arbeitsplatz
              </div>
              <h1 className="mt-6 text-5xl font-semibold tracking-normal text-balance">
                Verwaltungsarbeit mit klarer Verantwortung.
              </h1>
              <p className="mt-5 text-lg leading-8 text-[color:var(--color-muted-foreground)]">
                Eigentum, Beschlüsse, Dokumente und KI-Vorschläge laufen in
                einem kontrollierten Arbeitsraum zusammen.
              </p>
            </div>

            <div className="mt-10 grid max-w-2xl gap-3">
              {assurances.map((assurance) => (
                <div
                  key={assurance}
                  className="flex min-h-12 items-center gap-3 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-card)] px-4 shadow-sm"
                >
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
                  <span className="text-sm font-medium">{assurance}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-4 shadow-sm">
              <ShieldCheck className="size-5 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
              <p className="mt-4 text-sm font-semibold">Least Privilege</p>
              <p className="mt-1 text-xs leading-5 text-[color:var(--color-muted-foreground)]">
                Rollen und Mandantenrechte bleiben getrennt.
              </p>
            </div>
            <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-4 shadow-sm">
              <Bot className="size-5 text-[color:var(--color-ai-violet)]" aria-hidden="true" />
              <p className="mt-4 text-sm font-semibold">Human-in-the-loop</p>
              <p className="mt-1 text-xs leading-5 text-[color:var(--color-muted-foreground)]">
                Vorschläge werden geprüft, bevor sie wirksam werden.
              </p>
            </div>
          </div>
        </section>

        <section className="flex min-h-screen w-full max-w-full min-w-0 items-center justify-start px-6 py-10 sm:justify-center sm:px-8">
          <div className="w-full max-w-xs min-w-0 sm:max-w-md">
            <Link
              href="/"
              className="mb-10 inline-flex items-center gap-3 rounded-md lg:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-background)]"
            >
              <span className="flex size-9 items-center justify-center rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-card)] shadow-sm">
                <Building2 className="size-4" aria-hidden="true" />
              </span>
              <span className="text-sm font-semibold tracking-normal">
                WEG-Verwaltung
              </span>
            </Link>

            <div className="max-w-full overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-6 shadow-xl shadow-black/5 sm:p-8 dark:shadow-black/25">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[color:var(--color-muted-foreground)]">
                  Anmeldung
                </p>
                <h2 className="mt-2 break-words text-2xl font-semibold leading-tight tracking-normal sm:text-3xl">
                  Zugang zum Arbeitsbereich
                </h2>
                <p className="mt-3 text-sm leading-6 text-[color:var(--color-muted-foreground)]">
                  Melden Sie sich mit Ihrem WEG-Verwaltung-Konto an.
                </p>
              </div>

              <div className="mt-8">
                <LoginForm nextPath={nextPath} />
              </div>
            </div>

            <p className="mt-6 text-center text-xs leading-5 text-[color:var(--color-muted-foreground)]">
              Zugriff nur für berechtigte Verwaltungsnutzer. Sicherheitsereignisse
              werden im Audit-Trail erfasst.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
