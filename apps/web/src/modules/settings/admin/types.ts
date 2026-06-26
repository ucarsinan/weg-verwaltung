export const TENANT_MEMBER_ROLES = [
  "tenant_admin",
  "verwalter_mitarbeiter",
  "beirat",
  "eigentuemer",
] as const;

export type TenantMemberRole = (typeof TENANT_MEMBER_ROLES)[number];

export type AdminUserActionState = {
  status?: "success" | "error";
  message?: string;
  fieldErrors?: {
    email?: string;
    role?: string;
    memberId?: string;
  };
};

export const TENANT_MEMBER_ROLE_LABELS: Record<TenantMemberRole, string> = {
  tenant_admin: "Mandanten-Admin",
  verwalter_mitarbeiter: "Verwalter-Mitarbeiter",
  beirat: "Beirat",
  eigentuemer: "Eigentümer",
};

export function isTenantMemberRole(value: unknown): value is TenantMemberRole {
  return (
    typeof value === "string" &&
    TENANT_MEMBER_ROLES.includes(value as TenantMemberRole)
  );
}
