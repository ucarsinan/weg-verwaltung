"use server";

import { createClient } from "@/lib/supabase/server";
import { getTenantClaims } from "@/modules/identity";

export type AuditActorType = "user" | "agent" | "system";
export type AuditIntegrityState =
  | "not_checked"
  | "intact"
  | "warning"
  | "error";

export interface ArchiveActionResult {
  success?: boolean;
  error?: string;
}

export interface ArchivablePartition {
  partition_name: string;
  partition_date: string;
}

export interface ArchivedFile {
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

export interface AuditFeedCursor {
  created_at: string;
  seq: number;
}

export interface AuditFeedFilters {
  query?: string;
  from?: string;
  to?: string;
  actorType?: string;
  entityType?: string;
  action?: string;
  flag?: string;
  cursor?: AuditFeedCursor | null;
  limit?: number;
}

export interface AuditFeedItem {
  id: string;
  seq: number;
  created_at: string;
  actor_type: AuditActorType;
  actor_user_id: string | null;
  db_role: string;
  entity_typ: string;
  entity_id: string;
  action: string;
  summary: string;
  entity_label: string;
  actor_label: string;
  risk_flags: string[];
  payload_masked: unknown;
  can_reveal_payload: boolean;
}

export interface AuditFeedResult {
  items: AuditFeedItem[];
  nextCursor: AuditFeedCursor | null;
  error: string | null;
}

export interface AuditIntegrityStatus {
  id: string | null;
  status: AuditIntegrityState;
  checked_at: string | null;
  checked_by: string | null;
  seq_from: number | null;
  seq_to: number | null;
  rows_checked: number;
  checkpoint: unknown;
  first_failure: unknown;
  error_message: string | null;
}

export interface AuditIntegrityResult {
  status: AuditIntegrityStatus | null;
  error: string | null;
}

export interface RevealPayloadResult {
  payload?: unknown;
  error?: string;
}

const PARTITION_NAME_RE = /^audit_event_\d{4}_\d{2}$/;
const ARCHIVE_FILE_RE = /^audit_event_\d{4}_\d{2}\.csv$/;
const DEFAULT_FEED_LIMIT = 50;
const MAX_FEED_LIMIT = 100;
const AUDIT_INTEGRITY_API_UNAVAILABLE_MESSAGE =
  "Audit-Integritätsstatus ist noch nicht verfügbar. Bitte Migration 0050 gegen die Cloud-DB anwenden.";
const AUDIT_INTEGRITY_API_UNAVAILABLE_CODES = new Set([
  "PGRST202", // PostgREST schema cache does not know the RPC yet.
  "42883", // undefined_function
  "42P01", // undefined_table
  "42703", // undefined_column, e.g. partially-applied audit repair migrations.
]);

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function backendErrorDetails(error: unknown): Record<string, string | number> {
  if (!error || typeof error !== "object") {
    return { message: String(error) };
  }

  const record = error as Record<string, unknown>;
  const details: Record<string, string | number> = {};
  for (const key of ["message", "code", "details", "hint", "name", "status"]) {
    const value = record[key];
    if (typeof value === "string" || typeof value === "number") {
      details[key] = value;
    }
  }

  return Object.keys(details).length > 0
    ? details
    : { message: "Backend request failed without structured error details." };
}

function backendErrorText(error: unknown): string {
  if (!error || typeof error !== "object") {
    return String(error);
  }

  const record = error as Record<string, unknown>;
  return ["message", "code", "details", "hint", "name", "status"]
    .map((key) => record[key])
    .filter((value): value is string | number =>
      typeof value === "string" || typeof value === "number",
    )
    .join(" ");
}

function isAuditIntegrityApiUnavailable(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const record = error as Record<string, unknown>;
  const code = typeof record.code === "string" ? record.code : null;
  if (code && AUDIT_INTEGRITY_API_UNAVAILABLE_CODES.has(code)) {
    return true;
  }

  const text = backendErrorText(error).toLowerCase();
  return (
    text.includes("audit_integrity_status") ||
    text.includes("audit_verify_chain") ||
    text.includes("audit_integrity_check") ||
    text.includes("audit_chain_repair_checkpoint")
  );
}

function readMetadata(value: unknown): ArchivedFile["metadata"] {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return {
    size: typeof record.size === "number" ? record.size : undefined,
    mimetype: typeof record.mimetype === "string" ? record.mimetype : undefined,
  };
}

function readRiskFlags(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function normalizeLimit(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_FEED_LIMIT;
  }
  return Math.max(1, Math.min(Math.trunc(value), MAX_FEED_LIMIT));
}

function normalizeText(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeTimestamp(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isAuditActorType(value: string | undefined): value is AuditActorType {
  return value === "user" || value === "agent" || value === "system";
}

function toFeedItem(value: unknown): AuditFeedItem | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const actorTypeValue =
    typeof row.actor_type === "string" ? row.actor_type : undefined;
  const action = row.action;
  const entityType = row.entity_typ;
  if (
    typeof row.id !== "string" ||
    typeof row.seq !== "number" ||
    typeof row.created_at !== "string" ||
    !isAuditActorType(actorTypeValue) ||
    typeof row.db_role !== "string" ||
    typeof entityType !== "string" ||
    typeof row.entity_id !== "string" ||
    typeof action !== "string"
  ) {
    return null;
  }

  return {
    id: row.id,
    seq: row.seq,
    created_at: row.created_at,
    actor_type: actorTypeValue,
    actor_user_id:
      typeof row.actor_user_id === "string" ? row.actor_user_id : null,
    db_role: row.db_role,
    entity_typ: entityType,
    entity_id: row.entity_id,
    action,
    summary: typeof row.summary === "string" ? row.summary : action,
    entity_label:
      typeof row.entity_label === "string" ? row.entity_label : entityType,
    actor_label:
      typeof row.actor_label === "string" ? row.actor_label : actorTypeValue,
    risk_flags: readRiskFlags(row.risk_flags),
    payload_masked: row.payload_masked ?? null,
    can_reveal_payload: row.can_reveal_payload === true,
  };
}

function toIntegrityStatus(value: unknown): AuditIntegrityStatus | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const rawStatus = row.status;
  const status: AuditIntegrityState =
    rawStatus === "intact" ||
    rawStatus === "warning" ||
    rawStatus === "error" ||
    rawStatus === "not_checked"
      ? rawStatus
      : "not_checked";

  return {
    id: typeof row.id === "string" ? row.id : null,
    status,
    checked_at: typeof row.checked_at === "string" ? row.checked_at : null,
    checked_by: typeof row.checked_by === "string" ? row.checked_by : null,
    seq_from: typeof row.seq_from === "number" ? row.seq_from : null,
    seq_to: typeof row.seq_to === "number" ? row.seq_to : null,
    rows_checked:
      typeof row.rows_checked === "number" ? row.rows_checked : 0,
    checkpoint: row.checkpoint ?? null,
    first_failure: row.first_failure ?? null,
    error_message:
      typeof row.error_message === "string" ? row.error_message : null,
  };
}

function defaultIntegrityStatus(): AuditIntegrityStatus {
  return {
    id: null,
    status: "not_checked",
    checked_at: null,
    checked_by: null,
    seq_from: null,
    seq_to: null,
    rows_checked: 0,
    checkpoint: null,
    first_failure: null,
    error_message: null,
  };
}

// Gets tenant_id and role from JWT claims
async function getAuthContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Nicht angemeldet.");
  }

  const { claims } = await getTenantClaims(supabase);

  return {
    user,
    tenantId: claims.tenantId ?? undefined,
    role: claims.role ?? undefined,
    supabase,
  };
}

