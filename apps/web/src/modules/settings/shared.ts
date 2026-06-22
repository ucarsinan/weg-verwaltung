export const ROLE_OPTIONS = [
  "tenant_admin",
  "verwalter_mitarbeiter",
  "beirat",
  "eigentuemer",
] as const;

export type TenantRole = (typeof ROLE_OPTIONS)[number];

export const ROLE_LABELS: Record<TenantRole, string> = {
  tenant_admin: "Mandanten-Admin",
  verwalter_mitarbeiter: "Verwalter-Mitarbeiter",
  beirat: "Beirat",
  eigentuemer: "Eigentümer",
};

export function formatRole(role: string | null): string {
  if (!role) return "Nicht verfügbar";
  return ROLE_LABELS[role as TenantRole] ?? role;
}

export function normalizeOptionalText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text === "" ? null : text;
}

export function normalizeRequiredText(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

export function isValidRole(value: string): value is TenantRole {
  return ROLE_OPTIONS.includes(value as TenantRole);
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
