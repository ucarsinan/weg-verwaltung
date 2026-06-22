import { Bot, Inbox, ListChecks, Plus, ShieldCheck } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { MetricStrip } from "@/components/ui/metric-strip";
import { PageHeader } from "@/components/ui/page-header";
import {
  getVorgangDashboardMetrics,
  listReviewItems,
  listVorgaenge,
} from "@/lib/vorgangszentrale/queries";
import { VorgangShell } from "./vorgang-shell";

export default async function VorgaengePage() {
  const [vorgaenge, metrics, reviews] = await Promise.all([
    listVorgaenge({ limit: 100 }),
    getVorgangDashboardMetrics(),
    listReviewItems({ limit: 20 }),
  ]);
  const error = vorgaenge.error ?? metrics.error ?? reviews.error;

  return (
    <section className="mx-auto max-w-7xl space-y-6 px-6 py-10">
      <PageHeader
        title="Vorgänge"
        description="Operativer Arbeitsplatz für Inbox, Aufgaben, Reviews, Sichtbarkeit und KI-Vorschläge."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={"/vorgaenge/inbox" as Route}>
                <Inbox className="size-4" aria-hidden="true" />
                Inbox
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={"/vorgaenge/reviews" as Route}>
                <Bot className="size-4" aria-hidden="true" />
                Reviews
              </Link>
            </Button>
            <Button type="button" disabled title="Anlage folgt über Inbox/Domain-Kontext">
              <Plus className="size-4" aria-hidden="true" />
              Neuer Vorgang
            </Button>
          </>
        }
      />

      <MetricStrip
        items={[
          {
            label: "Offen",
            value: metrics.data.open,
            hint: "Aktive Vorgänge ohne abgeschlossene Zustände.",
            icon: <ListChecks />,
          },
          {
            label: "Überfällig",
            value: metrics.data.overdue,
            hint: "Offene Vorgänge mit Frist vor heute.",
            icon: <ShieldCheck />,
          },
          {
            label: "Heute",
            value: metrics.data.dueToday,
            hint: "Fristen, die heute eine Entscheidung brauchen.",
            icon: <ListChecks />,
          },
          {
            label: "Reviews",
            value: metrics.data.reviewRequired,
            hint: "Offene KI- oder Systemvorschläge.",
            icon: <Bot />,
          },
        ]}
      />

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100"
        >
          {error}
        </p>
      ) : null}

      <VorgangShell items={vorgaenge.data} reviewItems={reviews.data} />
    </section>
  );
}
