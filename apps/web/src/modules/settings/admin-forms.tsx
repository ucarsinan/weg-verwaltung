"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  updateTenantNameAction,
  type AdminFormState,
} from "@/modules/settings/admin-actions";

const initialState: AdminFormState = {};

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
      {pending ? "Speichern ..." : children}
    </Button>
  );
}

function FormMessage({ state }: { state: AdminFormState }) {
  if (state.errors?._form) {
    return (
      <p role="alert" className="text-sm text-red-600 dark:text-red-400">
        {state.errors._form.join(" ")}
      </p>
    );
  }
  if (state.success) {
    return (
      <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">
        {state.success}
      </p>
    );
  }
  return null;
}

export function TenantNameForm({ name }: { name: string }) {
  const [state, formAction] = useActionState(updateTenantNameAction, initialState);

  return (
    <form action={formAction} className="space-y-3" noValidate>
      <FormMessage state={state} />
      <div className="space-y-1">
        <label htmlFor="settings-tenant-name" className="block text-sm font-medium">
          Mandantenname
        </label>
        <input
          id="settings-tenant-name"
          name="name"
          required
          maxLength={120}
          defaultValue={name}
          aria-invalid={state.errors?.name ? true : undefined}
          className="w-full rounded-md border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
        />
        {state.errors?.name ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {state.errors.name.join(" ")}
          </p>
        ) : null}
      </div>
      <SubmitButton>Mandant speichern</SubmitButton>
    </form>
  );
}
