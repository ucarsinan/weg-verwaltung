import { notFound } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type {
  Database,
  WirtschaftsplanStatus,
} from "@/lib/supabase/database.types";

type WegRow = Database["public"]["Tables"]["weg"]["Row"];
type WirtschaftsplanRow = Database["public"]["Tables"]["wirtschaftsplan"]["Row"];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatCurrencyDE(amount: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

function getStatusLabel(status: WirtschaftsplanStatus): string {
  const labels: Record<WirtschaftsplanStatus, string> = {
    entwurf: "Entwurf",
    aktiv: "Aktiv",
    abgeloest: "Abgelöst",
    archiviert: "Archiviert",
  };

  return labels[status];
}

export default async function FinanzenPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: wegId } = await params;

  if (!UUID_RE.test(wegId)) {
    notFound();
  }

  const supabase = await createClient();

  // Load the WEG info
  const { data: weg, error: wegError } = await supabase
    .from("weg")
    .select("*")
    .eq("id", wegId)
    .single<WegRow>();

  if (wegError || !weg) {
    if (wegError?.code === "PGRST116") {
      notFound();
    }
    console.error("[finanzen] WEG select failed:", wegError);
    throw new Error("WEG konnte nicht geladen werden.");
  }

  // Load plans for the WEG
  const { data: plans, error: plansError } = await supabase
    .from("wirtschaftsplan")
    .select("*")
    .eq("weg_id", wegId)
    .order("jahr", { ascending: false })
    .order("version_nr", { ascending: false })
    .returns<WirtschaftsplanRow[]>();

  if (plansError) {
    console.error("[finanzen] plans select failed:", plansError);
  }

  const planRows: WirtschaftsplanRow[] = plans ?? [];

  return (
    <section className="mx-auto max-w-3xl space-y-6 px-6 py-12">
      <header>
        <p className="text-sm text-[color:var(--color-muted-foreground)]">
          <Link
            href={`/wegs/${wegId}`}
            className="underline underline-offset-4 hover:text-[color:var(--color-foreground)]"
          >
            ← Zurück zur WEG-Detailseite
          </Link>
        </p>
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">
              Wirtschaftspläne
            </h1>
            <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
              Finanzplanung für {weg.name}
            </p>
          </div>
          <Button asChild className="shrink-0">
            <Link href={`/wegs/${wegId}/finanzen/new` as Route}>
              Wirtschaftsplan erstellen
            </Link>
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Erstellte Wirtschaftspläne</CardTitle>
          <CardDescription>
            Übersicht aller Entwürfe, aktiven und historischen Planversionen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {planRows.length === 0 ? (
            <p
              role="status"
              className="rounded-md border border-dashed border-[color:var(--color-border)] p-6 text-center text-sm text-[color:var(--color-muted-foreground)]"
            >
              Noch kein Wirtschaftsplan angelegt.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--color-border)] text-left text-xs text-[color:var(--color-muted-foreground)]">
                    <th className="pb-2 pr-4 font-medium">Jahr</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 pr-4 font-medium">Bezeichnung</th>
                    <th className="pb-2 pr-4 text-right font-medium">
                      Gesamtkosten
                    </th>
                    <th className="pb-2 text-right font-medium">Aktion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--color-border)]">
                  {planRows.map((plan) => (
                    <tr key={plan.id} className="align-middle">
                      <td className="py-3 pr-4 font-semibold text-[color:var(--color-foreground)]">
                        {plan.jahr}
                        <span className="ml-2 text-xs font-normal text-[color:var(--color-muted-foreground)]">
                          v{plan.version_nr}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="inline-flex rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-medium text-[color:var(--color-foreground)]">
                          {getStatusLabel(plan.status)}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-[color:var(--color-foreground)]">
                        {plan.bezeichnung}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums font-mono text-[color:var(--color-foreground)]">
                        {formatCurrencyDE(Number(plan.gesamtkosten))}
                      </td>
                      <td className="py-3 text-right">
                        <Link
                          href={
                            `/wegs/${wegId}/finanzen/${plan.id}/edit` as Route
                          }
                          className="text-sm underline underline-offset-4 hover:text-[var(--color-accent)]"
                          aria-label={`Wirtschaftsplan ${plan.jahr} bearbeiten`}
                        >
                          Bearbeiten
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
