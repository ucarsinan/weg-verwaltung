import { createClient } from "@/lib/supabase/server";
import type {
  ConfidenceLabel,
  InboxChannel,
  InboxItem,
  InboxStatus,
  QueryResult,
  ReviewItem,
  ReviewStatus,
  TaskStatus,
  VisibilityState,
  VorgangDashboardMetrics,
  VorgangDetail,
  VorgangListItem,
  VorgangPriority,
  VorgangRelationItem,
  VorgangStatus,
  VorgangTaskItem,
  VorgangTimelineItem,
} from "./types";

const DEFAULT_LIMIT = 100;
const REVIEW_TYPES = [
  "vorgang_triage",
  "antwort_entwurf",
  "frist_vorschlag",
  "dokument_metadaten_vorschlag",
  "tool_action_proposal",
  "rag_answer",
  "blocked_proposal",
];

type QueryError = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

type NormalizedQueryError = Required<QueryError>;

type QueryResponse<T> = {
  data: T | null;
  error: QueryError | null;
};

interface SelectQuery<T> extends PromiseLike<QueryResponse<T>> {
  select(columns?: string): SelectQuery<T>;
  eq(column: string, value: unknown): SelectQuery<T>;
  in(column: string, values: readonly unknown[]): SelectQuery<T>;
  order(column: string, options?: { ascending?: boolean }): SelectQuery<T>;
  limit(count: number): SelectQuery<T>;
}

interface QueryClient {
  from(table: string): SelectQuery<unknown[]>;
}

interface ListVorgaengeOptions {
  limit?: number;
  statuses?: VorgangStatus[];
}

export async function listVorgaenge(
  options: ListVorgaengeOptions = {},
): Promise<QueryResult<VorgangListItem[]>> {
  const supabase = await createClient();
  let query = client(supabase)
    .from("vorgang")
    .select(
      "id, weg_id, title, typ, status, priority, visibility_state, assigned_to, due_at, created_at, updated_at",
    )
    .order("updated_at", { ascending: false })
    .limit(options.limit ?? DEFAULT_LIMIT);

  if (options.statuses && options.statuses.length > 0) {
    query = query.in("status", options.statuses);
  }

  const result = await query;
  if (result.error) {
    logQueryError("listVorgaenge", result.error);
    return { data: [], error: userFacingQueryError(result.error) };
  }

  const rows = arrayFrom(result.data).map(toVorgangListItem).filter(isPresent);
  const [wegNames, taskCounts, suggestionVorgangIds, lastActivity] =
    await Promise.all([
      fetchWegNames(supabase, rows.map((row) => row.wegId)),
      fetchOpenTaskCounts(supabase, rows.map((row) => row.id)),
      fetchSuggestionVorgangIds(supabase),
      fetchLastActivity(supabase, rows.map((row) => row.id)),
    ]);

  return {
    data: rows.map((row) => ({
      ...row,
      wegName: row.wegId ? (wegNames.get(row.wegId) ?? null) : null,
      hasKiSuggestion: suggestionVorgangIds.has(row.id),
      openTaskCount: taskCounts.get(row.id) ?? 0,
      lastActivityAt: lastActivity.get(row.id) ?? row.updatedAt,
    })),
    error: null,
  };
}

export async function getVorgangDashboardMetrics(): Promise<
  QueryResult<VorgangDashboardMetrics>
> {
  const [vorgaenge, inbox] = await Promise.all([
    listVorgaenge({ limit: DEFAULT_LIMIT }),
    listInboxItems({ statuses: ["new"], limit: DEFAULT_LIMIT }),
  ]);
  const today = startOfDay(new Date()).getTime();

  return {
    data: {
      open: vorgaenge.data.filter((item) => isOpenStatus(item.status)).length,
      overdue: vorgaenge.data.filter((item) => {
        if (!item.dueAt || !isOpenStatus(item.status)) return false;
        return startOfDay(new Date(item.dueAt)).getTime() < today;
      }).length,
      dueToday: vorgaenge.data.filter((item) => {
        if (!item.dueAt || !isOpenStatus(item.status)) return false;
        return startOfDay(new Date(item.dueAt)).getTime() === today;
      }).length,
      reviewRequired: vorgaenge.data.filter(
        (item) => item.status === "review_required" || item.hasKiSuggestion,
      ).length,
      inboxNew: inbox.data.length,
    },
    error: vorgaenge.error ?? inbox.error,
  };
}

