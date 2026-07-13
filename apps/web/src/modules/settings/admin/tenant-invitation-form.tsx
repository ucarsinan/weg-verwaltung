"use client";

import { useActionState, useState } from "react";

import { createTenantInvitationAction } from "@/modules/settings/admin/invitation-actions";
import {
  TENANT_INVITATION_ROLES,
  TENANT_MEMBER_ROLE_LABELS,
  type TenantInvitationState,
} from "@/modules/settings/admin/types";
import { Button } from "@/components/ui/button";

const initialState: TenantInvitationState = {};

function InvitationRoleOptions() {
  return (
    <>
      {TENANT_INVITATION_ROLES.map((role) => (
        <option key={role} value={role}>
          {TENANT_MEMBER_ROLE_LABELS[role]}
        </option>
      ))}
    </>
  );
}

function InvitationLinkOutput({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard-API kann in manchen Kontexten fehlen; Nutzer kann den Link manuell markieren.
    }
  }

  return (
    <div className="space-y-1">
      <label htmlFor="invitation-link" className="block text-sm font-medium">
        Einladungslink
      </label>
      <div className="flex gap-2">
        <input
          id="invitation-link"
          type="text"
          readOnly
          value={url}
          onFocus={(event) => event.target.select()}
          className="w-full flex-1 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-background)] px-3 py-2 text-sm"
        />
        {typeof navigator !== "undefined" && navigator.clipboard ? (
          <Button type="button" variant="outline" onClick={handleCopy}>
            {copied ? "Kopiert!" : "Kopieren"}
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-[color:var(--color-muted-foreground)]">
        Link als Fallback — nutzen Sie ihn, falls die E-Mail nicht ankommt oder der
        Versand nicht konfiguriert ist.
      </p>
    </div>
  );
}

export function TenantInvitationForm({ disabled }: { disabled: boolean }) {
  const [state, formAction, isPending] = useActionState(
    createTenantInvitationAction,
    initialState,
  );
  const isDisabled = disabled || isPending;
  const messageId = "tenant-invitation-message";

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_14rem_auto] md:items-end">
        <div className="space-y-1">
          <label htmlFor="tenant-invitation-email" className="block text-sm font-medium">
            E-Mail
          </label>
          <input
            id="tenant-invitation-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            maxLength={320}
            disabled={isDisabled}
            aria-invalid={state.fieldErrors?.email ? true : undefined}
            aria-describedby={
              state.fieldErrors?.email ? "tenant-invitation-email-error" : undefined
            }
            className="w-full rounded-md border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm disabled:opacity-60"
          />
          {state.fieldErrors?.email ? (
            <p
              id="tenant-invitation-email-error"
              role="alert"
              className="text-sm text-red-600 dark:text-red-400"
            >
              {state.fieldErrors.email}
            </p>
          ) : null}
        </div>

        <div className="space-y-1">
          <label htmlFor="tenant-invitation-role" className="block text-sm font-medium">
            Rolle
          </label>
          <select
            id="tenant-invitation-role"
            name="role"
            defaultValue="eigentuemer"
            disabled={isDisabled}
            aria-invalid={state.fieldErrors?.role ? true : undefined}
            aria-describedby={
              state.fieldErrors?.role ? "tenant-invitation-role-error" : undefined
            }
            className="w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-background)] px-3 py-2 text-sm disabled:opacity-60"
          >
            <InvitationRoleOptions />
          </select>
          {state.fieldErrors?.role ? (
            <p
              id="tenant-invitation-role-error"
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
          {isPending ? "Link erstellen ..." : "Link erstellen"}
        </Button>
      </div>

      {state.message ? (
        <p
          id={messageId}
          role={state.status === "error" ? "alert" : "status"}
          className={
            state.status === "error"
              ? "rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
              : "rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
          }
        >
          {state.message}
        </p>
      ) : null}

      {state.status === "success" && state.invitationUrl ? (
        <InvitationLinkOutput url={state.invitationUrl} />
      ) : null}
    </form>
  );
}
