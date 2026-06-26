"use client";

import { useMemo, useState } from "react";
import { RotateCcw, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AuditArchivePanel, type AuditArchivePanelProps } from "./audit-archive-panel";
import { AuditDetailPanel, type AuditDetailPanelProps } from "./audit-detail-panel";
import { AuditFeed, type AuditFeedItem } from "./audit-feed";
import {
  AuditIntegrityPanel,
  type AuditIntegrityPanelProps,
} from "./audit-integrity-panel";

export interface AuditFeedCursor {
  created_at: string;
  seq: number;
}

export interface AuditFeedFilters {
  query: string;
  from: string;
  to: string;
  actorType: string;
  entityType: string;
  action: string;
  flag: string;
  cursor: AuditFeedCursor | null;
  limit: number;
}

export interface AuditFeedResult {
  items: AuditFeedItem[];
  nextCursor: AuditFeedCursor | null;
  error: string | null;
}

export interface AuditShellProps {
  isAdmin: boolean;
  initialFeed: AuditFeedItem[];
  initialCursor?: AuditFeedCursor | null;
  initialFeedError?: string | null;
  initialIntegrityStatus?: AuditIntegrityPanelProps["status"] | null;
  initialIntegrityError?: string | null;
  archive?: Pick<AuditArchivePanelProps, "partitions" | "files" | "error">;
  archivePartitions?: AuditArchivePanelProps["partitions"];
  archiveFiles?: AuditArchivePanelProps["files"];
  archiveError?: string | null;
  onLoadFeed?: (filters: AuditFeedFilters) => Promise<AuditFeedResult>;
  onRevealPayload?: AuditDetailPanelProps["onRevealPayload"];
  onVerifyIntegrity?: AuditIntegrityPanelProps["onVerify"];
  onDownloadArchive?: AuditArchivePanelProps["onDownload"];
}

type AuditTab = "verlauf" | "integritaet" | "archiv";

const ENTITY_OPTIONS = [
  { value: "", label: "Alle Entitäten" },
  { value: "weg", label: "WEG" },
  { value: "meeting", label: "Versammlung" },
  { value: "agenda_item", label: "TOP" },
  { value: "resolution", label: "Beschluss" },
  { value: "vote", label: "Stimme" },
  { value: "beschluss_sammlung_entry", label: "Beschluss-Sammlung" },
  { value: "wirtschaftsplan", label: "Wirtschaftsplan" },
  { value: "sollstellung", label: "Sollstellung" },
  { value: "audit_payload_reveal", label: "Payload-Reveal" },
];

const ACTION_OPTIONS = [
  { value: "", label: "Alle Aktionen" },
  { value: "insert", label: "Angelegt" },
  { value: "update", label: "Aktualisiert" },
  { value: "delete", label: "Gelöscht" },
  { value: "reveal", label: "Reveal" },
];

const FLAG_OPTIONS = [
  { value: "", label: "Alle Marker" },
  { value: "service_role", label: "Service Role" },
  { value: "agent", label: "KI" },
  { value: "masked", label: "Maskiert" },
  { value: "integrity_warning", label: "Integrität" },
];

const EMPTY_INTEGRITY_STATUS: NonNullable<
  AuditShellProps["initialIntegrityStatus"]
> = {
  status: "not_checked",
  checked_at: null,
  seq_from: null,
  seq_to: null,
  rows_checked: 0,
  checkpoint: null,
  first_failure: null,
  error_message: null,
};

function emptyFilters(): AuditFeedFilters {
  return {
    query: "",
    from: "",
    to: "",
    actorType: "",
    entityType: "",
    action: "",
    flag: "",
    cursor: null,
    limit: 50,
  };
}

