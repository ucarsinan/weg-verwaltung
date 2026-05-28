"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="w-full rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
    >
      {pending ? "Anmeldung läuft…" : "Anmelden"}
    </button>
  );
}

export function LoginForm({ nextPath }: { nextPath: string }) {
  const [state, formAction] = useActionState(loginAction, initialState);
  const errorId = "login-error";

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={nextPath} />

      <div className="space-y-1">
        <label htmlFor="email" className="block text-sm font-medium">
          E-Mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? errorId : undefined}
          className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="password" className="block text-sm font-medium">
          Passwort
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? errorId : undefined}
          className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
        />
      </div>

      {state.error ? (
        <p
          id={errorId}
          role="alert"
          className="text-sm text-red-600 dark:text-red-400"
        >
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
