"use server";

import {
  agentErrorMessage,
  postAgenda,
  type AgendaItemSuggestion as BridgeAgendaItemSuggestion,
  type AgendaQuelle as BridgeAgendaQuelle,
  type AgendaVorschlag as BridgeAgendaVorschlag,
  type Konfidenz as BridgeKonfidenz,
} from "@/modules/agent-bridge";

// Typen kommen aus dem agent-bridge-Modul (eine Quelle statt Hand-Spiegel);
// hier als lokale Aliase für die Client-Komponenten — "use server"-Dateien
// vertragen keine `export type {…}`-Re-Exports (Turbopack).
export type AgendaItemSuggestion = BridgeAgendaItemSuggestion;
export type AgendaQuelle = BridgeAgendaQuelle;
export type Konfidenz = BridgeKonfidenz;
export type AgendaVorschlag = BridgeAgendaVorschlag;

export interface AgendaSuggestResult {
  vorschlag: AgendaVorschlag | null;
  thread_id: string | null;
  error: string | null;
}

/**
 * Calls POST /agent/agenda and returns the structured AgendaVorschlag.
 *
 * This is a Server Action: the JWT is read from the server-side Supabase
 * session inside the agent-bridge transport — the browser never sees the
 * token (§ 4.2).
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
    const data = await postAgenda({
      weg_id: wegId,
      verwalter_hinweis: verwalterHinweis ?? null,
    });

    return { vorschlag: data.vorschlag, thread_id: data.thread_id, error: null };
  } catch (err) {
    return {
      vorschlag: null,
      thread_id: null,
      error: agentErrorMessage("suggestAgendaWithAgent", err, {
        unavailable: (status) =>
          `KI-Vorschlag temporär nicht verfügbar (${status}). Bitte später erneut versuchen.`,
        unknown: "Unbekannter Fehler beim KI-Vorschlag.",
      }),
    };
  }
}
