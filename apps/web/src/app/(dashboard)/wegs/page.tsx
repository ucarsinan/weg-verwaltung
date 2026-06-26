import { Building2, Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { EntityList, EntityListItem } from "@/components/ui/entity-list";
import { MetricStrip } from "@/components/ui/metric-strip";
import { PageHeader } from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

// Server Component — RLS scopes the SELECT to the user's tenant automatically.
// The proxy (apps/web/src/proxy.ts) refreshes the session and passes
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
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <PageHeader
          title="WEGs"
          description="Übersicht der von Ihnen verwalteten Wohnungseigentümergemeinschaften."
        />
        <p
          role="alert"
          className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-4 text-sm"
        >
          Konnte WEGs nicht laden. Bitte versuchen Sie es später erneut.
        </p>
      </div>
    );
  }

  const wegs = data ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="WEGs"
        description="Verwalten Sie Gemeinschaften, Einheiten, Personen und den Einstieg in Versammlungen."
        actions={
          <Button asChild>
            <Link href="/wegs/new">
              <Plus className="size-4" aria-hidden="true" />
              Neue WEG
            </Link>
          </Button>
        }
      />

      <MetricStrip
        items={[
          {
            label: "WEGs",
            value: wegs.length,
            hint: "Aktuell im Mandanten sichtbar.",
            icon: <Building2 />,
          },
        ]}
        className="xl:grid-cols-3"
      />

      {wegs.length === 0 ? (
        <EmptyState
          title="Noch keine WEG angelegt"
          description="Legen Sie die erste Gemeinschaft an, um Einheiten, Eigentümer und Versammlungen zu verwalten."
          icon={<Building2 />}
          action={
            <Button asChild size="sm">
              <Link href="/wegs/new">Erste WEG anlegen</Link>
            </Button>
          }
        />
      ) : (
        <EntityList aria-label="Liste der Wohnungseigentümergemeinschaften">
          {wegs.map((weg) => (
            <EntityListItem
              key={weg.id}
              leading={<Building2 className="size-4" aria-hidden="true" />}
              title={
                <Link
                  href={`/wegs/${weg.id}`}
                  className="underline-offset-4 hover:underline"
                >
                  {weg.name}
                </Link>
              }
              description={
                weg.adresse ?? (
                  <span className="italic text-[color:var(--color-muted-foreground)]">
                    nicht hinterlegt
                  </span>
                )
              }
              meta={<span>Angelegt am {new Date(weg.created_at).toLocaleDateString("de-DE")}</span>}
              actions={
                <Button asChild variant="outline" size="sm">
                  <Link
                    href={`/wegs/${weg.id}`}
                    aria-label={`Detail ansehen: ${weg.name}`}
                  >
                    Detail ansehen
                  </Link>
                </Button>
              }
            />
          ))}
        </EntityList>
      )}
    </div>
  );
}
