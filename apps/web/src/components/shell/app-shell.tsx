"use client";

import {
  BriefcaseBusiness,
  Building2,
  Gauge,
  LogOut,
  Settings,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/modules/settings/actions";

type LinkHref = React.ComponentProps<typeof Link>["href"];

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: Gauge },
  { label: "Vorgänge", href: "/vorgaenge", icon: BriefcaseBusiness },
  { label: "WEGs", href: "/wegs", icon: Building2 },
  { label: "Audit", href: "/audit", icon: ShieldCheck },
  { label: "Einstellungen", href: "/einstellungen", icon: Settings },
] as const;

const getUserInitial = (email: string) =>
  email.trim().charAt(0).toUpperCase() || "N";

interface AppShellProps {
  userEmail: string;
  children: React.ReactNode;
}

export default function AppShell({ userEmail, children }: AppShellProps) {
  const pathname = usePathname();
  const userInitial = getUserInitial(userEmail);

  const isActive = (href: string) =>
    href === "/dashboard"
      ? pathname === "/dashboard" || pathname === "/"
      : pathname === href || pathname.startsWith(href + "/");

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,color-mix(in_oklch,var(--color-secondary)_58%,transparent),var(--color-background)_18rem)]">
      <header className="sticky top-0 z-30 border-b border-[color:var(--color-border)] bg-[color:var(--color-background)]/92 shadow-sm backdrop-blur md:hidden">
        <div className="flex min-h-16 items-center justify-between gap-3 px-4">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-foreground)] text-xs font-semibold text-[color:var(--color-background)] shadow-sm"
              aria-hidden="true"
            >
              W
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold tracking-normal text-[color:var(--color-foreground)]">
                WEG-Verwaltung
              </span>
              <span className="block truncate text-[11px] font-medium text-[color:var(--color-muted-foreground)]">
                Arbeitsbereich
              </span>
            </span>
          </Link>
          <div className="hidden min-w-0 flex-1 items-center justify-end gap-2 min-[430px]:flex">
            <span
              className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[color:var(--color-secondary)] text-[11px] font-semibold text-[color:var(--color-foreground)]"
              aria-hidden="true"
            >
              {userInitial}
            </span>
            <p
              className="max-w-[30vw] truncate text-xs text-[color:var(--color-muted-foreground)]"
              title={userEmail}
            >
              {userEmail}
            </p>
          </div>
          <form action={logoutAction} className="shrink-0">
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              className="border border-[color:var(--color-border)] bg-[color:var(--color-background)]/70 shadow-sm"
              aria-label="Abmelden"
              title="Abmelden"
            >
              <LogOut className="size-4" aria-hidden="true" />
            </Button>
          </form>
        </div>
        <nav
          aria-label="Hauptnavigation mobil"
          className="flex gap-1.5 overflow-x-auto px-3 pb-3"
        >
          {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
            const active = isActive(href);

            return (
              <Link
                key={href}
                href={href as LinkHref}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-9 shrink-0 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors",
                  active
                    ? "border-[color:var(--color-primary)]/30 bg-[color:var(--color-primary)] text-[color:var(--color-primary-foreground)] shadow-sm"
                    : "border-transparent text-[color:var(--color-muted-foreground)] hover:border-[color:var(--color-border)] hover:bg-[color:var(--color-secondary)] hover:text-[color:var(--color-foreground)]",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </nav>
      </header>

      <div className="flex min-h-screen">
        <aside className="hidden w-72 shrink-0 flex-col border-r border-[color:var(--color-border)] bg-[color:var(--color-background)]/94 shadow-[1px_0_0_color-mix(in_oklch,var(--color-border)_70%,transparent)] backdrop-blur md:flex">
          <div className="border-b border-[color:var(--color-border)] p-4">
            <Link
              href="/dashboard"
              className="flex items-center gap-3 rounded-lg border border-[color:var(--color-border)] bg-[linear-gradient(135deg,color-mix(in_oklch,var(--color-secondary)_72%,transparent),var(--color-background))] p-3 shadow-sm transition-colors hover:border-[color:var(--color-primary)]/25"
            >
              <span
                className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[color:var(--color-foreground)] text-sm font-semibold text-[color:var(--color-background)]"
                aria-hidden="true"
              >
                W
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold tracking-normal text-[color:var(--color-foreground)]">
                  WEG-Verwaltung
                </span>
                <span className="mt-0.5 block truncate text-xs font-medium text-[color:var(--color-muted-foreground)]">
                  Verwaltungsarbeitsplatz
                </span>
              </span>
            </Link>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] font-medium text-[color:var(--color-muted-foreground)]">
              <div className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-background)]/70 px-2.5 py-2">
                <span className="block text-[color:var(--color-foreground)]">
                  Mandant
                </span>
                <span className="mt-0.5 block truncate">isoliert</span>
              </div>
              <div className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-background)]/70 px-2.5 py-2">
                <span className="block text-[color:var(--color-foreground)]">
                  KI
                </span>
                <span className="mt-0.5 block truncate">Vorschlag</span>
              </div>
            </div>
          </div>

          <nav
            aria-label="Hauptnavigation"
            className="flex-1 space-y-1.5 px-3 py-4"
          >
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase text-[color:var(--color-muted-foreground)]">
              Navigation
            </p>
            {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
              const active = isActive(href);

              return (
                <Link
                  key={href}
                  href={href as LinkHref}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex min-h-11 items-center gap-3 rounded-lg border px-3 text-sm font-medium transition-colors",
                    active
                      ? "border-[color:var(--color-primary)]/25 bg-[linear-gradient(135deg,var(--color-primary),color-mix(in_oklch,var(--color-primary)_82%,var(--color-foreground)))] text-[color:var(--color-primary-foreground)] shadow-sm"
                      : "border-transparent text-[color:var(--color-muted-foreground)] hover:border-[color:var(--color-border)] hover:bg-[color:var(--color-secondary)] hover:text-[color:var(--color-foreground)]",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-md transition-colors",
                      active
                        ? "bg-[color:var(--color-primary-foreground)]/15"
                        : "bg-[color:var(--color-background)] text-[color:var(--color-muted-foreground)] group-hover:text-[color:var(--color-foreground)]",
                    )}
                    aria-hidden="true"
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  {active ? (
                    <span
                      className="size-1.5 rounded-full bg-[color:var(--color-primary-foreground)]/90"
                      aria-hidden="true"
                    />
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-[color:var(--color-border)] p-4">
            <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-secondary)]/35 p-3">
              <div className="flex items-center gap-3">
                <span
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-background)] text-xs font-semibold text-[color:var(--color-foreground)]"
                  aria-hidden="true"
                >
                  {userInitial}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[color:var(--color-foreground)]">
                    Angemeldet
                  </p>
                  <p
                    className="mt-0.5 truncate text-xs text-[color:var(--color-muted-foreground)]"
                    title={userEmail}
                  >
                    {userEmail}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-background)]/70 px-2.5 py-2 text-xs text-[color:var(--color-muted-foreground)]">
                <span
                  className="size-2 rounded-full bg-[color:var(--color-primary)]"
                  aria-hidden="true"
                />
                <span className="truncate">Sitzung aktiv</span>
              </div>
            </div>
            <form action={logoutAction} className="mt-3">
              <Button
                type="submit"
                variant="outline"
                size="sm"
                className="w-full justify-start bg-[color:var(--color-background)]/80"
              >
                <LogOut className="size-4" aria-hidden="true" />
                Abmelden
              </Button>
            </form>
          </div>
        </aside>

        <main id="main" className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
