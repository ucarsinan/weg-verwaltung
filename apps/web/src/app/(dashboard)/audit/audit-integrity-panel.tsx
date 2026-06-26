"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatAuditDateTime } from "./formatters";

export type AuditIntegrityStatusValue =
  | "not_checked"
  | "intact"
  | "warning"
  | "error";

export interface AuditIntegrityStatus {
  status: AuditIntegrityStatusValue;
  checked_at: string | null;
  seq_from: number | null;
  seq_to: number | null;
  rows_checked: number;
  checkpoint?: unknown;
  first_failure?: unknown;
  error_message?: string | null;
}

export interface AuditIntegrityPanelProps {
  status: AuditIntegrityStatus;
  initialError?: string | null;
  onVerify?: () => Promise<AuditIntegrityStatus>;
}

export function AuditIntegrityPanel({
  status,
  initialError = null,
  onVerify,
}: AuditIntegrityPanelProps) {
  const [currentStatus, setCurrentStatus] = useState(status);
  const [verifyError, setVerifyError] = useState<string | null>(initialError);
  const [isPending, startTransition] = useTransition();
  const meta = statusMeta(currentStatus.status);

  function verify() {
    if (!onVerify) return;
    setVerifyError(null);
    startTransition(async () => {
      try {
        setCurrentStatus(await onVerify());
      } catch (error) {
        setVerifyError(
          error instanceof Error
            ? error.message
            : "Integritätsprüfung konnte nicht abgeschlossen werden.",
        );
      }
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <CardTitle>Integritätsstatus</CardTitle>
              <CardDescription>
                Prüft die vorwärts verkettete Audit-Historie im aktuellen Tenant.
              </CardDescription>
            </div>
            <StatusBadge variant={meta.variant} icon={meta.icon}>
              {meta.label}
            </StatusBadge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Metric label="Letzter Prüflauf" value={formatAuditDateTime(currentStatus.checked_at)} />
            <Metric label="Geprüfte Rows" value={currentStatus.rows_checked.toLocaleString("de-DE")} />
            <Metric
              label="Sequenzspanne"
              value={
                currentStatus.seq_from && currentStatus.seq_to
                  ? `#${currentStatus.seq_from} bis #${currentStatus.seq_to}`
                  : "–"
              }
            />
            <Metric
              label="Checkpoint"
              value={formatCheckpoint(currentStatus.checkpoint)}
            />
          </dl>

          {currentStatus.first_failure || currentStatus.error_message ? (
            <div
              role="alert"
              className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-200"
            >
              {formatFailure(currentStatus.first_failure) ??
                currentStatus.error_message}
            </div>
          ) : null}

          {verifyError ? (
            <div
              role="alert"
              className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-200"
            >
              {verifyError}
            </div>
          ) : null}

          <Button type="button" onClick={verify} disabled={!onVerify || isPending}>
            {isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <ShieldCheck className="size-4" aria-hidden="true" />
            )}
            Integrität prüfen
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Legacy-Hinweis</CardTitle>
          <CardDescription>Grenze der technischen Aussagekraft.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-6 text-[color:var(--color-muted-foreground)]">
          <p>
            Historische Audit-Zeilen vor dem Forward-Repair-Checkpoint werden
            nicht als v2-HMAC-verifiziert dargestellt.
          </p>
          <p>
            Ein grüner Status gilt nur für das geprüfte Forward-Verified-Window
            und ersetzt keine globale Archiv- oder DBA-Forensik.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[color:var(--color-border)] p-3">
      <dt className="text-xs text-[color:var(--color-muted-foreground)]">{label}</dt>
      <dd className="mt-1 break-words font-medium text-[color:var(--color-foreground)]">
        {value}
      </dd>
    </div>
  );
}

function formatCheckpoint(value: unknown): string {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object") return JSON.stringify(value);
  return "Nicht verknüpft";
}

function formatFailure(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (value && typeof value === "object") return JSON.stringify(value);
  return null;
}

function statusMeta(status: AuditIntegrityStatusValue): {
  label: string;
  variant: "neutral" | "success" | "warning" | "danger";
  icon: ReactNode;
} {
  switch (status) {
    case "intact":
      return { label: "Intakt", variant: "success", icon: <CheckCircle2 /> };
    case "warning":
      return { label: "Warnung", variant: "warning", icon: <AlertTriangle /> };
    case "error":
      return { label: "Fehler", variant: "danger", icon: <AlertTriangle /> };
    default:
      return { label: "Nicht geprüft", variant: "neutral", icon: <ShieldCheck /> };
  }
}
