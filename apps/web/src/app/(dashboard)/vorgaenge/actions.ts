"use server";

import { revalidatePath } from "next/cache";

import {
  agentErrorMessage,
  postVorgang,
  type VorgangInvokeRequest,
  type VorgangResponse,
  type VorgangSuggestion,
} from "@/modules/agent-bridge";
import { createClient } from "@/lib/supabase/server";
import type { TaskStatus, VorgangPriority } from "@/lib/vorgangszentrale/types";

type ActionResult = { error?: string; id?: string };

type QueryError = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

type QueryResponse<T> = {
  data: T | null;
  error: QueryError | null;
};

interface MutationQuery<T = unknown[]> extends PromiseLike<QueryResponse<T>> {
  eq(column: string, value: unknown): MutationQuery<T>;
  select(columns?: string): MutationQuery<T>;
  limit(count: number): MutationQuery<T>;
}

interface TableMutator {
  insert(values: unknown): MutationQuery<unknown[]>;
  update(values: unknown): MutationQuery<unknown[]>;
  select(columns?: string): MutationQuery<unknown[]>;
}

interface MutationClient {
  from(table: string): TableMutator;
}

const TASK_STATUSES = new Set<TaskStatus>([
  "todo",
  "in_progress",
  "blocked",
  "review_required",
  "done",
  "cancelled",
]);
const VORGANG_TYPES = new Set([
  "schadensmeldung",
  "belegpruefung",
  "eigentuemeranfrage",
  "beschlussumsetzung",
  "rechnungspruefung",
  "versammlungsvorbereitung",
  "dokumentenklaerung",
  "allgemein",
]);
const PRIORITIES = new Set<VorgangPriority>(["low", "normal", "high", "urgent"]);
// Kanonische Werte kommen aus dem generierten Agent-Kontrakt (shared-types).
type AgentSuggestionType = NonNullable<VorgangInvokeRequest["suggestion_type"]>;
const SUGGESTION_TYPES = new Set<AgentSuggestionType>([
  "vorgang_triage",
  "antwort_entwurf",
  "frist_vorschlag",
  "dokument_metadaten_vorschlag",
  "tool_action_proposal",
  "rag_answer",
  "blocked_proposal",
]);
const DEFAULT_AGENT_REQUEST =
  "Bitte prüfe diesen Vorgang konservativ anhand der verfügbaren Quellen und erstelle nur einen menschlich zu prüfenden Vorschlag.";

