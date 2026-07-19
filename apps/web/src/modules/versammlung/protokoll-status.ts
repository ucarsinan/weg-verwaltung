/**
 * Protokoll-Lebenszyklus — einziger Owner der Status-Statemachine.
 *
 * Kanonischer Satz laut DB-Check-Constraint (0004 + 0032):
 *   awaiting_review → ki_entwurf → (verwalter_revision) → unterzeichnet
 *
 * Wer schreibt welchen Übergang:
 *  - `generateProtokoll` (Web) upsertet `awaiting_review`, während der Agent
 *    am HITL-Interrupt pausiert.
 *  - `persist_node` (Agent, graphs/protokoll.py) schreibt `ki_entwurf` nach
 *    dem Resume — der einzige Übergang außerhalb der Web-App.
 *  - `signProtokoll` (Web, nur Mensch) schreibt `unterzeichnet`; der KI-Guard
 *    (0011) blockt actor_type=agent auf diesem Übergang zusätzlich in der DB.
 *  - `verwalter_revision` ist im Schema erlaubt, wird derzeit aber von keinem
 *    Pfad gesetzt.
 */

export const PROTOCOL_STATUSES = [
  "awaiting_review",
  "ki_entwurf",
  "verwalter_revision",
  "unterzeichnet",
] as const;

export type ProtocolStatus = (typeof PROTOCOL_STATUSES)[number];

export const PROTOCOL_STATUS_LABEL: Record<ProtocolStatus, string> = {
  awaiting_review: "Warte auf Prüfung",
  ki_entwurf: "KI-Entwurf freigegeben",
  verwalter_revision: "In Verwalter-Revision",
  unterzeichnet: "Unterzeichnet",
};

export function isProtocolStatus(value: unknown): value is ProtocolStatus {
  return (
    typeof value === "string" &&
    (PROTOCOL_STATUSES as readonly string[]).includes(value)
  );
}

/** Revision (Resume des HITL-Threads) ist nur aus `awaiting_review` erlaubt. */
export function canSubmitRevision(status: string | null): boolean {
  return status === "awaiting_review";
}

/** Unterzeichnung ist nur aus `ki_entwurf` erlaubt (Mensch-only). */
export function canSign(status: string | null): boolean {
  return status === "ki_entwurf";
}
