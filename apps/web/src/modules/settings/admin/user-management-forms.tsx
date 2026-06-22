"use client";

import { useActionState } from "react";

import {
  inviteTenantUserAction,
  updateTenantUserRoleAction,
} from "@/modules/settings/admin/actions";
import {
  TENANT_MEMBER_ROLES,
  TENANT_MEMBER_ROLE_LABELS,
  type AdminUserActionState,
  type TenantMemberRole,
} from "@/modules/settings/admin/types";
import { Button } from "@/components/ui/button";

const initialState: AdminUserActionState = {};

function ActionMessage({
  id,
  state,
}: {
  id: string;
  state: AdminUserActionState;
}) {
  if (!state.message) return null;

  const isError = state.status === "error";
  return (
    <p
      id={id}
      role={isError ? "alert" : "status"}
      className={
        isError
          ? "rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
          : "rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
      }
    >
      {state.message}
    </p>
  );
}

function RoleOptions() {
  return (
    <>
      {TENANT_MEMBER_ROLES.map((role) => (
        <option key={role} value={role}>
          {TENANT_MEMBER_ROLE_LABELS[role]}
        </option>
      ))}
    </>
  );
}

export function InviteTenantUserForm({ disabled }: { disabled: boolean }) {
  const [state, formAction, isPending] = useActionState(
    inviteTenantUserAction,
    initialState,
  );
  const isDisabled = disabled || isPending;
  const messageId = "tenant-user-invite-message";

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_14rem_auto] md:items-end">
        <div className="space-y-1">
          <label htmlFor="tenant-user-email" className="block text-sm font-medium">
            E-Mail
          </label>
          <input
            id="tenant-user-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            maxLength={320}
            disabled={isDisabled}
            aria-invalid={state.fieldErrors?.email ? true : undefined}
            aria-describedby={
              state.fieldErrors?.email ? "tenant-user-email-error" : undefined
            }
            className="w-full rounded-md border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm disabled:opacity-60"
          />
          {state.fieldErrors?.email ? (
            <p
              id="tenant-user-email-error"
              role="alert"
              className="text-sm text-red-600 dark:text-red-400"
            >
              {state.fieldErrors.email}
            </p>
          ) : null}
        </div>

        <div className="space-y-1">
          <label htmlFor="tenant-user-role" className="block text-sm font-medium">
            Rolle
          </label>
          <select
            id="tenant-user-role"
            name="role"
            defaultValue="verwalter_mitarbeiter"
            disabled={isDisabled}
            aria-invalid={state.fieldErrors?.role ? true : undefined}
            aria-describedby={
              state.fieldErrors?.role ? "tenant-user-role-error" : undefined
            }
            className="w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-background)] px-3 py-2 text-sm disabled:opacity-60"
          >
            <RoleOptions />
          </select>
          {state.fieldErrors?.role ? (
            <p
              id="tenant-user-role-error"
              role="alert"
              className="text-sm text-red-600 dark:text-red-400"
            >
              {state.fieldErrors.role}
            </p>
          ) : null}
        </div>

        <Button
          type="submit"
          disabled={isDisabled}
          aria-busy={isPending}
          aria-describedby={state.message ? messageId : undefined}
        >
          {isPending ? "Einladen ..." : "Einladen"}
        </Button>
      </div>

      <ActionMessage id={messageId} state={state} />
    </form>
  );
}

export function UpdateTenantUserRoleForm({
  memberId,
  currentRole,
  disabled,
}: {
  memberId: string;
  currentRole: TenantMemberRole;
  disabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    updateTenantUserRoleAction,
    initialState,
  );
  const isDisabled = disabled || isPending;
  const messageId = `tenant-user-role-message-${memberId}`;

  return (
    <form
      action={formAction}
      className="flex flex-col gap-2 sm:flex-row sm:items-start"
      noValidate
    >
      <input type="hidden" name="memberId" value={memberId} />
      <div className="min-w-0 flex-1 space-y-1">
        <label htmlFor={`tenant-user-role-${memberId}`} className="sr-only">
          Rolle ändern
        </label>
        <select
          id={`tenant-user-role-${memberId}`}
          name="role"
          defaultValue={currentRole}
          disabled={isDisabled}
          aria-invalid={state.fieldErrors?.role ? true : undefined}
          aria-describedby={
            state.fieldErrors?.role ? `tenant-user-role-error-${memberId}` : undefined
          }
          className="w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-background)] px-3 py-2 text-sm disabled:opacity-60"
        >
          <RoleOptions />
        </select>
        {state.fieldErrors?.role ? (
          <p
            id={`tenant-user-role-error-${memberId}`}
            role="alert"
            className="text-sm text-red-600 dark:text-red-400"
          >
            {state.fieldErrors.role}
          </p>
        ) : null}
      </div>
      <Button
        type="submit"
        variant="outline"
        disabled={isDisabled}
        aria-busy={isPending}
        aria-describedby={state.message ? messageId : undefined}
      >
        {isPending ? "Speichern ..." : "Speichern"}
      </Button>
      <ActionMessage id={messageId} state={state} />
    </form>
  );
}
