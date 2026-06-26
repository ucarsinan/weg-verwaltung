"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  sendPasswordResetAction,
  updatePasswordAction,
  type PasswordFormState,
  type PasswordResetState,
} from "@/modules/settings/security-actions";

const passwordInitialState: PasswordFormState = {};
const resetInitialState: PasswordResetState = {};

function SubmitButton({
  children,
  variant = "default",
}: {
  children: React.ReactNode;
  variant?: "default" | "outline";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending} aria-busy={pending}>
      {pending ? "Bitte warten ..." : children}
    </Button>
  );
}

export function PasswordForm() {
  const [state, formAction] = useActionState(
    updatePasswordAction,
    passwordInitialState,
  );

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.errors?._form ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.errors._form.join(" ")}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">
          {state.success}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="settings-password" className="block text-sm font-medium">
            Neues Passwort
          </label>
          <input
            id="settings-password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
            aria-invalid={state.errors?.password ? true : undefined}
            className="w-full rounded-md border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
          />
          {state.errors?.password ? (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {state.errors.password.join(" ")}
            </p>
          ) : null}
        </div>

        <div className="space-y-1">
          <label
            htmlFor="settings-confirm-password"
            className="block text-sm font-medium"
          >
            Wiederholen
          </label>
          <input
            id="settings-confirm-password"
            name="confirm_password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
            aria-invalid={state.errors?.confirm_password ? true : undefined}
            className="w-full rounded-md border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
          />
          {state.errors?.confirm_password ? (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {state.errors.confirm_password.join(" ")}
            </p>
          ) : null}
        </div>
      </div>

      <SubmitButton>Passwort ändern</SubmitButton>
    </form>
  );
}

export function PasswordResetForm() {
  const [state, formAction] = useActionState(
    sendPasswordResetAction,
    resetInitialState,
  );

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">
          {state.success}
        </p>
      ) : null}
      <SubmitButton variant="outline">Reset-Link per E-Mail senden</SubmitButton>
    </form>
  );
}