export async function getVorgangDetail(
  vorgangId: string,
): Promise<QueryResult<VorgangDetail | null>> {
  const supabase = await createClient();
  const result = await client(supabase)
    .from("vorgang")
    .select(
      "id, weg_id, title, typ, status, priority, visibility_state, assigned_to, due_at, created_at, updated_at",
    )
    .eq("id", vorgangId)
    .limit(1);

  if (result.error) {
    logQueryError("getVorgangDetail", result.error);
    return { data: null, error: userFacingQueryError(result.error) };
  }

  const item = arrayFrom(result.data).map(toVorgangListItem).filter(isPresent)[0];
  if (!item) return { data: null, error: null };

  const [wegNames, tasks, timeline, reviews, relations] = await Promise.all([
    fetchWegNames(supabase, [item.wegId]),
    listVorgangTasks(vorgangId),
    listVorgangTimeline(vorgangId),
    listReviewItems({ vorgangId, includeDecided: true }),
    listVorgangRelations(vorgangId),
  ]);

  return {
    data: {
      ...item,
      wegName: item.wegId ? (wegNames.get(item.wegId) ?? null) : null,
      lastActivityAt: timeline.data[0]?.createdAt ?? item.updatedAt,
      hasKiSuggestion: reviews.data.some((review) => review.status === "vorschlag"),
      openTaskCount: tasks.data.filter((task) => task.status !== "done").length,
      tasks: tasks.data,
      timeline: timeline.data,
      reviews: reviews.data,
      relations: relations.data,
    },
    error: tasks.error ?? timeline.error ?? reviews.error ?? relations.error,
  };
}

export async function listInboxItems(
  options: { statuses?: InboxStatus[]; limit?: number } = {},
): Promise<QueryResult<InboxItem[]>> {
  const supabase = await createClient();
  let query = client(supabase)
    .from("vorgang_inbox_item")
    .select(
      "id, weg_id, vorgang_id, channel, status, subject, body_preview, source_metadata, received_at, created_at, updated_at",
    )
    .order("received_at", { ascending: false })
    .limit(options.limit ?? DEFAULT_LIMIT);

  if (options.statuses && options.statuses.length > 0) {
    query = query.in("status", options.statuses);
  }

  const result = await query;
  if (result.error) {
    logQueryError("listInboxItems", result.error);
    return { data: [], error: userFacingQueryError(result.error) };
  }

  const rows = arrayFrom(result.data).map(toInboxItem).filter(isPresent);
  const wegNames = await fetchWegNames(supabase, rows.map((row) => row.wegId));

  return {
    data: rows.map((row) => ({
      ...row,
      wegName: row.wegId ? (wegNames.get(row.wegId) ?? null) : null,
    })),
    error: null,
  };
}

export async function listReviewItems(
  options: { vorgangId?: string; includeDecided?: boolean; limit?: number } = {},
): Promise<QueryResult<ReviewItem[]>> {
  const supabase = await createClient();
  let result = await queryReviewItems(supabase, options, { includeVorgangColumn: true });
  if (result.error && isMissingAgentSuggestionVorgangColumnError(result.error)) {
    logQueryError("listReviewItems", result.error);
    result = await queryReviewItems(supabase, options, { includeVorgangColumn: false });
  }

  if (result.error) {
    logQueryError("listReviewItems", result.error);
    return { data: [], error: userFacingQueryError(result.error) };
  }

  const rows = arrayFrom(result.data)
    .map(toReviewItem)
    .filter(isPresent)
    .filter((row) => !options.vorgangId || row.vorgangId === options.vorgangId);
  const wegNames = await fetchWegNames(supabase, rows.map((row) => row.wegId));

  return {
    data: rows.map((row) => ({
      ...row,
      wegName: row.wegId ? (wegNames.get(row.wegId) ?? null) : null,
    })),
    error: null,
  };
}

