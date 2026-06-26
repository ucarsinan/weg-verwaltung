export type VorgangStatus =
  | "draft"
  | "open"
  | "waiting_external"
  | "waiting_internal"
  | "review_required"
  | "resolved"
  | "closed"
  | "cancelled";

export type VorgangPriority = "low" | "normal" | "high" | "urgent";

export type VisibilityState =
  | "internal"
  | "beirat"
  | "eigentuemer"
  | "dienstleister"
  | "shared_beirat"
  | "shared_eigentuemer"
  | "shared_dienstleister"
  | "public_portal";

export type InboxStatus =
  | "new"
  | "classified"
  | "linked"
  | "converted"
  | "dismissed"
  | "failed";

export type InboxChannel =
  | "manual"
  | "document_upload"
  | "portal_message"
  | "email_placeholder"
  | "phone_note"
  | "system_event";

export type TaskStatus =
  | "todo"
  | "in_progress"
  | "blocked"
  | "review_required"
  | "done"
  | "cancelled";

export type ReviewStatus = "vorschlag" | "uebernommen" | "verworfen";

export type ConfidenceLabel = "hoch" | "mittel" | "niedrig" | "blockiert";

export interface QueryResult<T> {
  data: T;
  error: string | null;
}

export interface VorgangListItem {
  id: string;
  title: string;
  typ: string;
  status: VorgangStatus;
  priority: VorgangPriority;
  visibilityState: VisibilityState;
  wegId: string | null;
  wegName: string | null;
  assignedTo: string | null;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string | null;
  hasKiSuggestion: boolean;
  openTaskCount: number;
}

export interface VorgangTaskItem {
  id: string;
  vorgangId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  assignedTo: string | null;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VorgangTimelineItem {
  id: string;
  vorgangId: string;
  eventType: string;
  actorType: "user" | "agent" | "system";
  actorUserId: string | null;
  visibility: VisibilityState;
  summary: string;
  payload: unknown;
  createdAt: string;
}

export interface InboxItem {
  id: string;
  wegId: string | null;
  wegName: string | null;
  vorgangId: string | null;
  channel: InboxChannel;
  status: InboxStatus;
  subject: string;
  bodyPreview: string | null;
  sourceMetadata: unknown;
  receivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewItem {
  id: string;
  suggestionType: string;
  status: ReviewStatus;
  wegId: string | null;
  wegName: string | null;
  vorgangId: string | null;
  title: string;
  summary: string;
  confidence: ConfidenceLabel;
  sourceLabel: string | null;
  langfuseTraceId: string | null;
  langgraphThreadId: string | null;
  riskFlags: string[];
  payload: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface VorgangDetail extends VorgangListItem {
  tasks: VorgangTaskItem[];
  timeline: VorgangTimelineItem[];
  reviews: ReviewItem[];
  relations: VorgangRelationItem[];
}

export interface VorgangRelationItem {
  id: string;
  relationType: string;
  relationId: string;
  label: string | null;
  createdAt: string;
}

export interface VorgangDashboardMetrics {
  open: number;
  overdue: number;
  dueToday: number;
  reviewRequired: number;
  inboxNew: number;
}
