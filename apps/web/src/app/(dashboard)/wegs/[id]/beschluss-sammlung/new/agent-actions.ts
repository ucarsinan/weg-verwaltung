"use server";

import { agentJson, AgentAuthError, AgentResponseError } from "@/lib/agent/fetch";

// ---------------------------------------------------------------------------
// Types — mirrors BestimmtheitsBefund from apps/agent/graphs/beschluss.py
// ---------------------------------------------------------------------------

export type Konfidenz = "hoch" | "mittel" | "niedrig";

export interface BestimmtheitsBefund {
  antragsteller_klar: boolean;
  beschlussgegenstand_klar: boolean;
  mehrheitserfordernis_klar: boolean;
  fehlende_elemente: string[];
  redlining_vorschlag: string;
  konfidenz: Konfidenz;
}

export interface BeschlussCheckResult {
  befund: BestimmtheitsBefund | null;
  thread_id: string | null;
  error: string | null;
}

// The agent response shape (mirrors BeschlussCheckResponse in the router).
interface AgentBeschlussResponse {
  befund: BestimmtheitsBefund;
  thread_id: string;
}

// ---------------------------------------------------------------------------
// Server Action
// ---------------------------------------------------------------------------

const DRAFT_MIN = 20;
const DRAFT_MAX = 8_000; // § 4.6 Layer 1 cap on agent side is also 8k

/**
 * Calls POST /agent/beschluss and returns the structured BestimmtheitsBefund.
 *
 * This is a Server Action: the JWT is read from the server-side Supabase
 * session via `agentFetch` — the browser never sees the token.
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
    const data = await agentJson<AgentBeschlussResponse>("/agent/beschluss", {
      method: "POST",
      body: JSON.stringify({ weg_id: wegId, draft_text: trimmed }),
    });

    return { befund: data.befund, thread_id: data.thread_id, error: null };
  } catch (err) {
    if (err instanceof AgentAuthError) {
      return {
        befund: null,
        thread_id: null,
        error: "Sitzung abgelaufen — bitte neu einloggen.",
      };
    }
    if (err instanceof AgentResponseError) {
      if (err.status === 400) {
        // The guardrail layer rejected the input — surface the detail.
        let detail = "Eingabe wurde vom Prüfsystem abgelehnt.";
        try {
          const parsed = JSON.parse(err.body) as { detail?: string };
          if (typeof parsed.detail === "string") detail = parsed.detail;
        } catch {
          // body was not JSON — keep the fallback
        }
        return { befund: null, thread_id: null, error: detail };
      }
      return {
        befund: null,
        thread_id: null,
        error: `KI-Prüfung temporär nicht verfügbar (${err.status}). Bitte später erneut versuchen.`,
      };
    }
    console.error("[checkBeschlussWithAgent] unexpected error", err);
    return {
      befund: null,
      thread_id: null,
      error: "Unbekannter Fehler bei der KI-Prüfung.",
    };
  }
}
