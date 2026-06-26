export type AuditActorType = "user" | "agent" | "system" | (string & {});
export type AuditAction = "insert" | "update" | "delete" | "select" | (string & {});
export type AuditRiskFlag =
  | "agent"
  | "integrity_warning"
  | "masked"
  | "service_role"
  | (string & {});
export type AuditIntegrityState =
  | "not_checked"
  | "intact"
  | "warning"
  | "error"
  | (string & {});

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const ACTION_LABELS: Record<string, string> = {
  archive: "Archivierung",
  delete: "Gelöscht",
  insert: "Angelegt",
  reveal: "Payload angezeigt",
  select: "Gelesen",
  update: "Aktualisiert",
  verify: "Integrität geprüft",
};

const ENTITY_LABELS: Record<string, string> = {
  audit_payload_reveal: "Payload-Reveal",
  beschluss: "Beschluss",
  beschluss_sammlung_entry: "Beschlusssammlung",
  document: "Dokument",
  eigentuemerschaft: "Eigentümerschaft",
  einheit: "Einheit",
  meeting: "Versammlung",
  ownership: "Eigentümerschaft",
  protocol: "Protokoll",
  resolution: "Beschluss",
  versammlung: "Versammlung",
  vote: "Stimme",
  weg: "WEG",
  wirtschaftsplan: "Wirtschaftsplan",
};

const RISK_FLAG_LABELS: Record<string, string> = {
  agent: "KI",
  integrity_warning: "Integrität",
  masked: "Maskiert",
  service_role: "Service Role",
};

const SENSITIVE_KEY_RE =
  /(adresse|address|bic|email|hausnummer|iban|mail|name|nachname|phone|strasse|straße|telefon|vorname)/i;

export interface AuditEventReferenceInput {
  id: string;
  created_at: string;
}

export function formatAuditDateTime(value: string | Date | null | undefined): string {
  if (!value) return "–";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "–";
  return DATE_TIME_FORMAT.format(date);
}

export function formatActorLabel(
  actorType: AuditActorType | null | undefined,
  fallback?: string | null,
): string {
  if (fallback) return fallback;
  switch (actorType) {
    case "user":
      return "Verwalter";
    case "agent":
      return "KI-Agent";
    case "system":
      return "System";
    default:
      return actorType ? humanizeToken(actorType) : "Unbekannt";
  }
}

export function formatActionLabel(action: AuditAction | null | undefined): string {
  if (!action) return "Unbekannte Aktion";
  return ACTION_LABELS[action] ?? action;
}

export function formatEntityLabel(entityType: string | null | undefined): string {
  if (!entityType) return "Unbekannte Entität";
  return ENTITY_LABELS[entityType] ?? humanizeToken(entityType);
}

export function formatRiskFlags(flags: readonly AuditRiskFlag[] | null | undefined): string[] {
  if (!flags?.length) return [];
  return flags.map((flag) => formatRiskFlag(flag));
}

export function formatRiskFlag(flag: AuditRiskFlag | null | undefined): string {
  if (!flag) return "Unbekannt";
  return RISK_FLAG_LABELS[flag] ?? flag;
}

export function formatIntegrityState(
  state: AuditIntegrityState | null | undefined,
): string {
  switch (state) {
    case "not_checked":
      return "Nicht geprüft";
    case "intact":
      return "Intakt";
    case "warning":
      return "Warnung";
    case "error":
      return "Fehler";
    default:
      return state ?? "Unbekannt";
  }
}

export function buildAuditSummary(input: {
  summary?: string | null;
  entity_typ?: string | null;
  action?: string | null;
}): string {
  if (input.summary) return input.summary;
  return `${formatEntityLabel(input.entity_typ)} ${formatActionLabel(input.action).toLowerCase()}`;
}

export function formatJsonPreview(value: unknown, maskSensitiveValues = true): string {
  if (value === null || value === undefined) return "{}";
  try {
    return JSON.stringify(maskSensitiveValues ? maskPreviewValue(value) : value, null, 2);
  } catch {
    return String(value);
  }
}

export function buildEventReference(event: AuditEventReferenceInput): string {
  return `${event.id}@${event.created_at}`;
}

export function formatShortId(value: string | null | undefined): string {
  return value ? value.slice(0, 8) : "-";
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  const formatted = value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1);
  return `${formatted} ${units[exponent]}`;
}

function humanizeToken(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toLocaleUpperCase("de-DE"));
}

function maskPreviewValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => maskPreviewValue(item));
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
      key,
      SENSITIVE_KEY_RE.test(key) ? "[maskiert]" : maskPreviewValue(nestedValue),
    ]),
  );
}
