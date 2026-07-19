"use client";

/**
 * BeschlussReviewPanel — displays the structured BestimmtheitsBefund from
 * the beschluss_graph (§ 4.1, Use-Case 2).
 *
 * The three Bestimmtheitsgrundsatz booleans are the primary signal:
 *   - antragsteller_klar
 *   - beschlussgegenstand_klar
 *   - mehrheitserfordernis_klar
 *
 * The `redlining_vorschlag` is the actionable output — the Verwalter can
 * copy it back into the draft. This component never writes to the DB;
 * that stays in the existing `BeschlussSammlungForm` / Server Action.
 *
 * Invariant (§ 1): KI = nur Vorschläge. The panel is read-only.
 */

import { useActionState, useCallback } from "react";
import { checkBeschlussWithAgent } from "./agent-actions";
import type { BeschlussCheckResult, BestimmtheitsBefund } from "./agent-actions";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CheckRow({
  label,
  ok,
}: {
  label: string;
  ok: boolean;
}) {
  return (
    <div className="flex items-start gap-3 py-1">
      <span
        className={
          ok
            ? "mt-0.5 shrink-0 text-green-600 dark:text-green-400"
            : "mt-0.5 shrink-0 text-red-500 dark:text-red-400"
        }
        aria-hidden="true"
      >
        {ok ? "✓" : "✗"}
      </span>
      <span className="text-sm text-[color:var(--color-foreground)]">{label}</span>
      <span
        className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
          ok
            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
            : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
        }`}
      >
        {ok ? "Klar" : "Fehlt"}
      </span>
    </div>
  );
}

function KonfidenzBadge({ konfidenz }: { konfidenz: BestimmtheitsBefund["konfidenz"] }) {
  const styles: Record<BestimmtheitsBefund["konfidenz"], string> = {
    hoch: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    mittel: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    niedrig: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  };
  const labels: Record<BestimmtheitsBefund["konfidenz"], string> = {
    hoch: "Hohe Sicherheit",
    mittel: "Mittlere Sicherheit",
    niedrig: "Niedrige Sicherheit",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[konfidenz]}`}
    >
      {labels[konfidenz]}
    </span>
  );
}

function BefundDisplay({ befund }: { befund: BestimmtheitsBefund }) {
  const allOk =
    befund.antragsteller_klar &&
    befund.beschlussgegenstand_klar &&
    befund.mehrheitserfordernis_klar;

  return (
    <div
      className={`rounded-md border p-4 space-y-4 ${
        allOk
          ? "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950"
          : "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950"
      }`}
      role="region"
      aria-label="KI-Prüfungsergebnis"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[color:var(--color-foreground)]">
          {allOk
            ? "Beschluss erfüllt den Bestimmtheitsgrundsatz"
            : "Bestimmtheitsgrundsatz nicht vollständig erfüllt"}
        </h3>
        <KonfidenzBadge konfidenz={befund.konfidenz} />
      </div>

      {/* Three-boolean check */}
      <div
        className="divide-y divide-[color:var(--color-border)] rounded-sm border border-[color:var(--color-border)] bg-[color:var(--color-background)] px-3 py-1"
        aria-label="Drei-Elemente-Prüfung Bestimmtheitsgrundsatz"
      >
        <CheckRow label="Antragsteller eindeutig benannt" ok={befund.antragsteller_klar} />
        <CheckRow label="Beschlussgegenstand konkret bestimmt" ok={befund.beschlussgegenstand_klar} />
        <CheckRow label="Mehrheitserfordernis explizit angegeben" ok={befund.mehrheitserfordernis_klar} />
      </div>

      {/* Missing elements */}
      {(befund.fehlende_elemente ?? []).length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-[color:var(--color-muted-foreground)] uppercase tracking-wide">
            Fehlende Elemente
          </p>
          <ul className="list-disc list-inside space-y-0.5">
            {(befund.fehlende_elemente ?? []).map((el, i) => (
              <li key={i} className="text-sm text-[color:var(--color-foreground)]">
                {el}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Redlining suggestion */}
      <div>
        <p className="mb-1 text-xs font-medium text-[color:var(--color-muted-foreground)] uppercase tracking-wide">
          Formulierungsvorschlag (KI — nur zur Orientierung)
        </p>
        <blockquote className="rounded-sm border-l-4 border-blue-400 bg-blue-50 px-3 py-2 text-sm text-[color:var(--color-foreground)] dark:bg-blue-950 dark:border-blue-600 italic">
          {befund.redlining_vorschlag}
        </blockquote>
        <p className="mt-1.5 text-xs text-[color:var(--color-muted-foreground)]">
          KI-Vorschlag — der Verwalter entscheidet. Der Beschluss wird erst nach
          manuellem Speichern eingetragen.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

interface BeschlussReviewPanelProps {
  wegId: string;
  /** Callback that reads the current textarea value. */
  getDraftText: () => string;
}

type ReviewAction = (prev: BeschlussCheckResult, formData: FormData) => Promise<BeschlussCheckResult>;

const _initial: BeschlussCheckResult = { befund: null, thread_id: null, error: null };

export default function BeschlussReviewPanel({
  wegId,
  getDraftText,
}: BeschlussReviewPanelProps) {
  // wegId is stable (derived from URL params — does not change while the page
  // is mounted). useCallback keeps the action identity stable across re-renders.
  const reviewAction: ReviewAction = useCallback(
    async (_prev, _fd) => {
      void _fd; // formData is unused — textarea value comes from getDraftText()
      const text = getDraftText();
      return checkBeschlussWithAgent(wegId, text);
    },
    [wegId, getDraftText],
  );

  const [result, formAction, isPending] = useActionState<BeschlussCheckResult, FormData>(
    reviewAction,
    _initial,
  );

  return (
    <div className="space-y-3">
      <form action={formAction}>
        <button
          type="submit"
          disabled={isPending}
          className={`inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
            isPending
              ? "cursor-not-allowed opacity-50 border-[color:var(--color-border)] bg-transparent text-[color:var(--color-muted-foreground)]"
              : "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
          }`}
          aria-describedby="ki-hint"
        >
          {isPending ? (
            <>
              <span
                className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
                aria-hidden="true"
              />
              KI prüft …
            </>
          ) : (
            "KI-Prüfung: Bestimmtheitsgrundsatz"
          )}
        </button>
      </form>

      <p
        id="ki-hint"
        className="text-xs text-[color:var(--color-muted-foreground)]"
      >
        Prüft den Beschlusstext auf Antragsteller, Beschlussgegenstand und
        Mehrheitserfordernis (§ 23 WEG). Nur ein Vorschlag — der Verwalter entscheidet.
      </p>

      {result.error ? (
        <div
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
        >
          {result.error}
        </div>
      ) : null}

      {result.befund ? <BefundDisplay befund={result.befund} /> : null}
    </div>
  );
}
