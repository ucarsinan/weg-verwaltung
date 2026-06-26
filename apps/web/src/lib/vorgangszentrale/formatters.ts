import type {
  ConfidenceLabel,
  InboxChannel,
  InboxStatus,
  ReviewStatus,
  TaskStatus,
  VisibilityState,
  VorgangPriority,
  VorgangStatus,
} from "./types";

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const DATE_FORMATTER = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export const VORGANG_STATUS_LABELS = {
  draft: "Entwurf",
  open: "Offen",
  waiting_external: "Wartet extern",
  waiting_internal: "Wartet intern",
  review_required: "Review nötig",
  resolved: "Gelöst",
  closed: "Geschlossen",
  cancelled: "Abgebrochen",
} as const satisfies Record<VorgangStatus, string>;

export const VORGANG_PRIORITY_LABELS = {
  low: "Niedrig",
  normal: "Normal",
  high: "Hoch",
  urgent: "Dringend",
} as const satisfies Record<VorgangPriority, string>;

export const VISIBILITY_LABELS = {
  internal: "Intern",
  beirat: "Beirat",
  eigentuemer: "Eigentümer",
  dienstleister: "Dienstleister",
  shared_beirat: "Mit Beirat geteilt",
  shared_eigentuemer: "Mit Eigentümern geteilt",
  shared_dienstleister: "Mit Dienstleistern geteilt",
  public_portal: "Portal sichtbar",
} as const satisfies Record<VisibilityState, string>;

export const INBOX_STATUS_LABELS = {
  new: "Neu",
  classified: "Klassifiziert",
  linked: "Verknüpft",
  converted: "Konvertiert",
  dismissed: "Verworfen",
  failed: "Fehler",
} as const satisfies Record<InboxStatus, string>;

export const INBOX_CHANNEL_LABELS = {
  manual: "Manuell",
  document_upload: "Dokument",
  portal_message: "Portal",
  email_placeholder: "E-Mail",
  phone_note: "Telefonnotiz",
  system_event: "System",
} as const satisfies Record<InboxChannel, string>;

export const TASK_STATUS_LABELS = {
  todo: "Offen",
  in_progress: "In Arbeit",
  blocked: "Blockiert",
  review_required: "Review nötig",
  done: "Erledigt",
  cancelled: "Abgebrochen",
} as const satisfies Record<TaskStatus, string>;

export const REVIEW_STATUS_LABELS = {
  vorschlag: "Offen",
  uebernommen: "Übernommen",
  verworfen: "Verworfen",
} as const satisfies Record<ReviewStatus, string>;

export const CONFIDENCE_LABELS = {
  hoch: "Sicherheit hoch",
  mittel: "Sicherheit mittel",
  niedrig: "Sicherheit niedrig",
  blockiert: "Blockiert",
} as const satisfies Record<ConfidenceLabel, string>;

export function formatVorgangStatus(status: VorgangStatus): string {
  return VORGANG_STATUS_LABELS[status];
}

export function formatPriority(priority: VorgangPriority): string {
  return VORGANG_PRIORITY_LABELS[priority];
}

export function formatVisibility(visibility: VisibilityState): string {
  return VISIBILITY_LABELS[visibility];
}

export function formatInboxStatus(status: InboxStatus): string {
  return INBOX_STATUS_LABELS[status];
}

export function formatInboxChannel(channel: InboxChannel): string {
  return INBOX_CHANNEL_LABELS[channel];
}

export function formatTaskStatus(status: TaskStatus): string {
  return TASK_STATUS_LABELS[status];
}

export function formatReviewStatus(status: ReviewStatus): string {
  return REVIEW_STATUS_LABELS[status];
}

export function formatConfidence(confidence: ConfidenceLabel): string {
  return CONFIDENCE_LABELS[confidence];
}

export function formatDateTime(value: string | null): string {
  if (!value) return "Keine Angabe";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Ungültiges Datum";
  return DATE_TIME_FORMATTER.format(date);
}

export function formatDate(value: string | null): string {
  if (!value) return "Keine Frist";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Ungültige Frist";
  return DATE_FORMATTER.format(date);
}

export type DueState = "none" | "overdue" | "today" | "future";

export function getDueState(
  value: string | null,
  now: Date = new Date(),
): DueState {
  if (!value) return "none";
  const due = new Date(value);
  if (Number.isNaN(due.getTime())) return "none";

  const dueDay = startOfDay(due).getTime();
  const today = startOfDay(now).getTime();
  if (dueDay < today) return "overdue";
  if (dueDay === today) return "today";
  return "future";
}

export function formatDueDate(
  value: string | null,
  now: Date = new Date(),
): string {
  const state = getDueState(value, now);
  if (state === "none") return "Keine Frist";
  const formatted = formatDate(value);
  if (state === "overdue") return `${formatted} · überfällig`;
  if (state === "today") return `${formatted} · heute`;
  return formatted;
}

export function formatKiProvenanceLabel(input: {
  suggestionType?: string | null;
  confidence?: ConfidenceLabel | null;
  sourceLabel?: string | null;
}): string {
  const parts = ["KI-Vorschlag"];
  if (input.suggestionType) parts.push(input.suggestionType);
  if (input.confidence) parts.push(CONFIDENCE_LABELS[input.confidence]);
  if (input.sourceLabel) parts.push(input.sourceLabel);
  return parts.join(" · ");
}

export function prioritySortValue(priority: VorgangPriority): number {
  if (priority === "urgent") return 0;
  if (priority === "high") return 1;
  if (priority === "normal") return 2;
  return 3;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
