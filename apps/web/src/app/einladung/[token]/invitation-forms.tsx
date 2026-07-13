"use client";

import { useActionState } from "react";
import Link from "next/link";

import type { AcceptInvitationState, InvitationSignUpState } from "./actions";
import { Button } from "@/components/ui/button";

const signUpInitialState: InvitationSignUpState = {};
const acceptInitialState: AcceptInvitationState = {};

export function InvitationSignUpForm({
  action,
  token,
}: {
  action: (
    prev: InvitationSignUpState,
    formData: FormData,
  ) => Promise<InvitationSignUpState>;
  token: string;
}) {
  const [state, formAction, isPending] = useActionState(action, signUpInitialState);
  const messageId = "invitation-signup-message";

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-4" noValidate>
        <div className="space-y-1">
          <label htmlFor="invitation-email" className="block text-sm font-medium">
            E-Mail
          </label>
          <input
            id="invitation-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            maxLength={320}
            disabled={isPending}
            aria-invalid={state.fieldErrors?.email ? true : undefined}
            aria-describedby={
              state.fieldErrors?.email ? "invitation-email-error" : undefined
            }
            className="w-full rounded-md border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm disabled:opacity-60"
          />
          {state.fieldErrors?.email ? (
            <p id="invitation-email-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
              {state.fieldErrors.email}
            </p>
          ) : null}
        </div>

        <div className="space-y-1">
          <label htmlFor="invitation-password" className="block text-sm font-medium">
            Passwort
          </label>
          <input
            id="invitation-password"
            name="password"
            type="password"
            required
            autoComplete="new-password"
            minLength={12}
            disabled={isPending}
            aria-invalid={state.fieldErrors?.password ? true : undefined}
            aria-describedby={
              state.fieldErrors?.password ? "invitation-password-error" : undefined
            }
            className="w-full rounded-md border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm disabled:opacity-60"
          />
          {state.fieldErrors?.password ? (
            <p id="invitation-password-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
              {state.fieldErrors.password}
            </p>
          ) : null}
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

        <Button
          type="submit"
          disabled={isPending}
          aria-busy={isPending}
          aria-describedby={state.message ? messageId : undefined}
          className="w-full"
        >
          {isPending ? "Konto wird erstellt ..." : "Konto erstellen und beitreten"}
        </Button>
      </form>

      <div className="border-t border-[color:var(--color-border)] pt-6">
        <p className="text-center text-sm text-[color:var(--color-muted-foreground)]">
          Bereits registriert?{" "}
          <Link
            href={`/login?next=${encodeURIComponent(`/einladung/${token}`)}`}
            className="font-medium text-[color:var(--color-ai-violet)] underline-offset-4 hover:underline"
          >
            Anmelden
          </Link>
        </p>
      </div>
    </div>
  );
}

export function AcceptInvitationForm({
  action,
}: {
  action: (
    prev: AcceptInvitationState,
    formData: FormData,
  ) => Promise<AcceptInvitationState>;
}) {
  const [state, formAction, isPending] = useActionState(action, acceptInitialState);
  const messageId = "invitation-accept-message";

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <div className="space-y-1">
        <label htmlFor="invitation-vorname" className="block text-sm font-medium">
          Vorname
        </label>
        <input
          id="invitation-vorname"
          name="vorname"
          type="text"
          required
          maxLength={100}
          disabled={isPending}
          aria-invalid={state.fieldErrors?.vorname ? true : undefined}
          aria-describedby={
            state.fieldErrors?.vorname ? "invitation-vorname-error" : undefined
          }
          className="w-full rounded-md border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm disabled:opacity-60"
        />
        {state.fieldErrors?.vorname ? (
          <p id="invitation-vorname-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
            {state.fieldErrors.vorname}
          </p>
        ) : null}
      </div>

      <div className="space-y-1">
        <label htmlFor="invitation-nachname" className="block text-sm font-medium">
          Nachname
        </label>
        <input
          id="invitation-nachname"
          name="nachname"
          type="text"
          required
          maxLength={100}
          disabled={isPending}
          aria-invalid={state.fieldErrors?.nachname ? true : undefined}
          aria-describedby={
            state.fieldErrors?.nachname ? "invitation-nachname-error" : undefined
          }
          className="w-full rounded-md border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm disabled:opacity-60"
        />
        {state.fieldErrors?.nachname ? (
          <p id="invitation-nachname-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
            {state.fieldErrors.nachname}
          </p>
        ) : null}
      </div>

      {state.message ? (
        <p id={messageId} role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {state.message}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={isPending}
        aria-busy={isPending}
        aria-describedby={state.message ? messageId : undefined}
        className="w-full"
      >
        {isPending ? "Wird beigetreten ..." : "Einladung annehmen"}
      </Button>
    </form>
  );
}
