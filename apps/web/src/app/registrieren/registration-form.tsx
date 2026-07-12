"use client";

import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { registerAction, type RegistrationState } from "./actions";

const initialState: RegistrationState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="h-11 w-full" disabled={pending} aria-busy={pending}>
      {pending ? <><Loader2 className="animate-spin" /> Registrierung läuft...</> : "30 Tage kostenlos starten"}
    </Button>
  );
}

export function RegistrationForm() {
  const [state, action] = useActionState(registerAction, initialState);
  const isSuccess = state.status === "success";

  return (
    <form action={action} className="space-y-5" noValidate>
      <div className="space-y-2">
        <label htmlFor="email" className="block text-sm font-medium">E-Mail-Adresse</label>
        <Input id="email" name="email" type="email" autoComplete="email" required className="h-11" aria-invalid={state.fieldErrors?.email ? true : undefined} />
        {state.fieldErrors?.email ? <p role="alert" className="text-sm text-[color:var(--color-destructive)]">{state.fieldErrors.email}</p> : null}
      </div>
      <div className="space-y-2">
        <label htmlFor="password" className="block text-sm font-medium">Passwort</label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={12} className="h-11" aria-invalid={state.fieldErrors?.password ? true : undefined} />
        <p className="text-xs text-[color:var(--color-muted-foreground)]">Mindestens 12 Zeichen.</p>
        {state.fieldErrors?.password ? <p role="alert" className="text-sm text-[color:var(--color-destructive)]">{state.fieldErrors.password}</p> : null}
      </div>
      {state.message ? (
        <p role={isSuccess ? "status" : "alert"} className="flex gap-2 rounded-md border border-[color:var(--color-border)] p-3 text-sm">
          {isSuccess ? <CheckCircle2 className="size-4 shrink-0 text-emerald-700" /> : <AlertCircle className="size-4 shrink-0 text-[color:var(--color-destructive)]" />}
          {state.message}
        </p>
      ) : null}
      <SubmitButton />
      <p className="text-center text-xs leading-5 text-[color:var(--color-muted-foreground)]">30 Tage kostenlos. Keine Kreditkarte. Danach monatlich kündbar.</p>
    </form>
  );
}

