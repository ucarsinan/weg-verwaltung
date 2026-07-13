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

export const TENANT_INVITATION_ROLES = ["tenant_admin", "eigentuemer"] as const;

export type TenantInvitationRole = (typeof TENANT_INVITATION_ROLES)[number];

export function isTenantInvitationRole(
  value: unknown,
): value is TenantInvitationRole {
  return (
    typeof value === "string" &&
    TENANT_INVITATION_ROLES.includes(value as TenantInvitationRole)
  );
}

export interface TenantInvitationState {
  status?: "success" | "error";
  message?: string;
  invitationUrl?: string;
  fieldErrors?: {
    email?: string;
    role?: string;
  };
}
