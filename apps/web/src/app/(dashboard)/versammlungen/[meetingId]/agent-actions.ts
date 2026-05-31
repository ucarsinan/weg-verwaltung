"use server";

import { agentJson, AgentAuthError, AgentResponseError } from "@/lib/agent/fetch";

// ---------------------------------------------------------------------------
// Types — mirrors AgendaVorschlag from apps/agent/graphs/agenda.py
// ---------------------------------------------------------------------------

export type Konfidenz = "hoch" | "mittel" | "niedrig";
export type AgendaQuelle =
  | "vorjahres_protokoll"
  | "branchenstandard"
  | "frist_gebunden";

export interface AgendaItemSuggestion {
  titel: string;
  beschreibung: string;
  rationale: string;
  quelle: AgendaQuelle;
}

export interface AgendaVorschlag {
  items: AgendaItemSuggestion[];
  konfidenz: Konfidenz;
  fehlende_inputs: string[];
}

export interface AgendaSuggestResult {
  vorschlag: AgendaVorschlag | null;
  thread_id: string | null;
  error: string | null;
}

// Agent response shape (mirrors AgendaResponse in apps/agent/routers/agenda.py).
interface AgentAgendaResponse {
  vorschlag: AgendaVorschlag;
  thread_id: string;
}

// ---------------------------------------------------------------------------
// Server Action
// ---------------------------------------------------------------------------

/**
 * Calls POST /agent/agenda and returns the structured AgendaVorschlag.
 *
 * This is a Server Action: the JWT is read from the server-side Supabase
 * session via `agentJson` — the browser never sees the token (§ 4.2).
 *
 * Returns an AgendaSuggestResult (never throws) so the client component can
 * display errors inline without a global error boundary.
 *
 * Invariant (§ 1): KI = nur Vorschläge. The action only reads — the
 * Verwalter decides whether to adopt any suggested TOPs.
 */
export async function suggestAgendaWithAgent(
  wegId: string,
  verwalterHinweis?: string,
): Promise<AgendaSuggestResult> {
  if (!wegId) {
    return {
      vorschlag: null,
      thread_id: null,
      error: "WEG-ID fehlt — Tagesordnung kann nicht vorgeschlagen werden.",
    };
  }

  try {
    const data = await agentJson<AgentAgendaResponse>("/agent/agenda", {
      method: "POST",
      body: JSON.stringify({
        weg_id: wegId,
        verwalter_hinweis: verwalterHinweis ?? null,
      }),
    });

    return { vorschlag: data.vorschlag, thread_id: data.thread_id, error: null };
  } catch (err) {
    if (err instanceof AgentAuthError) {
      return {
        vorschlag: null,
        thread_id: null,
        error: "Sitzung abgelaufen — bitte neu einloggen.",
      };
    }
    if (err instanceof AgentResponseError) {
      if (err.status === 400) {
        let detail = "Eingabe wurde vom Prüfsystem abgelehnt.";
        try {
          const parsed = JSON.parse(err.body) as { detail?: string };
          if (typeof parsed.detail === "string") detail = parsed.detail;
        } catch {
          // body was not JSON — keep the fallback
        }
        return { vorschlag: null, thread_id: null, error: detail };
      }
      return {
        vorschlag: null,
        thread_id: null,
        error: `KI-Vorschlag temporär nicht verfügbar (${err.status}). Bitte später erneut versuchen.`,
      };
    }
    console.error("[suggestAgendaWithAgent] unexpected error", err);
    return {
      vorschlag: null,
      thread_id: null,
      error: "Unbekannter Fehler beim KI-Vorschlag.",
    };
  }
}
