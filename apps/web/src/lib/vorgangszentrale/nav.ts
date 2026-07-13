import { Bot, Inbox, ListChecks } from "lucide-react";

export interface VorgaengeNavItem {
  label: string;
  href: string;
  icon: typeof ListChecks;
}

// Single source of truth for the Vorgänge sub-navigation, shared by the app
// shell (sidebar/mobile nav). Mirrors modules/settings/settings-nav.ts.
export const VORGAENGE_SUBNAV: readonly VorgaengeNavItem[] = [
  { label: "Übersicht", href: "/vorgaenge", icon: ListChecks },
  { label: "Inbox", href: "/vorgaenge/inbox", icon: Inbox },
  { label: "Reviews", href: "/vorgaenge/reviews", icon: Bot },
] as const;