export async function createTaskAction(
  vorgangId: string,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await requireUser();
  if ("error" in auth) return auth;

  const title = readFormText(formData, "title");
  if (!title) return { error: "Bitte einen Aufgabentitel angeben." };

  const description = readFormText(formData, "description");
  const dueAt = readOptionalDate(formData, "due_at");
  const supabase = mutator(await createClient());
  const now = new Date().toISOString();

  const taskResult = await supabase
    .from("vorgang_task")
    .insert({
      vorgang_id: vorgangId,
      title,
      description,
      due_at: dueAt,
      status: "todo",
      created_by: auth.userId,
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .limit(1);

  if (taskResult.error) {
    logActionError("createTaskAction", taskResult.error);
    return { error: "Aufgabe konnte nicht angelegt werden." };
  }

  await insertTimelineEvent(supabase, vorgangId, {
    event_type: "task_created",
    summary: `Aufgabe angelegt: ${title}`,
    payload: { title, due_at: dueAt },
  });

  revalidateVorgangPaths(vorgangId);
  return { id: readId(taskResult.data) };
}

export async function updateTaskStatusAction(
  vorgangId: string,
  taskId: string,
  status: TaskStatus,
): Promise<ActionResult> {
  const auth = await requireUser();
  if ("error" in auth) return auth;
  if (!TASK_STATUSES.has(status)) return { error: "Ungültiger Aufgabenstatus." };

  const supabase = mutator(await createClient());
  const now = new Date().toISOString();
  const result = await supabase
    .from("vorgang_task")
    .update({
      status,
      completed_at: status === "done" ? now : null,
      updated_at: now,
    })
    .eq("id", taskId)
    .eq("vorgang_id", vorgangId);

  if (result.error) {
    logActionError("updateTaskStatusAction", result.error);
    return { error: "Aufgabenstatus konnte nicht aktualisiert werden." };
  }

  await insertTimelineEvent(supabase, vorgangId, {
    event_type: status === "done" ? "task_completed" : "task_status_changed",
    summary:
      status === "done"
        ? "Aufgabe wurde erledigt."
        : `Aufgabenstatus geändert: ${status}`,
    payload: { task_id: taskId, status },
  });

  revalidateVorgangPaths(vorgangId);
  return {};
}

export async function addInternalNoteAction(
  vorgangId: string,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await requireUser();
  if ("error" in auth) return auth;

  const note = readFormText(formData, "note");
  if (!note) return { error: "Bitte eine interne Notiz eingeben." };

  const supabase = mutator(await createClient());
  const result = await insertTimelineEvent(supabase, vorgangId, {
    event_type: "internal_note_added",
    summary: note,
    payload: {},
  });

  if (result.error) return result;

  revalidateVorgangPaths(vorgangId);
  return {};
}

export async function requestVorgangAgentSuggestionAction(
  vorgangId: string,
  wegId: string | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await requireUser();
  if ("error" in auth) return auth;

  const userRequest = readFormText(formData, "user_request") ?? DEFAULT_AGENT_REQUEST;
  const suggestionType = readSuggestionType(formData);

  let data: VorgangResponse & { suggestion: VorgangSuggestion };
  try {
    data = await postVorgang({
      vorgang_id: vorgangId,
      weg_id: wegId,
      user_request: userRequest,
      suggestion_type: suggestionType,
    });
  } catch (err) {
    return handleAgentError("requestVorgangAgentSuggestionAction", err);
  }

  const vorschlagTyp = data.suggestion.suggestion_type;
  if (!vorschlagTyp) {
    return { error: "Der Agent lieferte keinen Vorschlagstyp." };
  }

  const now = new Date().toISOString();
  const result = await mutator(await createClient())
    .from("agent_suggestion")
    .insert({
      actor_type: "agent",
      vorschlag_typ: vorschlagTyp,
      weg_id: wegId,
      vorgang_id: vorgangId,
      payload: {
        ...data.suggestion,
        vorgang_id: vorgangId,
        weg_id: wegId,
        user_request: userRequest,
      },
      langgraph_thread_id: data.thread_id,
      status: "vorschlag",
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .limit(1);

  if (result.error) {
    logActionError("requestVorgangAgentSuggestionAction.insert", result.error);
    return { error: "KI-Vorschlag konnte nicht gespeichert werden." };
  }

  revalidateVorgangPaths(vorgangId);
  revalidatePath("/vorgaenge/reviews");
  return { id: readId(result.data) };
}

export async function dismissInboxItemAction(
  inboxItemId: string,
): Promise<ActionResult> {
  const auth = await requireUser();
  if ("error" in auth) return auth;

  const result = await mutator(await createClient())
    .from("vorgang_inbox_item")
    .update({ status: "dismissed", updated_at: new Date().toISOString() })
    .eq("id", inboxItemId);

  if (result.error) {
    logActionError("dismissInboxItemAction", result.error);
    return { error: "Inbox-Eintrag konnte nicht verworfen werden." };
  }

  revalidatePath("/vorgaenge");
  revalidatePath("/vorgaenge/inbox");
  return {};
}

export async function classifyInboxItemAction(
  inboxItemId: string,
): Promise<ActionResult> {
  const auth = await requireUser();
  if ("error" in auth) return auth;

  const result = await mutator(await createClient())
    .from("vorgang_inbox_item")
    .update({ status: "classified", updated_at: new Date().toISOString() })
    .eq("id", inboxItemId)
    .eq("status", "new");

  if (result.error) {
    logActionError("classifyInboxItemAction", result.error);
    return { error: "Inbox-Eintrag konnte nicht klassifiziert werden." };
  }

  revalidatePath("/vorgaenge/inbox");
  return {};
}

export async function linkInboxItemAction(
  inboxItemId: string,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await requireUser();
  if ("error" in auth) return auth;

  const vorgangId = readFormText(formData, "vorgang_id");
  if (!vorgangId) return { error: "Bitte eine Vorgangs-ID angeben." };

  const supabase = mutator(await createClient());
  const result = await supabase
    .from("vorgang_inbox_item")
    .update({
      vorgang_id: vorgangId,
      status: "linked",
      updated_at: new Date().toISOString(),
    })
    .eq("id", inboxItemId);

  if (result.error) {
    logActionError("linkInboxItemAction", result.error);
    return { error: "Inbox-Eintrag konnte nicht verknüpft werden." };
  }

  await insertTimelineEvent(supabase, vorgangId, {
    event_type: "inbox_item_linked",
    summary: "Inbox-Eintrag wurde mit diesem Vorgang verknüpft.",
    payload: { inbox_item_id: inboxItemId },
  });

  revalidatePath("/vorgaenge");
  revalidatePath("/vorgaenge/inbox");
  revalidateVorgangPaths(vorgangId);
  return { id: vorgangId };
}

export async function convertInboxItemAction(
  inboxItemId: string,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await requireUser();
  if ("error" in auth) return auth;

  const title = readFormText(formData, "title");
  if (!title) return { error: "Bitte einen Titel für den Vorgang angeben." };

  const typ = readVorgangType(formData);
  const priority = readPriority(formData);
  const wegId = readFormText(formData, "weg_id");
  const dueAt = readOptionalDate(formData, "due_at");
  const supabase = mutator(await createClient());
  const now = new Date().toISOString();

  const createResult = await supabase
    .from("vorgang")
    .insert({
      title,
      typ,
      priority,
      status: "open",
      visibility_state: "internal",
      weg_id: wegId,
      due_at: dueAt,
      created_by: auth.userId,
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .limit(1);

  if (createResult.error) {
    logActionError("convertInboxItemAction.create", createResult.error);
    return { error: "Vorgang konnte nicht aus dem Inbox-Eintrag erstellt werden." };
  }

  const vorgangId = readId(createResult.data);
  if (!vorgangId) return { error: "Der neue Vorgang konnte nicht gelesen werden." };

  const updateResult = await supabase
    .from("vorgang_inbox_item")
    .update({
      vorgang_id: vorgangId,
      status: "converted",
      updated_at: now,
    })
    .eq("id", inboxItemId);

  if (updateResult.error) {
    logActionError("convertInboxItemAction.updateInbox", updateResult.error);
    return { error: "Vorgang wurde erstellt, aber die Inbox-Verknüpfung schlug fehl." };
  }

  await insertTimelineEvent(supabase, vorgangId, {
    event_type: "inbox_item_converted",
    summary: "Vorgang wurde aus einem Inbox-Eintrag erstellt.",
    payload: { inbox_item_id: inboxItemId },
  });

  revalidatePath("/vorgaenge");
  revalidatePath("/vorgaenge/inbox");
  revalidateVorgangPaths(vorgangId);
  return { id: vorgangId };
}

export async function acceptReviewAction(
  reviewId: string,
): Promise<ActionResult> {
  return decideReview(reviewId, "uebernommen");
}

export async function rejectReviewAction(
  reviewId: string,
): Promise<ActionResult> {
  return decideReview(reviewId, "verworfen");
}

async function decideReview(
  reviewId: string,
  status: "uebernommen" | "verworfen",
): Promise<ActionResult> {
  const auth = await requireUser();
  if ("error" in auth) return auth;

  const result = await mutator(await createClient())
    .from("agent_suggestion")
    .update({
      status,
      entschieden_von: auth.userId,
      entschieden_am: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", reviewId)
    .eq("status", "vorschlag");

  if (result.error) {
    logActionError("decideReview", result.error);
    return {
      error:
        status === "uebernommen"
          ? "Vorschlag konnte nicht übernommen werden."
          : "Vorschlag konnte nicht verworfen werden.",
    };
  }

  revalidatePath("/vorgaenge");
  revalidatePath("/vorgaenge/reviews");
  return {};
}

async function requireUser(): Promise<{ userId: string } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Nicht authentifiziert." };
  return { userId: user.id };
}

async function insertTimelineEvent(
  supabase: MutationClient,
  vorgangId: string,
  values: {
    event_type: string;
    summary: string;
    payload: Record<string, unknown>;
  },
): Promise<ActionResult> {
  const result = await supabase.from("vorgang_timeline_event").insert({
    vorgang_id: vorgangId,
    actor_type: "user",
    visibility: "internal",
    event_type: values.event_type,
    summary: values.summary,
    payload: values.payload,
    created_at: new Date().toISOString(),
  });

  if (result.error) {
    logActionError("insertTimelineEvent", result.error);
    return { error: "Timeline-Eintrag konnte nicht geschrieben werden." };
  }

  return {};
}

function mutator(value: unknown): MutationClient {
  return value as MutationClient;
}

function readFormText(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readOptionalDate(formData: FormData, key: string): string | null {
  const value = readFormText(formData, key);
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function readVorgangType(formData: FormData): string {
  const value = readFormText(formData, "typ") ?? "eigentuemeranfrage";
  return VORGANG_TYPES.has(value) ? value : "eigentuemeranfrage";
}

function readPriority(formData: FormData): VorgangPriority {
  const value = readFormText(formData, "priority");
  return value && PRIORITIES.has(value as VorgangPriority)
    ? (value as VorgangPriority)
    : "normal";
}

function readSuggestionType(formData: FormData): AgentSuggestionType | null {
  const value = readFormText(formData, "suggestion_type");
  return value && SUGGESTION_TYPES.has(value as AgentSuggestionType)
    ? (value as AgentSuggestionType)
    : null;
}

function readId(rows: unknown): string | undefined {
  if (!Array.isArray(rows)) return undefined;
  const first = rows[0];
  if (!first || typeof first !== "object") return undefined;
  const value = (first as Record<string, unknown>).id;
  return typeof value === "string" ? value : undefined;
}

function revalidateVorgangPaths(vorgangId: string): void {
  revalidatePath("/vorgaenge");
  revalidatePath(`/vorgaenge/${vorgangId}`);
}

function handleAgentError(scope: string, err: unknown): ActionResult {
  return {
    error: agentErrorMessage(`vorgangszentrale.${scope}`, err, {
      unavailable: (status) =>
        `KI-Vorschlag temporär nicht verfügbar (${status}). Bitte später erneut versuchen.`,
      unknown: "Unbekannter Fehler beim KI-Vorschlag.",
      rejected: "Agent-Anfrage wurde abgelehnt.",
    }),
  };
}

function logActionError(scope: string, error: QueryError): void {
  console.error(`[vorgangszentrale] ${scope} failed`, {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  });
}