export async function getAuditFeedAction(
  filters: AuditFeedFilters = {},
): Promise<AuditFeedResult> {
  try {
    const { supabase } = await getAuthContext();
    const limit = normalizeLimit(filters.limit);
    // RPC-Signaturen kommen aus dem Overwrite-Layer in database.types.ts
    // (Migration 0050) — kein any-Cast mehr nötig.
    const { data, error } = await supabase.rpc("audit_event_feed", {
      p_from: normalizeTimestamp(filters.from),
      p_to: normalizeTimestamp(filters.to),
      p_actor_type: isAuditActorType(filters.actorType)
        ? filters.actorType
        : null,
      p_entity_typ: normalizeText(filters.entityType),
      p_action: normalizeText(filters.action),
      p_query: normalizeText(filters.query),
      p_flag: normalizeText(filters.flag),
      p_cursor_created_at: filters.cursor?.created_at ?? null,
      p_cursor_seq: filters.cursor?.seq ?? null,
      p_limit: limit + 1,
    });

    if (error) {
      console.warn("[getAuditFeedAction] failed:", backendErrorDetails(error));
      return {
        items: [],
        nextCursor: null,
        error: "Audit-Verlauf konnte nicht geladen werden.",
      };
    }

    const items = (Array.isArray(data) ? data : [])
      .map(toFeedItem)
      .filter((item): item is AuditFeedItem => item !== null);
    const visibleItems = items.slice(0, limit);
    const lastItem = visibleItems.at(-1);

    return {
      items: visibleItems,
      nextCursor:
        items.length > limit && lastItem
          ? { created_at: lastItem.created_at, seq: lastItem.seq }
          : null,
      error: null,
    };
  } catch (err: unknown) {
    console.error("[getAuditFeedAction] exception:", err);
    return {
      items: [],
      nextCursor: null,
      error: errorMessage(err, "Unerwarteter Fehler beim Laden des Audits."),
    };
  }
}

