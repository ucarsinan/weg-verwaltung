"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  archivePartitionAction,
  getDownloadUrlAction,
  type ArchivablePartition,
  type ArchivedFile,
} from "./actions";

interface AuditManagerProps {
  initialPartitions: ArchivablePartition[];
  initialFiles: ArchivedFile[];
}

export default function AuditManager({
  initialPartitions,
  initialFiles,
}: AuditManagerProps) {
  const [partitions, setPartitions] =
    useState<ArchivablePartition[]>(initialPartitions);
  const [files] = useState<ArchivedFile[]>(initialFiles);
  const [isArchiving, setIsArchiving] = useState<Record<string, boolean>>({});
  const [isDownloading, setIsDownloading] = useState<Record<string, boolean>>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleArchive = async (partitionName: string) => {
    setIsArchiving((prev) => ({ ...prev, [partitionName]: true }));
    setStatusMessage("Archivierung gestartet...");
    setErrorMessage(null);

    try {
      const result = await archivePartitionAction(partitionName);
      if (result.error) {
        setErrorMessage(result.error);
        setStatusMessage(null);
        return;
      }

      setPartitions((prev) =>
        prev.filter((p) => p.partition_name !== partitionName),
      );
      setStatusMessage("Archivierung erfolgreich abgeschlossen.");
    } catch (err: unknown) {
      console.error(err);
      setErrorMessage(
        err instanceof Error ? err.message : "Archivierung fehlgeschlagen.",
      );
      setStatusMessage(null);
    } finally {
      setIsArchiving((prev) => ({ ...prev, [partitionName]: false }));
    }
  };

  const handleDownload = async (fileName: string) => {
    setIsDownloading((prev) => ({ ...prev, [fileName]: true }));
    setErrorMessage(null);

    try {
      const result = await getDownloadUrlAction(fileName);
      if (result.error || !result.signedUrl) {
        setErrorMessage(result.error ?? "Download-Link konnte nicht erzeugt werden.");
        return;
      }

      window.location.assign(result.signedUrl);
    } catch (err: unknown) {
      console.error(err);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Download-Link konnte nicht erzeugt werden.",
      );
    } finally {
      setIsDownloading((prev) => ({ ...prev, [fileName]: false }));
    }
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* ────────────────── Archivierbare Partitionen ────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Archivierbare Partitionen</CardTitle>
          <CardDescription>
            System-Partitionen, die älter als 24 Monate sind.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {statusMessage && (
            <div role="status" className="rounded-md bg-blue-50 dark:bg-blue-950 p-3 text-xs text-blue-700 dark:text-blue-300">
              {statusMessage}
            </div>
          )}
          {errorMessage && (
            <div role="alert" className="rounded-md bg-red-50 dark:bg-red-950 p-3 text-xs text-red-700 dark:text-red-300">
              {errorMessage}
            </div>
          )}

          {partitions.length === 0 ? (
            <p className="text-sm text-[color:var(--color-muted-foreground)] py-4 text-center">
              Keine archivierbaren Partitionen vorhanden.
            </p>
          ) : (
            <ul className="divide-y divide-[color:var(--color-border)]">
              {partitions.map((p) => (
                <li
                  key={p.partition_name}
                  className="flex items-center justify-between py-3"
                >
                  <div>
                    <p className="text-sm font-medium">{p.partition_name}</p>
                    <p className="text-xs text-[color:var(--color-muted-foreground)]">
                      Monat: {p.partition_date}
                    </p>
                  </div>
                  <Button
                    onClick={() => handleArchive(p.partition_name)}
                    disabled={isArchiving[p.partition_name]}
                    size="sm"
                  >
                    {isArchiving[p.partition_name] ? "Wird archiviert..." : "Archivieren"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ────────────────── Archivierte Dateien ────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Archivierte Dateien</CardTitle>
          <CardDescription>
            Als CSV exportierte und gesicherte Partitionen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {files.length === 0 ? (
            <p className="text-sm text-[color:var(--color-muted-foreground)] py-4 text-center">
              Keine archivierten Dateien vorhanden.
            </p>
          ) : (
            <ul className="divide-y divide-[color:var(--color-border)]">
              {files.map((f) => (
                <li key={f.name} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium">{f.name}</p>
                    <p className="text-xs text-[color:var(--color-muted-foreground)]">
                      Größe: {formatSize(f.metadata?.size)} | Erstellt:{" "}
                      {f.created_at
                        ? new Date(f.created_at).toLocaleDateString("de-DE")
                        : "—"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isDownloading[f.name]}
                    onClick={() => handleDownload(f.name)}
                  >
                    {isDownloading[f.name] ? "Wird geladen..." : "Herunterladen"}
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
