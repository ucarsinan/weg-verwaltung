import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

// Hook-injected claims live in the JWT, not in auth.users.raw_app_meta_data.
// getUser() returns the persistent row → tenant_id/role would be missing.
// getClaims() verifies + decodes the access_token, so the Custom Access Token
// Hook output (docs/02 §2.4) is visible. Never read user_metadata for
// authorisation: that surface is client-mutable.
interface AppMetadata {
  tenant_id?: string;
  role?: string;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  const email = (claims?.email as string | undefined) ?? "—";
  const appMetadata = ((claims?.app_metadata as AppMetadata | undefined) ?? {});
  const tenantId = appMetadata.tenant_id ?? "—";
  const role = appMetadata.role ?? "—";

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        Scaffold-Platzhalter. Module folgen in späteren Commits.
      </p>

      <dl className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-md border border-[var(--color-border)] p-4">
          <dt className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
            Angemeldet als
          </dt>
          <dd className="mt-1 font-mono text-sm break-all">{email}</dd>
        </div>
        <div className="rounded-md border border-[var(--color-border)] p-4">
          <dt className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
            Rolle
          </dt>
          <dd className="mt-1 font-mono text-sm">{role}</dd>
        </div>
        <div className="rounded-md border border-[var(--color-border)] p-4 sm:col-span-2">
          <dt className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
            tenant_id (aus JWT, app_metadata)
          </dt>
          <dd className="mt-1 font-mono text-sm break-all">{tenantId}</dd>
        </div>
      </dl>

      <section className="mt-10 rounded-md border border-[var(--color-border)] p-6">
        <h2 className="text-lg font-semibold tracking-tight">WEGs</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Verwalten Sie Ihre Wohnungseigentümergemeinschaften.
        </p>
        <Link
          href="/wegs"
          className="mt-4 inline-block text-sm underline underline-offset-4 hover:text-[var(--color-accent)]"
        >
          Zur WEG-Liste →
        </Link>
      </section>
    </div>
  );
}
