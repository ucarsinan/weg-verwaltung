import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

// Server Component — RLS scopes the SELECT to the user's tenant automatically.
// The middleware (apps/web/src/middleware.ts) refreshes the session and passes
// the user JWT into PostgREST via the supabase-ssr cookies adapter (see
// lib/supabase/server.ts). Postgres then evaluates the policy
// `tenant_id = (auth.jwt() ->> 'tenant_id')::uuid` on every row — there is no
// client-side tenant filter and no service-role key in this path.

type WegRow = Database["public"]["Tables"]["weg"]["Row"];

export default async function WegsPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("weg")
    .select("*")
    .order("name", { ascending: true })
    .returns<WegRow[]>();

  if (error) {
    // Server-side log only — never expose raw PostgREST/PG errors to the user.
    console.error("[wegs] select failed:", error.message, { code: error.code, details: error.details, hint: error.hint });
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">WEGs</h1>
        <p
          role="alert"
          className="mt-6 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-4 text-sm"
        >
          Konnte WEGs nicht laden. Bitte versuchen Sie es später erneut.
        </p>
      </div>
    );
  }

  const wegs = data ?? [];

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">WEGs</h1>
        <Link
          href="/wegs/new"
          className="text-sm underline underline-offset-4 hover:text-[var(--color-accent)]"
        >
          Neue WEG anlegen
        </Link>
      </div>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        Übersicht der von Ihnen verwalteten Wohnungseigentümergemeinschaften.
      </p>

      {wegs.length === 0 ? (
        <p
          role="status"
          className="mt-8 rounded-md border border-dashed border-[var(--color-border)] p-8 text-center text-sm text-[var(--color-muted)]"
        >
          Noch keine WEG angelegt.{" "}
          <Link
            href="/wegs/new"
            className="underline underline-offset-4 hover:text-[var(--color-accent)]"
          >
            Jetzt erste WEG anlegen
          </Link>
          .
        </p>
      ) : (
        <ul
          aria-label="Liste der Wohnungseigentümergemeinschaften"
          className="mt-8 divide-y divide-[var(--color-border)] rounded-md border border-[var(--color-border)]"
        >
          {wegs.map((weg) => (
            <li key={weg.id} className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{weg.name}</p>
                <p className="mt-1 truncate text-xs text-[var(--color-muted)]">
                  {weg.adresse ?? "Keine Adresse hinterlegt"}
                </p>
              </div>
              <Link
                href={`/wegs/${weg.id}`}
                className="shrink-0 text-sm underline underline-offset-4 hover:text-[var(--color-accent)]"
                aria-label={`Detail ansehen: ${weg.name}`}
              >
                Detail ansehen →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
