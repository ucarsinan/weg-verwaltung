"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Inbox, Link2, Search, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { EntityList, EntityListItem } from "@/components/ui/entity-list";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  formatDateTime,
  formatInboxChannel,
  formatInboxStatus,
  formatPriority,
} from "@/lib/vorgangszentrale/formatters";
import type {
  InboxItem,
  VorgangListItem,
} from "@/lib/vorgangszentrale/types";

type ActionResult = { error?: string; id?: string };
type IdAction = (id: string) => Promise<ActionResult>;
type FormAction = (id: string, formData: FormData) => Promise<ActionResult>;

interface InboxTriageProps {
  items: InboxItem[];
  candidateVorgaenge: VorgangListItem[];
  classifyAction: IdAction;
  dismissAction: IdAction;
  linkAction: FormAction;
  convertAction: FormAction;
  emptyIcon?: ReactNode;
}

export function InboxTriage({
  items,
  candidateVorgaenge,
  classifyAction,
  dismissAction,
  linkAction,
  convertAction,
  emptyIcon,
}: InboxTriageProps) {
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id ?? null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter((item) =>
      [item.subject, item.bodyPreview, item.wegName, item.channel]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(normalized)),
    );
  }, [items, query]);
  const selected =
    visibleItems.find((item) => item.id === selectedId) ??
    visibleItems[0] ??
    null;

  function run(action: () => Promise<ActionResult>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
    });
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={emptyIcon ?? <Inbox />}
        title="Keine Inbox-Einträge"
        description="Neue Eingänge erscheinen hier, sobald sie durch Upload, Portal, manuelle Erfassung oder Systemereignis entstehen."
      />
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
      <div className="space-y-4">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[color:var(--color-muted-foreground)]"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Inbox durchsuchen"
            className="pl-9"
            aria-label="Inbox durchsuchen"
          />
        </div>

        <EntityList aria-label="Inbox-Einträge">
          {visibleItems.map((item) => (
            <EntityListItem
              key={item.id}
              className={item.id === selected?.id ? "bg-[color:var(--color-secondary)]" : undefined}
              leading={<Inbox className="size-4" aria-hidden="true" />}
              title={
                <button
                  type="button"
                  className="text-left underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)]"
                  onClick={() => setSelectedId(item.id)}
                >
                  {item.subject}
                </button>
              }
              description={item.bodyPreview ?? "Keine Vorschau gespeichert."}
              badges={
                <>
                  <StatusBadge variant={item.status === "failed" ? "danger" : "info"}>
                    {formatInboxStatus(item.status)}
                  </StatusBadge>
                  <StatusBadge variant="neutral">
                    {formatInboxChannel(item.channel)}
                  </StatusBadge>
                </>
              }
              meta={
                <>
                  <span>{item.wegName ?? (item.wegId ? "WEG ohne Namen" : "Tenant-weit")}</span>
                  <span>{formatDateTime(item.receivedAt ?? item.createdAt)}</span>
                </>
              }
              actions={
                <Button type="button" variant="outline" size="sm" onClick={() => setSelectedId(item.id)}>
                  Prüfen
                </Button>
              }
            />
          ))}
        </EntityList>
      </div>

      <aside className="h-fit rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-card)] shadow-sm">
        {selected ? (
          <div className="space-y-5 p-5">
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                <StatusBadge variant="info">{formatInboxStatus(selected.status)}</StatusBadge>
                <StatusBadge variant="neutral">{formatInboxChannel(selected.channel)}</StatusBadge>
              </div>
              <h2 className="text-lg font-semibold">{selected.subject}</h2>
              <p className="text-sm leading-6 text-[color:var(--color-muted-foreground)]">
                {selected.bodyPreview ?? "Keine Rohdatenvorschau hinterlegt."}
              </p>
            </div>

            {error ? (
              <p
                role="alert"
                className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-200"
              >
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={isPending || selected.status !== "new"}
                onClick={() => run(() => classifyAction(selected.id))}
              >
                <CheckCircle2 className="size-4" aria-hidden="true" />
                Klassifizieren
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => run(() => dismissAction(selected.id))}
              >
                <XCircle className="size-4" aria-hidden="true" />
                Verwerfen
              </Button>
            </div>

            <form
              className="space-y-3 rounded-md border border-[color:var(--color-border)] p-3"
              action={(formData) => run(() => linkAction(selected.id, formData))}
            >
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="vorgang_id">
                  Mit bestehendem Vorgang verknüpfen
                </label>
                <select
                  id="vorgang_id"
                  name="vorgang_id"
                  required
                  className="h-9 w-full rounded-md border border-[color:var(--color-input)] bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)]"
                >
                  <option value="">Vorgang wählen</option>
                  {candidateVorgaenge.map((vorgang) => (
                    <option key={vorgang.id} value={vorgang.id}>
                      {vorgang.title}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" variant="outline" size="sm" disabled={isPending}>
                <Link2 className="size-4" aria-hidden="true" />
                Verknüpfen
              </Button>
            </form>

            <form
              className="space-y-3 rounded-md border border-[color:var(--color-border)] p-3"
              action={(formData) => run(() => convertAction(selected.id, formData))}
            >
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="title">
                  Neuen Vorgang anlegen
                </label>
                <Input id="title" name="title" defaultValue={selected.subject} required />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm font-medium">
                  Typ
                  <Input name="typ" defaultValue="eigentuemeranfrage" />
                </label>
                <label className="space-y-1 text-sm font-medium">
                  Priorität
                  <select
                    name="priority"
                    defaultValue="normal"
                    className="h-9 w-full rounded-md border border-[color:var(--color-input)] bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)]"
                  >
                    {(["low", "normal", "high", "urgent"] as const).map((priority) => (
                      <option key={priority} value={priority}>
                        {formatPriority(priority)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {selected.wegId ? <input type="hidden" name="weg_id" value={selected.wegId} /> : null}
              <Button type="submit" size="sm" disabled={isPending}>
                Vorgang erstellen
              </Button>
            </form>

            <p className="flex gap-2 text-xs leading-5 text-[color:var(--color-muted-foreground)]">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Konvertierung setzt Sichtbarkeit immer auf intern. Externe Veröffentlichung bleibt ein separater Review-Schritt.
            </p>
          </div>
        ) : (
          <EmptyState
            icon={<Inbox />}
            title="Kein Eintrag ausgewählt"
            description="Wähle einen Inbox-Eintrag zur Triage."
            className="m-5"
          />
        )}
      </aside>
    </div>
  );
}
