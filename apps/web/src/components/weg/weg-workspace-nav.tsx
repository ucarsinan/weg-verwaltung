"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Banknote,
  Building2,
  CalendarClock,
  FileText,
  Home,
  LayoutDashboard,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";

interface WegWorkspaceNavProps {
  wegId: string;
  wegName: string;
  wegAddress?: string | null;
}

const sectionItems = [
  { label: "Einheiten", hash: "wohneinheiten", icon: Home },
  { label: "Personen", hash: "personen", icon: Users },
  {
    label: "Versammlungen",
    hash: "versammlungen",
    icon: CalendarClock,
  },
] as const;

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export function WegWorkspaceNav({
  wegId,
  wegName,
  wegAddress,
}: WegWorkspaceNavProps) {
  const pathname = usePathname();

  const routeItems = [
    {
      label: "Übersicht",
      href: `/wegs/${wegId}`,
      icon: LayoutDashboard,
      exact: true,
    },
    {
      label: "Beschlüsse",
      href: `/wegs/${wegId}/beschluss-sammlung`,
      icon: FileText,
      exact: false,
    },
    {
      label: "Finanzen",
      href: `/wegs/${wegId}/finanzen`,
      icon: Banknote,
      exact: false,
    },
  ] as const;

  return (
    <section
      aria-label={`WEG-Arbeitsbereich ${wegName}`}
      className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-card)] shadow-sm"
    >
      <div className="flex flex-col gap-3 border-b border-[color:var(--color-border)] px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[color:var(--color-secondary)] text-[color:var(--color-foreground)]"
            aria-hidden="true"
          >
            <Building2 className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase text-[color:var(--color-muted-foreground)]">
              WEG-Arbeitsbereich
            </p>
            <p className="truncate text-sm font-semibold text-[color:var(--color-foreground)]">
              {wegName}
            </p>
          </div>
        </div>
        <p className="whitespace-pre-line text-sm text-[color:var(--color-muted-foreground)]">
          {wegAddress ??
            "Eigene Einheit mit Stammdaten, Eigentümern, Versammlungen und Beschlüssen."}
        </p>
      </div>

      <nav
        aria-label="WEG-Navigation"
        className="flex gap-1 overflow-x-auto px-3 py-3"
      >
        {routeItems.map(({ label, href, icon: Icon, exact }) => {
          const active = exact ? pathname === href : isActivePath(pathname, href);

          return (
            <Link
              key={href}
              href={{ pathname: href }}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-9 shrink-0 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors",
                active
                  ? "border-[color:var(--color-primary)]/25 bg-[color:var(--color-primary)] text-[color:var(--color-primary-foreground)] shadow-sm"
                  : "border-transparent text-[color:var(--color-muted-foreground)] hover:border-[color:var(--color-border)] hover:bg-[color:var(--color-secondary)] hover:text-[color:var(--color-foreground)]",
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </Link>
          );
        })}

        <span
          aria-hidden="true"
          className="mx-1 min-h-9 border-l border-[color:var(--color-border)]"
        />

        {sectionItems.map(({ label, hash, icon: Icon }) => {
          const href = `/wegs/${wegId}#${hash}`;

          return (
            <Link
              key={href}
              href={{ pathname: `/wegs/${wegId}`, hash }}
              className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-md border border-transparent px-3 text-sm font-medium text-[color:var(--color-muted-foreground)] transition-colors hover:border-[color:var(--color-border)] hover:bg-[color:var(--color-secondary)] hover:text-[color:var(--color-foreground)]"
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </Link>
          );
        })}
      </nav>
    </section>
  );
}