export function AuditShell({
  isAdmin,
  initialFeed,
  initialCursor = null,
  initialFeedError = null,
  initialIntegrityStatus = null,
  initialIntegrityError = null,
  archive = { partitions: [], files: [], error: null },
  archivePartitions,
  archiveFiles,
  archiveError,
  onLoadFeed,
  onRevealPayload,
  onVerifyIntegrity,
  onDownloadArchive,
}: AuditShellProps) {
  const archiveState = {
    partitions: archivePartitions ?? archive.partitions,
    files: archiveFiles ?? archive.files,
    error: archiveError ?? archive.error,
  };
  const [activeTab, setActiveTab] = useState<AuditTab>("verlauf");
  const [filters, setFilters] = useState<AuditFeedFilters>(() => emptyFilters());
  const [items, setItems] = useState<AuditFeedItem[]>(initialFeed);
  const [cursor, setCursor] = useState<AuditFeedCursor | null>(initialCursor);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialFeed[0]?.id ?? null,
  );
  const [feedError, setFeedError] = useState<string | null>(initialFeedError);
  const [isLoading, setIsLoading] = useState(false);

  const tabs = useMemo(
    () =>
      [
        { id: "verlauf" as const, label: "Verlauf" },
        ...(isAdmin
          ? [
              { id: "integritaet" as const, label: "Integrität" },
              { id: "archiv" as const, label: "Archiv" },
            ]
          : []),
      ],
    [isAdmin],
  );

  const visibleItems = useMemo(() => applyLocalFilters(items, filters), [items, filters]);
  const selected = visibleItems.find((item) => item.id === selectedId) ?? null;

  const updateFilter = <K extends keyof AuditFeedFilters>(
    key: K,
    value: AuditFeedFilters[K],
  ) => {
    setFilters((current) => ({ ...current, [key]: value, cursor: null }));
  };

  async function runSearch(nextFilters: AuditFeedFilters = filters) {
    if (!onLoadFeed) return;
    setIsLoading(true);
    setFeedError(null);
    try {
      const result = await onLoadFeed({ ...nextFilters, cursor: null });
      setItems(result.items);
      setCursor(result.nextCursor);
      setSelectedId(result.items[0]?.id ?? null);
      setFeedError(result.error);
    } catch (error) {
      setFeedError(
        error instanceof Error
          ? error.message
          : "Audit-Feed konnte nicht geladen werden.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function loadMore() {
    if (!onLoadFeed || !cursor) return;
    setIsLoading(true);
    setFeedError(null);
    try {
      const result = await onLoadFeed({ ...filters, cursor });
      setItems((current) => [...current, ...result.items]);
      setCursor(result.nextCursor);
      setFeedError(result.error);
    } catch (error) {
      setFeedError(
        error instanceof Error
          ? error.message
          : "Weitere Ereignisse konnten nicht geladen werden.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function resetFilters() {
    const next = emptyFilters();
    setFilters(next);
    void runSearch(next);
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-[color:var(--color-border)]">
        <nav className="flex flex-wrap gap-2" aria-label="Audit-Bereiche">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "rounded-t-md border border-b-0 px-4 py-2 text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "border-[color:var(--color-border)] bg-[color:var(--color-background)] text-[color:var(--color-foreground)]"
                  : "border-transparent text-[color:var(--color-muted-foreground)] hover:bg-[color:var(--color-secondary)]",
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === "verlauf" ? (
        <div className="space-y-6">
          <AuditFilterBar
            filters={filters}
            isLoading={isLoading}
            onApply={() => void runSearch()}
            onReset={resetFilters}
            onUpdate={updateFilter}
          />

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
            <AuditFeed
              items={visibleItems}
              selectedId={selected?.id ?? null}
              isLoading={isLoading && items.length === 0}
              isLoadingMore={isLoading && items.length > 0}
              error={feedError}
              hasMore={cursor !== null}
              onSelect={(item) => setSelectedId(item.id)}
              onLoadMore={onLoadFeed ? () => void loadMore() : undefined}
              onRetry={onLoadFeed ? () => void runSearch() : undefined}
            />
            <AuditDetailPanel
              event={selected}
              canRevealPayload={isAdmin}
              onRevealPayload={onRevealPayload}
            />
          </div>
        </div>
      ) : null}

      {activeTab === "integritaet" && isAdmin ? (
        <AuditIntegrityPanel
          status={initialIntegrityStatus ?? EMPTY_INTEGRITY_STATUS}
          initialError={initialIntegrityError}
          onVerify={onVerifyIntegrity}
        />
      ) : null}

      {activeTab === "archiv" && isAdmin ? (
        <AuditArchivePanel
          partitions={archiveState.partitions}
          files={archiveState.files}
          error={archiveState.error}
          onDownload={onDownloadArchive}
        />
      ) : null}
    </div>
  );
}

function AuditFilterBar({
  filters,
  isLoading,
  onApply,
  onReset,
  onUpdate,
}: {
  filters: AuditFeedFilters;
  isLoading: boolean;
  onApply: () => void;
  onReset: () => void;
  onUpdate: <K extends keyof AuditFeedFilters>(
    key: K,
    value: AuditFeedFilters[K],
  ) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle>Filter</CardTitle>
        <CardDescription>Suche und Eingrenzung für den Audit-Verlauf.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <label className="space-y-1 text-xs font-medium text-[color:var(--color-muted-foreground)] md:col-span-2">
            <span>Suche</span>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[color:var(--color-muted-foreground)]"
                aria-hidden="true"
              />
              <Input
                value={filters.query}
                onChange={(event) => onUpdate("query", event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onApply();
                }}
                className="pl-9"
                placeholder="Ereignis, Entität, Aktion"
              />
            </div>
          </label>

          <FilterInput
            label="Von"
            type="date"
            value={filters.from}
            onChange={(value) => onUpdate("from", value)}
          />
          <FilterInput
            label="Bis"
            type="date"
            value={filters.to}
            onChange={(value) => onUpdate("to", value)}
          />
          <SelectControl
            label="Akteur"
            value={filters.actorType}
            onChange={(value) => onUpdate("actorType", value)}
          >
            <option value="">Alle Akteure</option>
            <option value="user">Verwalter</option>
            <option value="agent">KI-Agent</option>
            <option value="system">System</option>
          </SelectControl>
          <SelectControl
            label="Entität"
            value={filters.entityType}
            onChange={(value) => onUpdate("entityType", value)}
          >
            {ENTITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectControl>
          <SelectControl
            label="Aktion"
            value={filters.action}
            onChange={(value) => onUpdate("action", value)}
          >
            {ACTION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectControl>
          <SelectControl
            label="Marker"
            value={filters.flag}
            onChange={(value) => onUpdate("flag", value)}
          >
            {FLAG_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectControl>
          <div className="flex items-end gap-2 xl:col-span-2">
            <Button type="button" onClick={onApply} disabled={isLoading}>
              Anwenden
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onReset}
              disabled={isLoading}
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              Zurücksetzen
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FilterInput({
  label,
  type = "text",
  value,
  onChange,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1 text-xs font-medium text-[color:var(--color-muted-foreground)]">
      <span>{label}</span>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SelectControl({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1 text-xs font-medium text-[color:var(--color-muted-foreground)]">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="flex h-9 w-full rounded-md border border-[color:var(--color-input)] bg-[color:var(--color-background)] px-3 py-1 text-sm text-[color:var(--color-foreground)] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-background)]"
      >
        {children}
      </select>
    </label>
  );
}

function applyLocalFilters(items: AuditFeedItem[], filters: AuditFeedFilters): AuditFeedItem[] {
  return items.filter((item) => {
    const query = filters.query.trim().toLocaleLowerCase("de-DE");
    const createdAt = item.created_at.slice(0, 10);

    if (query) {
      const haystack = [
        item.summary,
        item.entity_label,
        item.entity_typ,
        item.action,
        item.actor_label,
        item.actor_type,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("de-DE");
      if (!haystack.includes(query)) return false;
    }

    if (filters.from && createdAt < filters.from) return false;
    if (filters.to && createdAt > filters.to) return false;
    if (filters.actorType && item.actor_type !== filters.actorType) return false;
    if (filters.entityType && item.entity_typ !== filters.entityType) return false;
    if (filters.action && item.action !== filters.action) return false;
    if (filters.flag && !item.risk_flags.includes(filters.flag)) return false;

    return true;
  });
}
