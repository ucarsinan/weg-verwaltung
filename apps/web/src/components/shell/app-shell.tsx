"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "WEGs", href: "/wegs" },
] as const;

interface AppShellProps {
  userEmail: string;
  children: React.ReactNode;
}

export default function AppShell({ userEmail, children }: AppShellProps) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen">
      {/* Sidebar — hidden on mobile, fixed 240 px on desktop */}
      <aside className="hidden md:flex md:w-60 md:shrink-0 md:flex-col border-r border-[var(--color-border)] bg-[var(--color-bg)]">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-[var(--color-border)]">
          <span className="text-sm font-semibold tracking-tight text-[var(--color-fg)]">
            WEG-Verwaltung
          </span>
        </div>

        {/* Nav */}
        <nav aria-label="Hauptnavigation" className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map(({ label, href }) => {
            const isActive =
              href === "/dashboard"
                ? pathname === "/dashboard" || pathname === "/"
                : pathname === href || pathname.startsWith(href + "/");

            return (
              <Link
                key={href}
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={[
                  "flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-[var(--color-accent)] text-white"
                    : "text-[var(--color-muted)] hover:bg-[var(--color-border)] hover:text-[var(--color-fg)]",
                ].join(" ")}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="px-5 py-4 border-t border-[var(--color-border)]">
          <p className="truncate text-xs text-[var(--color-muted)]" title={userEmail}>
            {userEmail}
          </p>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {children}
      </div>
    </div>
  );
}
