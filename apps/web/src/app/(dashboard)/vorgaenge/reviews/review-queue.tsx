"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { AlertTriangle, Bot, Check, FileText, Search, X } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  formatConfidence,
  formatDateTime,
  formatReviewStatus,
} from "@/lib/vorgangszentrale/formatters";
import type { ReviewItem } from "@/lib/vorgangszentrale/types";

type ActionResult = { error?: string; id?: string };
type ReviewAction = (reviewId: string) => Promise<ActionResult>;

interface ReviewQueueProps {
  items: ReviewItem[];
  acceptAction: ReviewAction;
  rejectAction: ReviewAction;
  emptyIcon?: ReactNode;
}

const HIGH_RISK_FLAGS = new Set([
  "payment",
  "zahlung",
  "beschluss_sammlung",
  "protocol_signing",
  "external_sending",
  "portal_publishing",
]);

export function ReviewQueue({
  items,
  acceptAction,
  rejectAction,
  emptyIcon,
}: ReviewQueueProps) {
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter((item) =>
      [item.title, item.summary, item.suggestionType, item.sourceLabel, item.wegName]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(normalized)),
    );
  }, [items, query]);

  function run(reviewId: string, action: ReviewAction) {
    setError(null);
    setPendingId(reviewId);
    startTransition(async () => {
      const result = await action(reviewId);
      if (result.error) setError(result.error);
      setPendingId(null);
    });
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={emptyIcon ?? <Bot />}
        title="Keine offenen Reviews"
        description="Neue KI-Vorschläge erscheinen hier erst nach menschlicher Prüfungspflicht. Agenten schreiben keine finalen Domainzustände."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-xl">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[color:var(--color-muted-foreground)]"
          aria-hidden="true"
        />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Reviews durchsuchen"
          className="pl-9"
          aria-label="Reviews durchsuchen"
        />
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-200"
        >
          {error}
        </p>
      ) : null}

      <div className="space-y-3">
        {visibleItems.map((item) => {
          const highRisk = isHighRisk(item);
          return (
            <article
              key={item.id}
              className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-4 shadow-sm"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    <StatusBadge variant="ai" icon={<Bot />}>
                      KI-Vorschlag
                    </StatusBadge>
                    <StatusBadge variant="info">{item.suggestionType}</StatusBadge>
                    <StatusBadge variant={item.confidence === "blockiert" ? "danger" : "neutral"}>
                      {formatConfidence(item.confidence)}
                    </StatusBadge>
                    <StatusBadge variant="neutral">
                      {formatReviewStatus(item.status)}
                    </StatusBadge>
                    {highRisk ? (
                      <StatusBadge variant="warning" icon={<AlertTriangle />}>
                        Review-only
                      </StatusBadge>
                    ) : null}
                  </div>

                  <div>
                    <h2 className="text-base font-semibold text-[color:var(--color-foreground)]">
                      {item.title}
                    </h2>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-[color:var(--color-muted-foreground)]">
                      {item.summary}
                    </p>
                  </div>

                  <dl className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                    <div>
                      <dt className="text-xs text-[color:var(--color-muted-foreground)]">WEG</dt>
                      <dd className="mt-1 truncate font-medium">
                        {item.wegName ?? (item.wegId ? "WEG ohne Namen" : "Tenant-weit")}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[color:var(--color-muted-foreground)]">Quelle</dt>
                      <dd className="mt-1 truncate font-medium">{item.sourceLabel ?? "Keine Quelle"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[color:var(--color-muted-foreground)]">Trace</dt>
                      <dd className="mt-1 truncate font-mono text-xs">
                        {item.langfuseTraceId?.slice(0, 12) ?? "Nicht gesetzt"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[color:var(--color-muted-foreground)]">Erstellt</dt>
                      <dd className="mt-1 font-medium">{formatDateTime(item.createdAt)}</dd>
                    </div>
                  </dl>

                  {item.riskFlags.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {item.riskFlags.map((flag) => (
                        <StatusBadge key={flag} variant="warning">
                          {flag}
                        </StatusBadge>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
                  {item.vorgangId ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/vorgaenge/${item.vorgangId}` as Route}>
                        <FileText className="size-4" aria-hidden="true" />
                        Vorgang
                      </Link>
                    </Button>
                  ) : null}
                  <Button type="button" variant="outline" size="sm" disabled>
                    Bearbeiten
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={isPending || highRisk}
                    onClick={() => run(item.id, acceptAction)}
                    title={highRisk ? "Hochriskante Vorschläge sind im ersten Schnitt review-only." : undefined}
                  >
                    <Check className="size-4" aria-hidden="true" />
                    {pendingId === item.id ? "…" : "Übernehmen"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                    onClick={() => run(item.id, rejectAction)}
                  >
                    <X className="size-4" aria-hidden="true" />
                    Verwerfen
                  </Button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function isHighRisk(item: ReviewItem): boolean {
  return item.riskFlags.some((flag) => HIGH_RISK_FLAGS.has(flag.toLowerCase()));
}
