"use client";

import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Bot, CalendarClock, ExternalLink, Shield } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge, type StatusBadgeProps } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import {
  formatDateTime,
  formatDueDate,
  formatPriority,
  formatVisibility,
  formatVorgangStatus,
  getDueState,
} from "@/lib/vorgangszentrale/formatters";
import type {
  VorgangListItem,
  VorgangPriority,
  VorgangStatus,
} from "@/lib/vorgangszentrale/types";

interface VorgangListProps {
  items: VorgangListItem[];
  selectedId: string | null;
  rowRefs: React.MutableRefObject<Map<string, HTMLTableRowElement>>;
  onSelect: (item: VorgangListItem) => void;
}

export function VorgangList({
  items,
  selectedId,
  rowRefs,
  onSelect,
}: VorgangListProps) {
  const router = useRouter();

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<CalendarClock />}
        title="Keine Vorgänge in dieser Ansicht"
        description="Passe Ansicht oder Suche an. Neue Vorgänge entstehen aktuell über Inbox-Triage oder Domain-Kontext."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-[color:var(--color-border)]">
      <table className="w-full min-w-[1040px] table-fixed text-sm">
        <thead>
          <tr className="border-b border-[color:var(--color-border)] bg-[color:var(--color-secondary)]/45 text-left text-xs text-[color:var(--color-muted-foreground)]">
            <th className="w-24 px-4 py-3 font-medium">Prio</th>
            <th className="w-36 px-4 py-3 font-medium">Status</th>
            <th className="w-[28%] px-4 py-3 font-medium">Titel</th>
            <th className="w-44 px-4 py-3 font-medium">WEG</th>
            <th className="w-32 px-4 py-3 font-medium">Typ</th>
            <th className="w-40 px-4 py-3 font-medium">Frist</th>
            <th className="w-36 px-4 py-3 font-medium">Sichtbarkeit</th>
            <th className="w-32 px-4 py-3 font-medium">Aktivität</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[color:var(--color-border)]">
          {items.map((item) => {
            const selected = item.id === selectedId;
            return (
              <tr
                key={item.id}
                ref={(element) => {
                  if (element) rowRefs.current.set(item.id, element);
                  else rowRefs.current.delete(item.id);
                }}
                tabIndex={0}
                aria-selected={selected}
                onClick={() => onSelect(item)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    router.push(`/vorgaenge/${item.id}` as Route);
                  }
                  if (event.key === "Escape") event.currentTarget.blur();
                }}
                className={cn(
                  "cursor-pointer align-top transition-colors hover:bg-[color:var(--color-secondary)]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--color-ring)]",
                  selected && "bg-[color:var(--color-secondary)]",
                )}
              >
                <td className="px-4 py-3">
                  <StatusBadge variant={priorityVariant(item.priority)}>
                    {formatPriority(item.priority)}
                  </StatusBadge>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge variant={statusVariant(item.status)}>
                    {formatVorgangStatus(item.status)}
                  </StatusBadge>
                </td>
                <td className="px-4 py-3">
                  <div className="min-w-0 space-y-1">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelect(item);
                      }}
                      className="line-clamp-2 w-full text-left font-medium text-[color:var(--color-foreground)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)]"
                    >
                      {item.title}
                    </button>
                    <div className="flex flex-wrap gap-1.5">
                      {item.hasKiSuggestion ? (
                        <StatusBadge variant="ai" icon={<Bot />}>
                          KI
                        </StatusBadge>
                      ) : null}
                      {item.openTaskCount > 0 ? (
                        <StatusBadge variant="neutral">
                          {item.openTaskCount} Aufgaben
                        </StatusBadge>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="line-clamp-2">
                    {item.wegName ?? (item.wegId ? "WEG ohne Namen" : "Tenant-weit")}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="line-clamp-2">{item.typ}</span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "text-xs",
                      getDueState(item.dueAt) === "overdue" &&
                        "font-medium text-red-700 dark:text-red-300",
                    )}
                  >
                    {formatDueDate(item.dueAt)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge
                    variant={item.visibilityState === "internal" ? "neutral" : "warning"}
                    icon={<Shield />}
                  >
                    {formatVisibility(item.visibilityState)}
                  </StatusBadge>
                </td>
                <td className="px-4 py-3">
                  <span className="block text-xs text-[color:var(--color-muted-foreground)]">
                    {formatDateTime(item.lastActivityAt)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-2 px-2"
                    onClick={(event) => {
                      event.stopPropagation();
                      router.push(`/vorgaenge/${item.id}` as Route);
                    }}
                  >
                    <ExternalLink className="size-4" aria-hidden="true" />
                    Detail
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function statusVariant(status: VorgangStatus): StatusBadgeProps["variant"] {
  if (status === "open" || status === "draft") return "info";
  if (status === "review_required" || status === "waiting_internal") return "warning";
  if (status === "resolved" || status === "closed") return "success";
  if (status === "cancelled") return "danger";
  return "neutral";
}

function priorityVariant(priority: VorgangPriority): StatusBadgeProps["variant"] {
  if (priority === "urgent") return "danger";
  if (priority === "high") return "warning";
  if (priority === "low") return "neutral";
  return "info";
}
