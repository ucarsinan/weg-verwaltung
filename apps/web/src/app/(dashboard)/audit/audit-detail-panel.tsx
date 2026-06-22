"use client";

import { useState, useTransition } from "react";
import { ChevronDown, Eye, FileJson, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  buildAuditSummary,
  buildEventReference,
  formatActionLabel,
  formatActorLabel,
  formatAuditDateTime,
  formatEntityLabel,
  formatJsonPreview,
} from "./formatters";
import type { AuditFeedItem } from "./audit-feed";

export interface AuditDetailPanelProps {
  event: AuditFeedItem | null;
  canRevealPayload: boolean;
  onRevealPayload?: (event: AuditFeedItem) => Promise<unknown>;
}

export function AuditDetailPanel({
  event,
  canRevealPayload,
  onRevealPayload,
}: AuditDetailPanelProps) {
  const [revealedPayload, setRevealedPayload] = useState<{
    eventKey: string;
    payload: unknown;
  } | null>(null);
  const [revealError, setRevealError] = useState<{
    eventKey: string;
    message: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!event) {
    return (
      <Card className="lg:sticky lg:top-6">
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>Wähle ein Ereignis aus dem Verlauf.</CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={<FileJson />}
            title="Kein Ereignis ausgewählt"
            description="Die Detailansicht zeigt Metadaten, maskierten Payload und technische Hash-Werte."
          />
        </CardContent>
      </Card>
    );
  }

  const eventKey = buildEventReference(event);
  const activePayload =
    revealedPayload?.eventKey === eventKey ? revealedPayload.payload : null;
  const activeRevealError =
    revealError?.eventKey === eventKey ? revealError.message : null;
  const payload = activePayload ?? event.payload_masked;
  const revealAllowed = canRevealPayload && event.can_reveal_payload && !!onRevealPayload;

  function revealPayload() {
    if (!event || !onRevealPayload) return;
    setRevealError(null);
    startTransition(async () => {
      try {
        setRevealedPayload({
          eventKey,
          payload: await onRevealPayload(event),
        });
      } catch (error) {
        setRevealError({
          eventKey,
          message:
            error instanceof Error
              ? error.message
              : "Payload konnte nicht vollständig geladen werden.",
        });
      }
    });
  }

  return (
    <Card className="lg:sticky lg:top-6">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <CardTitle className="leading-6">{buildAuditSummary(event)}</CardTitle>
            <CardDescription>
              Referenz {eventKey}
            </CardDescription>
          </div>
          <StatusBadge variant="neutral">Seq #{event.seq}</StatusBadge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <Metadata label="Zeit" value={formatAuditDateTime(event.created_at)} />
          <Metadata
            label="Akteur"
            value={event.actor_label ?? formatActorLabel(event.actor_type)}
          />
          <Metadata label="DB-Rolle" value={event.db_role ?? "–"} />
          <Metadata label="Aktion" value={formatActionLabel(event.action)} />
          <Metadata
            label="Entität"
            value={event.entity_label ?? formatEntityLabel(event.entity_typ)}
          />
          <Metadata label="Entitäts-ID" value={event.entity_id ?? "–"} mono />
        </dl>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-[color:var(--color-foreground)]">
                Payload
              </h3>
              <p className="text-xs text-[color:var(--color-muted-foreground)]">
                Standardmäßig maskiert; vollständige Ansicht nur mit Admin-Recht.
              </p>
            </div>
            {activePayload ? (
              <StatusBadge variant="warning">Vollständig angezeigt</StatusBadge>
            ) : revealAllowed ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={revealPayload}
                disabled={isPending}
              >
                {isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Eye className="size-4" aria-hidden="true" />
                )}
                Vollständig anzeigen
              </Button>
            ) : null}
          </div>

          {activeRevealError ? (
            <p
              role="alert"
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-200"
            >
              {activeRevealError}
            </p>
          ) : null}

          <pre className="max-h-80 overflow-auto rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-secondary)]/40 p-3 text-xs leading-5 text-[color:var(--color-foreground)]">
            {formatJsonPreview(payload, activePayload === null)}
          </pre>
        </section>

        <details className="group rounded-md border border-[color:var(--color-border)]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-medium">
            Technische Details
            <ChevronDown
              className="size-4 transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <dl className="border-t border-[color:var(--color-border)] p-3 text-xs">
            <Metadata label="prev_hash" value={event.prev_hash ?? "–"} mono />
            <Metadata label="row_hash" value={event.row_hash ?? "–"} mono />
            <Metadata
              label="Checkpoint"
              value={event.checkpoint_label ?? "Noch nicht verknüpft"}
            />
            <Metadata label="actor_user_id" value={event.actor_user_id ?? "–"} mono />
          </dl>
        </details>
      </CardContent>
    </Card>
  );
}

function Metadata({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[color:var(--color-muted-foreground)]">{label}</dt>
      <dd
        className={
          mono
            ? "truncate font-mono text-xs text-[color:var(--color-foreground)]"
            : "truncate text-sm text-[color:var(--color-foreground)]"
        }
      >
        {value}
      </dd>
    </div>
  );
}
