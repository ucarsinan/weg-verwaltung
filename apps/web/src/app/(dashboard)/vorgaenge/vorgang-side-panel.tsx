"use client";

import { Bot, ClipboardList, ExternalLink, History, Shield, X } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  formatDateTime,
  formatDueDate,
  formatKiProvenanceLabel,
  formatPriority,
  formatVisibility,
  formatVorgangStatus,
} from "@/lib/vorgangszentrale/formatters";
import type {
  ReviewItem,
  VorgangListItem,
} from "@/lib/vorgangszentrale/types";

interface VorgangSidePanelProps {
  item: VorgangListItem | null;
  reviewItems: ReviewItem[];
  onClose?: () => void;
}

export function VorgangSidePanel({
  item,
  reviewItems,
  onClose,
}: VorgangSidePanelProps) {
  if (!item) {
    return (
      <aside className="rounded-lg border border-dashed border-[color:var(--color-border)] p-6">
        <EmptyState
          icon={<ClipboardList />}
          title="Kein Vorgang ausgewählt"
          description="Wähle einen Vorgang aus der Liste, um Kontext, nächste Aktion und offene Reviews zu sehen."
        />
      </aside>
    );
  }

  return (
    <aside
      aria-label={`Vorschau ${item.title}`}
      className="h-fit rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-card)] shadow-sm"
    >
      <div className="flex items-start justify-between gap-3 border-b border-[color:var(--color-border)] p-4">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            <StatusBadge variant="info">{formatVorgangStatus(item.status)}</StatusBadge>
            <StatusBadge variant="neutral">{formatPriority(item.priority)}</StatusBadge>
            <StatusBadge variant="neutral" icon={<Shield />}>
              {formatVisibility(item.visibilityState)}
            </StatusBadge>
          </div>
          <h2 className="line-clamp-3 text-base font-semibold text-[color:var(--color-foreground)]">
            {item.title}
          </h2>
          <p className="text-xs text-[color:var(--color-muted-foreground)]">
            {item.wegName ?? (item.wegId ? "WEG ohne Namen" : "Tenant-weit")} · {item.typ}
          </p>
        </div>
        {onClose ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Vorschau schließen"
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        ) : null}
      </div>

      <div className="space-y-5 p-4">
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Nächste Aktion</h3>
          <p className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-secondary)]/40 p-3 text-sm leading-6">
            {nextActionText(item)}
          </p>
        </section>

        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-[color:var(--color-muted-foreground)]">Frist</dt>
            <dd className="mt-1 font-medium">{formatDueDate(item.dueAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-[color:var(--color-muted-foreground)]">
              Letzte Aktivität
            </dt>
            <dd className="mt-1 font-medium">{formatDateTime(item.lastActivityAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-[color:var(--color-muted-foreground)]">Aufgaben</dt>
            <dd className="mt-1 font-medium">{item.openTaskCount} offen</dd>
          </div>
          <div>
            <dt className="text-xs text-[color:var(--color-muted-foreground)]">Zuständig</dt>
            <dd className="mt-1 truncate font-medium">{item.assignedTo ?? "Nicht gesetzt"}</dd>
          </div>
        </dl>

        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <Bot className="size-4" aria-hidden="true" />
            KI-Reviews
          </h3>
          {reviewItems.length > 0 ? (
            <ul className="space-y-2">
              {reviewItems.slice(0, 3).map((review) => (
                <li
                  key={review.id}
                  className="rounded-md border border-[color:var(--color-border)] p-3 text-sm"
                >
                  <p className="font-medium">{review.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-[color:var(--color-muted-foreground)]">
                    {formatKiProvenanceLabel(review)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-md border border-dashed border-[color:var(--color-border)] p-3 text-sm text-[color:var(--color-muted-foreground)]">
              Keine offenen KI-Reviews für diesen Vorgang.
            </p>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <History className="size-4" aria-hidden="true" />
            Timeline-Vorschau
          </h3>
          <p className="rounded-md border border-dashed border-[color:var(--color-border)] p-3 text-sm text-[color:var(--color-muted-foreground)]">
            Detail-Timeline, Dokumente und Audit-Auszug werden in der Detailseite geladen.
          </p>
        </section>

        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={`/vorgaenge/${item.id}` as Route}>
              <ExternalLink className="size-4" aria-hidden="true" />
              Detail öffnen
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/audit">Audit</Link>
          </Button>
        </div>
      </div>
    </aside>
  );
}

function nextActionText(item: VorgangListItem): string {
  if (item.hasKiSuggestion || item.status === "review_required") {
    return "Offenen KI- oder Systemvorschlag prüfen und menschlich entscheiden.";
  }
  if (item.openTaskCount > 0) {
    return "Offene Aufgaben prüfen, Frist bestätigen oder Zuständigkeit klären.";
  }
  if (item.status === "waiting_external") {
    return "Externe Rückmeldung dokumentieren oder Wiedervorlage setzen.";
  }
  return "Sachstand prüfen und nächsten internen Schritt als Timeline-Notiz erfassen.";
}
