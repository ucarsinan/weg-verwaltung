/**
 * agent-bridge — einziger Seam zwischen apps/web und dem FastAPI-Agenten.
 *
 * Envelope- UND Payload-Typen kommen generiert aus
 * `@weg-verwaltung/shared-types` (OpenAPI → `just codegen`); Drift zwischen
 * Pydantic-Schemas und TS wird damit zum Compile-Fehler. Einzige Ausnahme:
 * der Vorgang-Router liefert seine Suggestion bewusst als lose `dict`
 * (heterogene Vorschlagstypen) — deren Verfeinerung lebt genau hier.
 *
 * Transport: `agentFetch`/`agentJson` (JWT-Pass-through, § 4.2) — Server
 * Actions rufen die typisierten `post*`-Helfer, nie `fetch` direkt.
 */

import type { components } from "@weg-verwaltung/shared-types";

import {
  AgentAuthError,
  AgentResponseError,
  agentJson,
} from "./fetch";

export { AgentAuthError, AgentResponseError, agentFetch, agentJson } from "./fetch";

// ---------------------------------------------------------------------------
// Generierte Envelope-Typen (Wire-Kontrakt)
// ---------------------------------------------------------------------------

export type AgentSchemas = components["schemas"];
export type AgendaInvokeRequest = AgentSchemas["AgendaInvokeRequest"];
export type AgendaResponse = AgentSchemas["AgendaResponse"];
export type AgendaItemSuggestion = AgentSchemas["AgendaItemSuggestion"];
export type AgendaVorschlag = AgentSchemas["AgendaVorschlag"];
export type BeschlussRequest = AgentSchemas["BeschlussRequest"];
export type BeschlussCheckResponse = AgentSchemas["BeschlussCheckResponse"];
export type BestimmtheitsBefund = AgentSchemas["BestimmtheitsBefund"];
export type ProtokollRequest = AgentSchemas["ProtokollRequest"];
export type ProtokollResponse = AgentSchemas["ProtokollResponse"];
export type VorgangInvokeRequest = AgentSchemas["VorgangInvokeRequest"];
export type VorgangResponse = AgentSchemas["VorgangResponse"];

export type Konfidenz = AgendaVorschlag["konfidenz"];
export type AgendaQuelle = AgendaItemSuggestion["quelle"];

// Einzige verbleibende Hand-Verfeinerung: der Vorgang-Router sendet die
// Suggestion bewusst als lose `dict` (heterogene Vorschlagstypen).
export interface VorgangSuggestion {
  suggestion_type?: string;
  title?: string;
  summary?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Typisierte Endpoint-Aufrufe
// ---------------------------------------------------------------------------

export function postAgenda(body: AgendaInvokeRequest): Promise<AgendaResponse> {
  return agentJson("/agent/agenda", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function postBeschluss(
  body: BeschlussRequest,
): Promise<BeschlussCheckResponse> {
  return agentJson("/agent/beschluss", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function postProtokoll(body: ProtokollRequest): Promise<ProtokollResponse> {
  return agentJson("/agent/protokoll", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function postVorgang(
  body: VorgangInvokeRequest,
): Promise<VorgangResponse & { suggestion: VorgangSuggestion }> {
  return agentJson("/agent/vorgang", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Zentrale Fehler-Übersetzung (eine Stelle statt vier Kopien)
// ---------------------------------------------------------------------------

export interface AgentErrorMessages {
  /** Meldung für Nicht-400-Fehler des Agenten; bekommt den HTTP-Status. */
  unavailable: (status: number) => string;
  /** Meldung für unerwartete Fehler (Netz, Parsing, Bugs). */
  unknown: string;
  /** Fallback, wenn ein 400 kein `detail`-Feld trägt. */
  rejected?: string;
}

function readAgentDetail(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { detail?: unknown };
    if (typeof parsed.detail === "string" && parsed.detail.trim()) {
      return parsed.detail;
    }
  } catch {
    return null;
  }
  return null;
}

export function agentErrorMessage(
  context: string,
  err: unknown,
  messages: AgentErrorMessages,
): string {
  if (err instanceof AgentAuthError) {
    return "Sitzung abgelaufen — bitte neu einloggen.";
  }
  if (err instanceof AgentResponseError) {
    if (err.status === 400) {
      return (
        readAgentDetail(err.body) ??
        messages.rejected ??
        "Eingabe wurde vom Prüfsystem abgelehnt."
      );
    }
    return messages.unavailable(err.status);
  }
  console.error(`[${context}] unexpected error`, err);
  return messages.unknown;
}
