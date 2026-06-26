"use client";

import { AlertCircle, Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import {
  buildAuditSummary,
  formatActionLabel,
  formatActorLabel,
  formatAuditDateTime,
  formatEntityLabel,
  formatRiskFlags,
} from "./formatters";

export interface AuditFeedItem {
  id: string;
  seq: number;
  created_at: string;
  actor_type: string;
  actor_user_id: string | null;
  actor_label?: string | null;
  db_role: string | null;
  entity_typ: string;
  entity_id: string | null;
  entity_label?: string | null;
  action: string;
  summary?: string | null;
  risk_flags: string[];
  payload_masked: unknown;
  can_reveal_payload: boolean;
  prev_hash?: string | null;
  row_hash?: string | null;
  checkpoint_label?: string | null;
}

export interface AuditFeedProps {
  items: AuditFeedItem[];
  selectedId?: string | null;
  isLoading?: boolean;
  isLoadingMore?: boolean;
  error?: string | null;
  hasMore?: boolean;
  onSelect: (item: AuditFeedItem) => void;
  onLoadMore?: () => void;
  onRetry?: () => void;
}

export function AuditFeed({
  items,
  selectedId,
  isLoading = false,
  isLoadingMore = false,
  error,
  hasMore = false,
  onSelect,
  onLoadMore,
  onRetry,
}: AuditFeedProps) {
  if (isLoading && items.length === 0) {
    return (
      <div
        role="status"
        className="flex min-h-72 items-center justify-center rounded-lg border border-dashed border-[color:var(--color-border)] text-sm text-[color:var(--color-muted-foreground)]"
      >
        <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
        Audit-Ereignisse werden geladen.
      </div>
    );
  }

  if (error && items.length === 0) {
    return (
      <EmptyState
        role="alert"
        icon={<AlertCircle />}
        title="Audit-Feed konnte nicht geladen werden"
        description={error}
        action={
          onRetry ? (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              Erneut versuchen
            </Button>
          ) : null
        }
      />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Search />}
        title="Keine Ereignisse gefunden"
        description="Passe die Filter an oder setze sie zurück, um weitere Audit-Einträge zu sehen."
      />
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-200"
        >
          {error}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-[color:var(--color-border)]">
        <table className="w-full min-w-[840px] table-fixed text-sm">
          <thead>
            <tr className="border-b border-[color:var(--color-border)] bg-[color:var(--color-secondary)]/45 text-left text-xs text-[color:var(--color-muted-foreground)]">
              <th className="w-36 px-4 py-3 font-medium">Zeit</th>
              <th className="w-[28%] px-4 py-3 font-medium">Ereignis</th>
              <th className="w-40 px-4 py-3 font-medium">Entität</th>
              <th className="w-36 px-4 py-3 font-medium">Akteur</th>
              <th className="w-28 px-4 py-3 font-medium">Aktion</th>
              <th className="w-36 px-4 py-3 font-medium">Marker</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--color-border)]">
            {items.map((item) => {
              const isSelected = item.id === selectedId;
              const flagLabels = formatRiskFlags(item.risk_flags);

              return (
                <tr
                  key={`${item.id}-${item.created_at}`}
                  aria-selected={isSelected}
                  className={cn(
                    "align-top transition-colors hover:bg-[color:var(--color-secondary)]/50",
                    isSelected && "bg-[color:var(--color-secondary)]",
                  )}
                >
                  <td className="px-4 py-3 font-mono text-xs tabular-nums text-[color:var(--color-muted-foreground)]">
                    {formatAuditDateTime(item.created_at)}
                    <span className="mt-1 block">#{item.seq}</span>
                  </td>
                  <td className="px-4 py-3 text-[color:var(--color-foreground)]">
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      className="line-clamp-2 w-full text-left font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)]"
                      onClick={() => onSelect(item)}
                    >
                      {buildAuditSummary(item)}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <span className="block truncate text-[color:var(--color-foreground)]">
                      {item.entity_label ?? formatEntityLabel(item.entity_typ)}
                    </span>
                    {item.entity_id ? (
                      <span className="mt-1 block truncate font-mono text-xs text-[color:var(--color-muted-foreground)]">
                        {item.entity_id.slice(0, 8)}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <span className="block truncate">
                      {item.actor_label ?? formatActorLabel(item.actor_type)}
                    </span>
                    <span className="mt-1 block truncate font-mono text-xs text-[color:var(--color-muted-foreground)]">
                      {item.db_role ?? "–"}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-[color:var(--color-foreground)]">
                    {formatActionLabel(item.action)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {flagLabels.length > 0 ? (
                        flagLabels.map((label) => (
                          <StatusBadge key={label} variant={flagVariant(label)}>
                            {label}
                          </StatusBadge>
                        ))
                      ) : (
                        <span className="text-xs text-[color:var(--color-muted-foreground)]">
                          –
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {hasMore ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={onLoadMore}
            disabled={!onLoadMore || isLoadingMore}
          >
            {isLoadingMore ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : null}
            Weitere laden
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function flagVariant(label: string): "neutral" | "info" | "warning" | "ai" {
  if (label === "KI") return "ai";
  if (label === "Integrität") return "warning";
  if (label === "Service Role") return "info";
  return "neutral";
}
