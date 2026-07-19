/**
 * action-kernel — das gemeinsame Skelett aller Form-Server-Actions.
 *
 * Definiert genau einmal, was bisher pro Action kopiert wurde:
 * Guard-Schritt (Tenant-Kontext via identity-Modul), Parse-/Validierungs-
 * Phase, PostgREST-Fehlerprotokoll und Revalidate/Redirect-Abschluss.
 * Auth-Präsenz wird damit Kontrakt statt Konvention: jede über
 * `runFormAction` definierte Action prüft den Tenant-Kontext, bevor sie
 * schreibt (Defense-in-Depth zusätzlich zur RLS, Invariante 1).
 *
 * Die Action behält ihren öffentlichen FormState-Typ — der Kernel ist die
 * Implementierung dahinter, nicht das Interface der Formulare.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireTenantContext } from "@/modules/identity";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export interface ActionContext {
  supabase: SupabaseServerClient;
  userId: string;
  tenantId: string;
  role: string | null;
}

export interface PostgrestErrorLike {
  code?: string | null;
  hint?: string | null;
}

/** Einheitliches, serverseitiges PostgREST-Fehlerprotokoll (nie ans UI). */
export function logPostgrestError(
  scope: string,
  error: PostgrestErrorLike,
): void {
  console.error(`[${scope}] request failed`, {
    code: error.code,
    hint: error.hint,
  });
}

export type ParseResult<TInput, TState> =
  | { input: TInput }
  | { errors: TState };

export type ExecuteResult<TState> =
  | { errors: TState }
  | { revalidate: string[]; redirectTo: string }
  | { revalidate: string[]; state: TState };

export interface FormActionSpec<TInput, TState> {
  /** Logging-Scope, z. B. "createWeg". */
  scope: string;
  /** Fehler-State, wenn der Tenant-Guard fehlschlägt (Text kommt vom Guard). */
  guardError: (message: string) => TState;
  /** Pure FormData-Validierung — einzige Quelle der Feldfehler. */
  parse: (formData: FormData) => ParseResult<TInput, TState>;
  /** Schreibpfad; PostgREST-Fehler als State zurückgeben, nie werfen. */
  execute: (
    ctx: ActionContext,
    input: TInput,
  ) => Promise<ExecuteResult<TState>>;
}

/**
 * Führt eine Form-Action durch das kanonische Skelett:
 * parse → Tenant-Guard → execute → revalidate → redirect/State.
 *
 * `redirect()` wirft Nexts NEXT_REDIRECT-Kontrollfluss — ein Redirect-Ausgang
 * kehrt deshalb nie zurück.
 */
export async function runFormAction<TInput, TState>(
  spec: FormActionSpec<TInput, TState>,
  formData: FormData,
): Promise<TState> {
  const parsed = spec.parse(formData);
  if ("errors" in parsed) return parsed.errors;

  const context = await requireTenantContext();
  if (!context.ok) return spec.guardError(context.message);

  const supabase = await createClient();
  const outcome = await spec.execute(
    {
      supabase,
      userId: context.userId,
      tenantId: context.tenantId,
      role: context.role,
    },
    parsed.input,
  );

  if ("errors" in outcome) return outcome.errors;

  for (const path of outcome.revalidate) {
    revalidatePath(path);
  }

  if ("redirectTo" in outcome) {
    // Typed-Routes-Grenze: redirectTo läuft als dynamischer String durch den
    // Kernel, die Literal-Validierung von Next greift hier nicht mehr.
    redirect(outcome.redirectTo as Parameters<typeof redirect>[0]);
  }

  return outcome.state;
}
