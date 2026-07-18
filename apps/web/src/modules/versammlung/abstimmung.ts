/**
 * Abstimmungs-Aggregation für einen Beschluss.
 *
 * Einziger Owner für die Tally-Bildung aus rohen Vote-Zeilen. Die
 * konstitutive Feststellung bleibt der SQL-RPC `feststellen_resolution`
 * (0004/0049) — `evaluateMajority` liefert hier nur die unverbindliche
 * Vorschau derselben Regeln für die Anzeige.
 *
 * Section-1-Invariante 5: Stimmen hängen an `ownership_id`, nie an
 * Person/User — Co-Eigentümer teilen sich eine Stimme pro Ownership.
 */

import type { VoteWert } from "@/lib/supabase/database.types";
import type { VoteTally } from "./majority";

export interface VoteRow {
  ownership_id: string;
  wert: string;
}

export interface AbstimmungState {
  /** Letzter bekannter Stimmwert je Ownership (für die Formular-Anzeige). */
  voteByOwnership: Map<string, VoteWert>;
  /** Aggregat in der Form, die die Mehrheits-Strategy konsumiert. */
  tally: VoteTally;
}

const VOTE_WERTE: readonly VoteWert[] = ["ja", "nein", "enthaltung"];

function isVoteWert(value: string): value is VoteWert {
  return (VOTE_WERTE as readonly string[]).includes(value);
}

export function buildAbstimmungState(
  votes: readonly VoteRow[],
  options?: { totalEligible?: number },
): AbstimmungState {
  const voteByOwnership = new Map<string, VoteWert>();
  for (const vote of votes) {
    if (isVoteWert(vote.wert)) {
      voteByOwnership.set(vote.ownership_id, vote.wert);
    }
  }

  const tally: VoteTally = {
    ja: 0,
    nein: 0,
    enthaltung: 0,
    total_eligible: options?.totalEligible,
  };
  for (const wert of voteByOwnership.values()) {
    tally[wert] += 1;
  }

  return { voteByOwnership, tally };
}
