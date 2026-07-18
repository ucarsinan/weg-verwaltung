"use server";

import {
  agentErrorMessage,
  postBeschluss,
  type BestimmtheitsBefund as BridgeBestimmtheitsBefund,
  type Konfidenz as BridgeKonfidenz,
} from "@/modules/agent-bridge";

// Typen kommen aus dem agent-bridge-Modul (eine Quelle statt Hand-Spiegel);
// hier als lokale Aliase für die Client-Komponenten — "use server"-Dateien
// vertragen keine `export type {…}`-Re-Exports (Turbopack).
export type BestimmtheitsBefund = BridgeBestimmtheitsBefund;
export type Konfidenz = BridgeKonfidenz;

export interface BeschlussCheckResult {
  befund: BestimmtheitsBefund | null;
  thread_id: string | null;
  error: string | null;
}

const DRAFT_MIN = 20;
const DRAFT_MAX = 8_000; // § 4.6 Layer 1 cap on agent side is also 8k

/**
 * Calls POST /agent/beschluss and returns the structured BestimmtheitsBefund.
 *
 * This is a Server Action: the JWT is read from the server-side Supabase
 * session inside the agent-bridge transport — the browser never sees the token.
 *
 * Returns a BeschlussCheckResult (never throws) so the client component can
 * display errors inline without a global error boundary.
 */
export async function checkBeschlussWithAgent(
  wegId: string,
  draftText: string,
): Promise<BeschlussCheckResult> {
  const trimmed = draftText.trim();

  if (trimmed.length < DRAFT_MIN) {
    return {
      befund: null,
      thread_id: null,
      error: `Beschlusstext muss mindestens ${DRAFT_MIN} Zeichen lang sein.`,
    };
  }
  if (trimmed.length > DRAFT_MAX) {
    return {
      befund: null,
      thread_id: null,
      error: `Beschlusstext darf höchstens ${DRAFT_MAX} Zeichen lang sein.`,
    };
  }

  try {
    const data = await postBeschluss({ weg_id: wegId, draft_text: trimmed });

    return { befund: data.befund, thread_id: data.thread_id, error: null };
  } catch (err) {
    return {
      befund: null,
      thread_id: null,
      error: agentErrorMessage("checkBeschlussWithAgent", err, {
        unavailable: (status) =>
          `KI-Prüfung temporär nicht verfügbar (${status}). Bitte später erneut versuchen.`,
        unknown: "Unbekannter Fehler bei der KI-Prüfung.",
      }),
    };
  }
}