export async function revealAuditPayloadAction(
  eventId: string,
  createdAt: string,
): Promise<RevealPayloadResult> {
  if (!eventId || !createdAt) {
    return { error: "Audit-Eintrag ist unvollständig." };
  }

  try {
    const { supabase, role } = await getAuthContext();
    if (role !== "tenant_admin") {
      return { error: "Nicht autorisiert." };
    }

    const { data, error } = await supabase.rpc("audit_reveal_event_payload", {
      p_event_id: eventId,
      p_created_at: createdAt,
    });

    if (error) {
      console.warn(
        "[revealAuditPayloadAction] failed:",
        backendErrorDetails(error),
      );
      return { error: "Payload konnte nicht vollständig angezeigt werden." };
    }

    return { payload: data };
  } catch (err: unknown) {
    console.error("[revealAuditPayloadAction] exception:", err);
    return {
      error: errorMessage(err, "Unerwarteter Fehler beim Anzeigen des Payloads."),
    };
  }
}

export async function getIntegrityStatusAction(): Promise<AuditIntegrityResult> {
  try {
    const { supabase, role } = await getAuthContext();
    if (role !== "tenant_admin") {
      return { status: null, error: "Nicht autorisiert." };
    }

    const { data, error } = await supabase.rpc("audit_integrity_status");
    if (error) {
      if (isAuditIntegrityApiUnavailable(error)) {
        return {
          status: defaultIntegrityStatus(),
          error: AUDIT_INTEGRITY_API_UNAVAILABLE_MESSAGE,
        };
      }

      console.warn(
        "[getIntegrityStatusAction] failed:",
        backendErrorDetails(error),
      );
      return {
        status: null,
        error: "Integritätsstatus konnte nicht geladen werden.",
      };
    }

    const status = Array.isArray(data)
      ? toIntegrityStatus(data[0])
      : toIntegrityStatus(data);

    return {
      status: status ?? defaultIntegrityStatus(),
      error: null,
    };
  } catch (err: unknown) {
    console.error("[getIntegrityStatusAction] exception:", err);
    return {
      status: null,
      error: errorMessage(
        err,
        "Unerwarteter Fehler beim Laden des Integritätsstatus.",
      ),
    };
  }
}

export async function verifyAuditIntegrityAction(): Promise<AuditIntegrityResult> {
  try {
    const { supabase, role } = await getAuthContext();
    if (role !== "tenant_admin") {
      return { status: null, error: "Nicht autorisiert." };
    }

    const { data, error } = await supabase.rpc("audit_verify_chain");
    if (error) {
      if (isAuditIntegrityApiUnavailable(error)) {
        return {
          status: null,
          error: AUDIT_INTEGRITY_API_UNAVAILABLE_MESSAGE,
        };
      }

      console.warn(
        "[verifyAuditIntegrityAction] failed:",
        backendErrorDetails(error),
      );
      return {
        status: null,
        error: "Integritätsprüfung konnte nicht abgeschlossen werden.",
      };
    }

    const status = Array.isArray(data)
      ? toIntegrityStatus(data[0])
      : toIntegrityStatus(data);
    return {
      status,
      error: status ? null : "Integritätsprüfung lieferte kein Ergebnis.",
    };
  } catch (err: unknown) {
    console.error("[verifyAuditIntegrityAction] exception:", err);
    return {
      status: null,
      error: errorMessage(
        err,
        "Unerwarteter Fehler bei der Integritätsprüfung.",
      ),
    };
  }
}

