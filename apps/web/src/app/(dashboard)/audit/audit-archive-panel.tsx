"use client";

import { useState } from "react";
import { Download, FolderArchive } from "lucide-react";

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
import { formatAuditDateTime, formatBytes } from "./formatters";

export interface AuditArchivablePartition {
  partition_name: string;
  partition_date: string;
}

export interface AuditArchivedFile {
  name: string;
  id: string | null;
  created_at: string | null;
  updated_at: string | null;
  last_accessed_at: string | null;
  metadata: {
    size?: number;
    mimetype?: string;
  } | null;
}

export interface AuditArchivePanelProps {
  partitions: AuditArchivablePartition[];
  files: AuditArchivedFile[];
  error?: string | null;
  onDownload?: (
    fileName: string,
  ) => Promise<{ signedUrl?: string; error?: string }>;
}

export function AuditArchivePanel({
  partitions,
  files,
  error,
  onDownload,
}: AuditArchivePanelProps) {
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<string | null>(null);

  async function download(fileName: string) {
    if (!onDownload) return;
    setDownloadError(null);
    setPendingFile(fileName);
    const result = await onDownload(fileName);
    setPendingFile(null);
    if (result.error || !result.signedUrl) {
      setDownloadError(result.error ?? "Download-Link konnte nicht erzeugt werden.");
      return;
    }
    window.location.assign(result.signedUrl);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Archivstatus</CardTitle>
          <CardDescription>
            Audit bleibt 24 Monate heiß; ältere Partitionen werden ausschließlich
            durch einen privilegierten Systemjob exportiert und verifiziert.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <StatusBadge variant="info">Read-only</StatusBadge>
          <p className="text-sm leading-6 text-[color:var(--color-muted-foreground)]">
            Die Tenant-Oberfläche löst kein Detach, Drop oder mandantenweites
            Archivieren aus. Sie zeigt nur Kandidaten, vorhandene Exporte und
            Fehlerzustände.
          </p>
          {error ? (
            <div
              role="alert"
              className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-200"
            >
              {error}
            </div>
          ) : null}
          {downloadError ? (
            <div
              role="alert"
              className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-200"
            >
              {downloadError}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Archivierbare Partitionen</CardTitle>
          <CardDescription>Systemkandidaten ohne UI-Aktion.</CardDescription>
        </CardHeader>
        <CardContent>
          {partitions.length === 0 ? (
            <EmptyState
              icon={<FolderArchive />}
              title="Keine Kandidaten"
              description="Aktuell sind keine archivierbaren Partitionen sichtbar."
            />
          ) : (
            <ul className="divide-y divide-[color:var(--color-border)]">
              {partitions.map((partition) => (
                <li
                  key={partition.partition_name}
                  className="flex items-center justify-between gap-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {partition.partition_name}
                    </p>
                    <p className="text-xs text-[color:var(--color-muted-foreground)]">
                      Monat: {partition.partition_date}
                    </p>
                  </div>
                  <StatusBadge variant="neutral">Kandidat</StatusBadge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Archivierte Dateien</CardTitle>
          <CardDescription>Exportierte CSV-Dateien im Audit-Bucket.</CardDescription>
        </CardHeader>
        <CardContent>
          {files.length === 0 ? (
            <EmptyState
              icon={<FolderArchive />}
              title="Keine Exporte"
              description="Es sind noch keine Archivdateien für diesen Tenant gelistet."
            />
          ) : (
            <ul className="divide-y divide-[color:var(--color-border)]">
              {files.map((file) => (
                <li key={file.name} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-[color:var(--color-muted-foreground)]">
                      {formatBytes(file.metadata?.size)} · Erstellt{" "}
                      {formatAuditDateTime(file.created_at)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!onDownload}
                    onClick={() => void download(file.name)}
                    aria-label={`${file.name} herunterladen`}
                  >
                    <Download className="size-4" aria-hidden="true" />
                    {pendingFile === file.name ? "Lädt..." : "Download"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
