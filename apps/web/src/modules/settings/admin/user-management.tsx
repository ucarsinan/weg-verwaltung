import { MailPlus, ShieldAlert, UserRound, UsersRound } from "lucide-react";

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  SettingsOverviewData,
  SettingsTenantMember,
} from "@/modules/settings/data";
import {
  TENANT_MEMBER_ROLE_LABELS,
  isTenantMemberRole,
  type TenantMemberRole,
} from "@/modules/settings/admin/types";
import {
  InviteTenantUserForm,
  UpdateTenantUserRoleForm,
} from "@/modules/settings/admin/user-management-forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { EntityList, EntityListItem } from "@/components/ui/entity-list";
import { StatusBadge } from "@/components/ui/status-badge";

const ADMIN_ENV_CAVEAT =
  "Aktionen deaktiviert: SUPABASE_SERVICE_ROLE_KEY oder SUPABASE_SECRET_KEY fehlt im Server-Environment.";

function formatDateTime(value: string | null): string {
  if (!value) return "Nicht verfügbar";
  return new Date(value).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRole(role: string | null): string {
  if (!role) return "Nicht verfügbar";
  return isTenantMemberRole(role) ? TENANT_MEMBER_ROLE_LABELS[role] : role;
}

function personName(member: SettingsTenantMember): string {
  if (!member.person) return "Keine Person verknüpft";
  return `${member.person.vorname} ${member.person.nachname}`.trim();
}

function roleOrFallback(role: string): TenantMemberRole {
  return isTenantMemberRole(role) ? role : "verwalter_mitarbeiter";
}

function MemberItem({
  member,
  currentUserId,
  adminCount,
  actionsEnabled,
}: {
  member: SettingsTenantMember;
  currentUserId: string;
  adminCount: number;
  actionsEnabled: boolean;
}) {
  const displayName = personName(member);
  const memberEmail = member.person?.email ?? null;
  const role = roleOrFallback(member.role);
  const isCurrentUser = member.userId === currentUserId;
  const isLastAdmin = member.role === "tenant_admin" && adminCount <= 1;
  const protectedReason = isCurrentUser
    ? "Eigene Admin-Rolle geschützt"
    : isLastAdmin
      ? "Letzter Admin geschützt"
      : null;

  return (
    <EntityListItem
      title={displayName}
      description={memberEmail ?? member.userId}
      leading={<UserRound />}
      badges={<StatusBadge variant="neutral">{formatRole(member.role)}</StatusBadge>}
      meta={
        <>
          <span>Benutzer-ID: {member.userId}</span>
          <span>Seit {formatDateTime(member.createdAt)}</span>
        </>
      }
      actions={
        protectedReason ? (
          <span className="text-xs font-medium text-[color:var(--color-muted-foreground)]">
            {protectedReason}
          </span>
        ) : (
          <UpdateTenantUserRoleForm
            memberId={member.id}
            currentRole={role}
            disabled={!actionsEnabled}
          />
        )
      }
    />
  );
}

export function AdminUserManagement({
  data,
}: {
  data: SettingsOverviewData;
}) {
  const { account, tenantMembers, isTenantAdmin } = data;
  const actionsEnabled = isTenantAdmin && Boolean(createAdminClient());
  const adminCount = tenantMembers.filter(
    (member) => member.role === "tenant_admin",
  ).length;

  if (!isTenantAdmin) {
    return (
      <EmptyState
        icon={<UsersRound />}
        title="Nur für Mandanten-Admins"
        description="Ihr aktueller JWT-Claim enthält keine tenant_admin-Rolle."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MailPlus aria-hidden="true" className="size-5" />
            Benutzer einladen
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!actionsEnabled ? (
            <p
              role="alert"
              className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
            >
              {ADMIN_ENV_CAVEAT}
            </p>
          ) : null}
          <InviteTenantUserForm disabled={!actionsEnabled} />
        </CardContent>
      </Card>

      {tenantMembers.length > 0 ? (
        <EntityList aria-label="Benutzer und Rollen">
          {tenantMembers.map((member) => (
            <MemberItem
              key={member.id}
              member={member}
              currentUserId={account.id}
              adminCount={adminCount}
              actionsEnabled={actionsEnabled}
            />
          ))}
        </EntityList>
      ) : (
        <EmptyState
          icon={<ShieldAlert />}
          title="Keine Mitglieder sichtbar"
          description="Für diesen Mandanten wurden keine Mitgliedschaften gefunden."
        />
      )}
    </div>
  );
}
