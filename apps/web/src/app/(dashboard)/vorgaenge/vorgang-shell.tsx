"use client";

import { useMemo, useRef, useState } from "react";
import { Bot, Inbox, ListFilter, Search } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import { getDueState } from "@/lib/vorgangszentrale/formatters";
import type {
  ReviewItem,
  VorgangListItem,
  VorgangStatus,
} from "@/lib/vorgangszentrale/types";
import { VorgangList } from "./vorgang-list";
import { VorgangSidePanel } from "./vorgang-side-panel";

type ViewId =
  | "open"
  | "overdue"
  | "today"
  | "review"
  | "waiting_external"
  | "portal";

const VIEWS: Array<{ id: ViewId; label: string }> = [
  { id: "open", label: "Offene Vorgänge" },
  { id: "overdue", label: "Überfällig" },
  { id: "today", label: "Heute fällig" },
  { id: "review", label: "Review nötig" },
  { id: "waiting_external", label: "Warten extern" },
  { id: "portal", label: "Portal sichtbar" },
];

interface VorgangShellProps {
  items: VorgangListItem[];
  reviewItems: ReviewItem[];
}

export function VorgangShell({ items, reviewItems }: VorgangShellProps) {
  const [activeView, setActiveView] = useState<ViewId>("open");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id ?? null);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());

  const visibleItems = useMemo(
    () => applyFilters(items, activeView, query),
    [activeView, items, query],
  );
  const selected =
    visibleItems.find((item) => item.id === selectedId) ??
    visibleItems[0] ??
    null;

  function selectItem(item: VorgangListItem) {
    setSelectedId(item.id);
  }

  function closePanel() {
    const currentId = selected?.id ?? selectedId;
    setSelectedId(null);
    if (currentId) {
      window.setTimeout(() => rowRefs.current.get(currentId)?.focus(), 0);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 border-b border-[color:var(--color-border)] pb-4 lg:flex-row lg:items-center lg:justify-between">
        <nav className="flex flex-wrap gap-2" aria-label="Vorgangsansichten">
          {VIEWS.map((view) => (
            <button
              key={view.id}
              type="button"
              onClick={() => {
                setActiveView(view.id);
                setSelectedId(null);
              }}
              className={cn(
                "rounded-md border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)]",
                activeView === view.id
                  ? "border-[color:var(--color-primary)] bg-[color:var(--color-primary)] text-[color:var(--color-primary-foreground)]"
                  : "border-[color:var(--color-border)] bg-[color:var(--color-background)] text-[color:var(--color-foreground)] hover:bg-[color:var(--color-secondary)]",
              )}
            >
              {view.label}
            </button>
          ))}
        </nav>

        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="relative min-w-64 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[color:var(--color-muted-foreground)]"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Titel, WEG, Typ suchen"
              className="pl-9"
              aria-label="Vorgänge suchen"
            />
          </div>
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
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm text-[color:var(--color-muted-foreground)]">
        <StatusBadge icon={<ListFilter className="size-3" />} variant="neutral">
          {visibleItems.length} sichtbar
        </StatusBadge>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <VorgangList
          items={visibleItems}
          selectedId={selected?.id ?? null}
          rowRefs={rowRefs}
          onSelect={selectItem}
        />
        <VorgangSidePanel
          item={selected}
          reviewItems={reviewItems.filter(
            (review) => review.vorgangId && review.vorgangId === selected?.id,
          )}
          onClose={selected ? closePanel : undefined}
        />
      </div>
    </div>
  );
}

function applyFilters(
  items: VorgangListItem[],
  activeView: ViewId,
  query: string,
): VorgangListItem[] {
  const normalizedQuery = query.trim().toLowerCase();
  return items.filter((item) => {
    if (!matchesView(item, activeView)) return false;
    if (!normalizedQuery) return true;
    return [item.title, item.wegName, item.typ, item.assignedTo]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLowerCase().includes(normalizedQuery));
  });
}

function matchesView(item: VorgangListItem, activeView: ViewId): boolean {
  if (activeView === "overdue") return getDueState(item.dueAt) === "overdue";
  if (activeView === "today") return getDueState(item.dueAt) === "today";
  if (activeView === "review") {
    return item.status === "review_required" || item.hasKiSuggestion;
  }
  if (activeView === "waiting_external") return item.status === "waiting_external";
  if (activeView === "portal") return item.visibilityState === "public_portal";
  return isOpenStatus(item.status);
}

function isOpenStatus(status: VorgangStatus): boolean {
  return status !== "closed" && status !== "cancelled" && status !== "resolved";
}
