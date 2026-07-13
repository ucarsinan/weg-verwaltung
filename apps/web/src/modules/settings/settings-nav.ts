import {
  Building2,
  IdCard,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react";

export interface SettingsNavItem {
  label: string;
  href: string;
  icon: typeof UserRound;
}

// Single source of truth for the Einstellungen sub-navigation, shared by the
// app shell (sidebar/mobile nav) and the settings layout.
export const SETTINGS_SUBNAV: readonly SettingsNavItem[] = [
  { label: "Konto", href: "/einstellungen/konto", icon: UserRound },
  { label: "Person", href: "/einstellungen/person", icon: IdCard },
  { label: "Mandant", href: "/einstellungen/mandant", icon: Building2 },
  { label: "Sicherheit", href: "/einstellungen/sicherheit", icon: ShieldCheck },
  { label: "Mitglieder & Rollen", href: "/einstellungen/mitglieder", icon: UsersRound },
] as const;