export async function listVorgangTimeline(
  vorgangId: string,
): Promise<QueryResult<VorgangTimelineItem[]>> {
  const result = await client(await createClient())
    .from("vorgang_timeline_event")
    .select(
      "id, vorgang_id, event_type, actor_type, actor_user_id, visibility, summary, payload, created_at",
    )
    .eq("vorgang_id", vorgangId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (result.error) {
    logQueryError("listVorgangTimeline", result.error);
    return { data: [], error: userFacingQueryError(result.error) };
  }

  return {
    data: arrayFrom(result.data).map(toTimelineItem).filter(isPresent),
    error: null,
  };
}

export async function listVorgangTasks(
  vorgangId: string,
): Promise<QueryResult<VorgangTaskItem[]>> {
  const result = await client(await createClient())
    .from("vorgang_task")
    .select(
      "id, vorgang_id, title, description, status, assigned_to, due_at, completed_at, created_at, updated_at",
    )
    .eq("vorgang_id", vorgangId)
    .order("due_at", { ascending: true })
    .limit(100);

  if (result.error) {
    logQueryError("listVorgangTasks", result.error);
    return { data: [], error: userFacingQueryError(result.error) };
  }

  return {
    data: arrayFrom(result.data).map(toTaskItem).filter(isPresent),
    error: null,
  };
}

export async function listVorgangRelations(
  vorgangId: string,
): Promise<QueryResult<VorgangRelationItem[]>> {
  const result = await client(await createClient())
    .from("vorgang_relation")
    .select("id, relation_type, relation_id, label, created_at")
    .eq("vorgang_id", vorgangId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (result.error) {
    logQueryError("listVorgangRelations", result.error);
    return { data: [], error: userFacingQueryError(result.error) };
  }

  return {
    data: arrayFrom(result.data).map(toRelationItem).filter(isPresent),
    error: null,
  };
}

function client(value: unknown): QueryClient {
  return value as QueryClient;
}

async function fetchWegNames(
  supabase: unknown,
  ids: Array<string | null>,
): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (uniqueIds.length === 0) return new Map();

  const result = await client(supabase)
    .from("weg")
    .select("id, name")
    .in("id", uniqueIds)
    .limit(uniqueIds.length);

  if (result.error) {
    logQueryError("fetchWegNames", result.error);
    return new Map();
  }

  const names = new Map<string, string>();
  for (const row of arrayFrom(result.data)) {
    const id = readString(row, "id");
    const name = readString(row, "name");
    if (id && name) names.set(id, name);
  }
  return names;
}

async function fetchOpenTaskCounts(
  supabase: unknown,
  vorgangIds: string[],
): Promise<Map<string, number>> {
  if (vorgangIds.length === 0) return new Map();
  const result = await client(supabase)
    .from("vorgang_task")
    .select("vorgang_id, status")
    .in("vorgang_id", vorgangIds)
    .limit(1000);

  if (result.error) return new Map();

  const counts = new Map<string, number>();
  for (const row of arrayFrom(result.data)) {
    const vorgangId = readString(row, "vorgang_id");
    const status = readTaskStatus(row, "status");
    if (!vorgangId || status === "done" || status === "cancelled") continue;
    counts.set(vorgangId, (counts.get(vorgangId) ?? 0) + 1);
  }
  return counts;
}

async function fetchSuggestionVorgangIds(supabase: unknown): Promise<Set<string>> {
  let result = await client(supabase)
    .from("agent_suggestion")
    .select("vorgang_id, payload, status, vorschlag_typ")
    .eq("status", "vorschlag")
    .in("vorschlag_typ", REVIEW_TYPES)
    .limit(500);

  if (result.error && isMissingAgentSuggestionVorgangColumnError(result.error)) {
    result = await client(supabase)
      .from("agent_suggestion")
      .select("payload, status, vorschlag_typ")
      .eq("status", "vorschlag")
      .in("vorschlag_typ", REVIEW_TYPES)
      .limit(500);
  }

  if (result.error) return new Set();

  const ids = new Set<string>();
  for (const row of arrayFrom(result.data)) {
    const payload = readPayload(row);
    const vorgangId = readString(row, "vorgang_id") ?? readString(payload, "vorgang_id");
    if (vorgangId) ids.add(vorgangId);
  }
  return ids;
}

function queryReviewItems(
  supabase: unknown,
  options: { vorgangId?: string; includeDecided?: boolean; limit?: number },
  schema: { includeVorgangColumn: boolean },
): PromiseLike<QueryResponse<unknown[]>> {
  let query = client(supabase)
    .from("agent_suggestion")
    .select(
      [
        "id",
        "vorschlag_typ",
        "status",
        "weg_id",
        schema.includeVorgangColumn ? "vorgang_id" : null,
        "payload",
        "langfuse_trace_id",
        "langgraph_thread_id",
        "created_at",
        "updated_at",
      ]
        .filter(isPresent)
        .join(", "),
    )
    .in("vorschlag_typ", REVIEW_TYPES)
    .order("created_at", { ascending: false })
    .limit(options.limit ?? DEFAULT_LIMIT);

  if (!options.includeDecided) {
    query = query.eq("status", "vorschlag");
  }
  if (options.vorgangId && schema.includeVorgangColumn) {
    query = query.eq("vorgang_id", options.vorgangId);
  }

  return query;
}

async function fetchLastActivity(
  supabase: unknown,
  vorgangIds: string[],
): Promise<Map<string, string>> {
  if (vorgangIds.length === 0) return new Map();
  const result = await client(supabase)
    .from("vorgang_timeline_event")
    .select("vorgang_id, created_at")
    .in("vorgang_id", vorgangIds)
    .order("created_at", { ascending: false })
    .limit(500);

  if (result.error) return new Map();

  const activity = new Map<string, string>();
  for (const row of arrayFrom(result.data)) {
    const vorgangId = readString(row, "vorgang_id");
    const createdAt = readString(row, "created_at");
    if (vorgangId && createdAt && !activity.has(vorgangId)) {
      activity.set(vorgangId, createdAt);
    }
  }
  return activity;
}

function toVorgangListItem(row: unknown): VorgangListItem | null {
  const id = readString(row, "id");
  const title = readString(row, "title");
  const createdAt = readString(row, "created_at");
  const updatedAt = readString(row, "updated_at");
  if (!id || !title || !createdAt || !updatedAt) return null;

  return {
    id,
    title,
    typ: readString(row, "typ") ?? "vorgang",
    status: readVorgangStatus(row, "status"),
    priority: readPriority(row, "priority"),
    visibilityState: readVisibility(row, "visibility_state"),
    wegId: readString(row, "weg_id"),
    wegName: null,
    assignedTo: readString(row, "assigned_to"),
    dueAt: readString(row, "due_at"),
    createdAt,
    updatedAt,
    lastActivityAt: updatedAt,
    hasKiSuggestion: false,
    openTaskCount: 0,
  };
}

function toInboxItem(row: unknown): InboxItem | null {
  const id = readString(row, "id");
  const subject = readString(row, "subject");
  const createdAt = readString(row, "created_at");
  const updatedAt = readString(row, "updated_at");
  if (!id || !subject || !createdAt || !updatedAt) return null;

  return {
    id,
    wegId: readString(row, "weg_id"),
    wegName: null,
    vorgangId: readString(row, "vorgang_id"),
    channel: readInboxChannel(row, "channel"),
    status: readInboxStatus(row, "status"),
    subject,
    bodyPreview: readString(row, "body_preview"),
    sourceMetadata: readValue(row, "source_metadata") ?? {},
    receivedAt: readString(row, "received_at"),
    createdAt,
    updatedAt,
  };
}

function toReviewItem(row: unknown): ReviewItem | null {
  const id = readString(row, "id");
  const suggestionType = readString(row, "vorschlag_typ");
  const createdAt = readString(row, "created_at");
  const updatedAt = readString(row, "updated_at");
  if (!id || !suggestionType || !createdAt || !updatedAt) return null;

  const payload = readPayload(row);
  return {
    id,
    suggestionType,
    status: readReviewStatus(row, "status"),
    wegId: readString(row, "weg_id") ?? readString(payload, "weg_id"),
    wegName: null,
    vorgangId: readString(row, "vorgang_id") ?? readString(payload, "vorgang_id"),
    title:
      readString(payload, "title") ??
      readString(payload, "subject") ??
      suggestionType,
    summary:
      readString(payload, "summary") ??
      readString(payload, "begruendung") ??
      "Dieser Vorschlag benötigt eine menschliche Entscheidung.",
    confidence: readConfidence(payload, "confidence"),
    sourceLabel:
      readString(payload, "source_label") ??
      readString(payload, "document_label") ??
      readFirstSourceLabel(payload),
    langfuseTraceId: readString(row, "langfuse_trace_id"),
    langgraphThreadId: readString(row, "langgraph_thread_id"),
    riskFlags: readStringArray(payload, "risk_flags"),
    payload,
    createdAt,
    updatedAt,
  };
}

function toTimelineItem(row: unknown): VorgangTimelineItem | null {
  const id = readString(row, "id");
  const vorgangId = readString(row, "vorgang_id");
  const summary = readString(row, "summary");
  const createdAt = readString(row, "created_at");
  if (!id || !vorgangId || !summary || !createdAt) return null;

  return {
    id,
    vorgangId,
    eventType: readString(row, "event_type") ?? "event",
    actorType: readActorType(row, "actor_type"),
    actorUserId: readString(row, "actor_user_id"),
    visibility: readVisibility(row, "visibility"),
    summary,
    payload: readValue(row, "payload") ?? {},
    createdAt,
  };
}

function toTaskItem(row: unknown): VorgangTaskItem | null {
  const id = readString(row, "id");
  const vorgangId = readString(row, "vorgang_id");
  const title = readString(row, "title");
  const createdAt = readString(row, "created_at");
  const updatedAt = readString(row, "updated_at");
  if (!id || !vorgangId || !title || !createdAt || !updatedAt) return null;

  return {
    id,
    vorgangId,
    title,
    description: readString(row, "description"),
    status: readTaskStatus(row, "status"),
    assignedTo: readString(row, "assigned_to"),
    dueAt: readString(row, "due_at"),
    completedAt: readString(row, "completed_at"),
    createdAt,
    updatedAt,
  };
}

function toRelationItem(row: unknown): VorgangRelationItem | null {
  const id = readString(row, "id");
  const relationType = readString(row, "relation_type");
  const relationId = readString(row, "relation_id");
  const createdAt = readString(row, "created_at");
  if (!id || !relationType || !relationId || !createdAt) return null;
  return {
    id,
    relationType,
    relationId,
    label: readString(row, "label"),
    createdAt,
  };
}

function arrayFrom(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function readValue(row: unknown, key: string): unknown {
  if (!row || typeof row !== "object") return null;
  return (row as Record<string, unknown>)[key] ?? null;
}

function readString(row: unknown, key: string): string | null {
  const value = readValue(row, key);
  return typeof value === "string" && value.trim() ? value : null;
}

function readPayload(row: unknown): unknown {
  return readValue(row, "payload") ?? {};
}

function readStringArray(row: unknown, key: string): string[] {
  const value = readValue(row, key);
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function readVorgangStatus(row: unknown, key: string): VorgangStatus {
  const value = readString(row, key);
  if (
    value === "draft" ||
    value === "open" ||
    value === "waiting_external" ||
    value === "waiting_internal" ||
    value === "review_required" ||
    value === "resolved" ||
    value === "closed" ||
    value === "cancelled"
  ) {
    return value;
  }
  return "draft";
}

function readPriority(row: unknown, key: string): VorgangPriority {
  const value = readString(row, key);
  if (value === "low" || value === "normal" || value === "high" || value === "urgent") {
    return value;
  }
  return "normal";
}

function readVisibility(row: unknown, key: string): VisibilityState {
  const value = readString(row, key);
  if (
    value === "internal" ||
    value === "beirat" ||
    value === "eigentuemer" ||
    value === "dienstleister" ||
    value === "shared_beirat" ||
    value === "shared_eigentuemer" ||
    value === "shared_dienstleister" ||
    value === "public_portal"
  ) {
    return value;
  }
  return "internal";
}

function readInboxStatus(row: unknown, key: string): InboxStatus {
  const value = readString(row, key);
  if (
    value === "new" ||
    value === "classified" ||
    value === "linked" ||
    value === "converted" ||
    value === "dismissed" ||
    value === "failed"
  ) {
    return value;
  }
  return "new";
}

function readInboxChannel(row: unknown, key: string): InboxChannel {
  const value = readString(row, key);
  if (
    value === "manual" ||
    value === "document_upload" ||
    value === "portal_message" ||
    value === "email_placeholder" ||
    value === "phone_note" ||
    value === "system_event"
  ) {
    return value;
  }
  return "manual";
}

function readTaskStatus(row: unknown, key: string): TaskStatus {
  const value = readString(row, key);
  if (
    value === "todo" ||
    value === "in_progress" ||
    value === "blocked" ||
    value === "review_required" ||
    value === "done" ||
    value === "cancelled"
  ) {
    return value;
  }
  return "todo";
}

function readReviewStatus(row: unknown, key: string): ReviewStatus {
  const value = readString(row, key);
  if (value === "uebernommen" || value === "verworfen") return value;
  return "vorschlag";
}

function readConfidence(row: unknown, key: string): ConfidenceLabel {
  const value = readString(row, key);
  if (value === "hoch" || value === "mittel" || value === "niedrig" || value === "blockiert") {
    return value;
  }
  return "mittel";
}

function readActorType(row: unknown, key: string): "user" | "agent" | "system" {
  const value = readString(row, key);
  if (value === "agent" || value === "system") return value;
  return "user";
}

function readFirstSourceLabel(payload: unknown): string | null {
  const sources = readValue(payload, "sources");
  if (!Array.isArray(sources)) return null;
  const first = sources[0];
  return (
    readString(first, "label") ??
    readString(first, "document_title") ??
    readString(first, "document_id")
  );
}

function isOpenStatus(status: VorgangStatus): boolean {
  return status !== "closed" && status !== "cancelled" && status !== "resolved";
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function logQueryError(scope: string, error: QueryError): void {
  const normalized = normalizeQueryError(error);
  const isRecoverable = isMissingSchemaError(normalized) ||
    isMissingAgentSuggestionVorgangColumnError(normalized);
  const logger = isRecoverable ? console.warn : console.error;
  const state = isMissingSchemaError(normalized)
    ? "unavailable"
    : isMissingAgentSuggestionVorgangColumnError(normalized)
      ? "schema fallback"
      : "failed";

  logger(`[vorgangszentrale] ${scope} ${state}`, {
    code: normalized.code,
    message: normalized.message,
    details: normalized.details,
    hint: normalized.hint,
  });
}

function userFacingQueryError(error: QueryError): string {
  const normalized = normalizeQueryError(error);
  if (isMissingSchemaError(normalized)) {
    return "Die Vorgangszentrale-Tabellen sind in der Datenbank noch nicht verfügbar.";
  }
  return "Daten der Vorgangszentrale konnten nicht geladen werden.";
}

function isMissingSchemaError(error: QueryError): boolean {
  return error.code === "42P01" || error.code === "PGRST205";
}

function isMissingAgentSuggestionVorgangColumnError(error: QueryError): boolean {
  const normalized = normalizeQueryError(error);
  const haystack = [
    normalized.message,
    normalized.details,
    normalized.hint,
  ].join(" ");
  return (
    (normalized.code === "42703" || normalized.code === "PGRST204") &&
    haystack.includes("agent_suggestion") &&
    haystack.includes("vorgang_id")
  );
}

function normalizeQueryError(error: QueryError): NormalizedQueryError {
  return {
    code: readErrorField(error, "code"),
    message: readErrorField(error, "message") || "Unknown query error",
    details: readErrorField(error, "details"),
    hint: readErrorField(error, "hint"),
  };
}

function readErrorField(error: QueryError, key: keyof QueryError): string {
  const value = error[key];
  if (typeof value === "string" && value.trim()) return value;
  if (key === "message" && error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "";
}