export async function getArchivablePartitionsAction(): Promise<{
  partitions: ArchivablePartition[];
  error: string | null;
}> {
  try {
    const { supabase, role } = await getAuthContext();
    if (role !== "tenant_admin") {
      return { partitions: [], error: "Nicht autorisiert." };
    }

    const { data, error } = await supabase.rpc("get_archivable_partitions");
    if (error) {
      console.warn(
        "[getArchivablePartitionsAction] failed:",
        backendErrorDetails(error),
      );
      return {
        partitions: [],
        error: "Fehler beim Laden der archivierbaren Partitionen.",
      };
    }

    return {
      partitions: Array.isArray(data) ? (data as ArchivablePartition[]) : [],
      error: null,
    };
  } catch (err: unknown) {
    console.error("[getArchivablePartitionsAction] exception:", err);
    return {
      partitions: [],
      error: errorMessage(err, "Unerwarteter Fehler."),
    };
  }
}

export async function archivePartitionAction(partitionName: string): Promise<ArchiveActionResult> {
  if (!partitionName || !PARTITION_NAME_RE.test(partitionName)) {
    return { error: "Ungültiger Partitionsname." };
  }

  try {
    const { tenantId, role } = await getAuthContext();
    if (role !== "tenant_admin") {
      return { error: "Nicht autorisiert. Nur Mandanten-Administratoren können Archive anlegen." };
    }
    if (!tenantId) {
      return { error: "Keine Mandanten-ID im Token gefunden." };
    }

    console.warn("[archivePartitionAction] disabled unsafe archive request", {
      partitionName,
      tenantId,
    });
    return {
      error:
        "Archivierung ist vorübergehend deaktiviert: Audit-Partitionen sind mandantenübergreifend und dürfen erst nach einem systemweiten Export-/Detach-Job gelöscht werden.",
    };
  } catch (err: unknown) {
    console.error("[archivePartitionAction] exception:", err);
    return {
      error: errorMessage(err, "Unerwarteter Fehler beim Archivieren."),
    };
  }
}

export async function getArchivedFilesAction(): Promise<{
  files: ArchivedFile[];
  error: string | null;
}> {
  try {
    const { supabase, tenantId, role } = await getAuthContext();
    if (role !== "tenant_admin") {
      return { files: [], error: "Nicht autorisiert." };
    }
    if (!tenantId) {
      return { files: [], error: "Keine Mandanten-ID gefunden." };
    }

    // List all files inside the tenant's folder in the bucket
    const { data: files, error } = await supabase.storage
      .from("audit-archives")
      .list(tenantId, {
        limit: 100,
        sortBy: { column: "name", order: "desc" },
      });

    if (error) {
      console.warn(
        "[getArchivedFilesAction] storage list failed:",
        backendErrorDetails(error),
      );
      return { files: [], error: "Fehler beim Laden der archivierten Dateien." };
    }

    const visibleFiles: ArchivedFile[] = (files ?? [])
      .filter(
        (file) =>
          file.name !== ".emptyFolderPlaceholder" &&
          ARCHIVE_FILE_RE.test(file.name),
      )
      .map((file) => ({
        name: file.name,
        id: file.id ?? null,
        created_at: file.created_at ?? null,
        updated_at: file.updated_at ?? null,
        last_accessed_at: file.last_accessed_at ?? null,
        metadata: readMetadata(file.metadata),
      }));

    return { files: visibleFiles, error: null };
  } catch (err: unknown) {
    console.error("[getArchivedFilesAction] exception:", err);
    return {
      files: [],
      error: errorMessage(err, "Unerwarteter Fehler."),
    };
  }
}

export async function getDownloadUrlAction(
  fileName: string,
): Promise<{ signedUrl?: string; error?: string }> {
  if (!ARCHIVE_FILE_RE.test(fileName)) {
    return { error: "Ungültiger Archiv-Dateiname." };
  }

  try {
    const { supabase, tenantId, role } = await getAuthContext();
    if (role !== "tenant_admin") {
      throw new Error("Nicht autorisiert.");
    }
    if (!tenantId) {
      throw new Error("Keine Mandanten-ID gefunden.");
    }

    const { data, error } = await supabase.storage
      .from("audit-archives")
      .createSignedUrl(`${tenantId}/${fileName}`, 60 * 15); // 15 mins expiry

    if (error || !data) {
      console.warn(
        "[getDownloadUrlAction] failed to create signed URL:",
        backendErrorDetails(error),
      );
      throw new Error("Download-Link konnte nicht generiert werden.");
    }

    return { signedUrl: data.signedUrl };
  } catch (err: unknown) {
    console.error("[getDownloadUrlAction] exception:", err);
    return {
      error: errorMessage(err, "Fehler beim Generieren des Download-Links."),
    };
  }
}
