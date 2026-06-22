"use client";

/**
 * AgendaReviewPanel — displays the structured AgendaVorschlag from
 * agenda_graph (§ 4.1, Use-Case 1).
 *
 * The panel shows the list of suggested TOPs with their rationale and source
 * badge. The Verwalter can adopt individual TOPs manually via the existing
 * "TOP hinzufügen" flow. This component never writes to the DB.
 *
 * Invariant (§ 1): KI = nur Vorschläge. The panel is read-only.
 */

import { useActionState } from "react";
import { suggestAgendaWithAgent } from "./agent-actions";
import type {
  AgendaSuggestResult,
  AgendaItemSuggestion,
  AgendaQuelle,
  Konfidenz,
} from "./agent-actions";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const QUELLE_LABEL: Record<AgendaQuelle, string> = {
  vorjahres_protokoll: "Vorjahres-Protokoll",
  branchenstandard: "Branchenstandard",
  frist_gebunden: "Fristgebunden",
};

const QUELLE_STYLE: Record<AgendaQuelle, string> = {
  vorjahres_protokoll:
    "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  branchenstandard:
    "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  frist_gebunden:
    "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
};

function QuelleChip({ quelle }: { quelle: AgendaQuelle }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${QUELLE_STYLE[quelle]}`}
    >
      {QUELLE_LABEL[quelle]}
    </span>
  );
}

function KonfidenzBadge({ konfidenz }: { konfidenz: Konfidenz }) {
  const styles: Record<Konfidenz, string> = {
    hoch: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    mittel:
      "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    niedrig: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  };
  const labels: Record<Konfidenz, string> = {
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

function AgendaItemCard({
  item,
  index,
}: {
  item: AgendaItemSuggestion;
  index: number;
}) {
  return (
    <li className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-background)] p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span
            className="shrink-0 text-sm font-medium tabular-nums text-[color:var(--color-muted-foreground)]"
            aria-label={`TOP ${index + 1}`}
          >
            {index + 1}.
          </span>
          <p className="text-sm font-medium text-[color:var(--color-foreground)] leading-snug">
            {item.titel}
          </p>
        </div>
        <QuelleChip quelle={item.quelle} />
      </div>
      {item.beschreibung ? (
        <p className="pl-6 text-sm text-[color:var(--color-muted-foreground)] leading-relaxed">
          {item.beschreibung}
        </p>
      ) : null}
      {item.rationale ? (
        <p className="pl-6 text-xs italic text-[color:var(--color-muted-foreground)]">
          Begründung: {item.rationale}
        </p>
      ) : null}
    </li>
  );
}

function VorschlagDisplay({ result }: { result: AgendaSuggestResult }) {
  const { vorschlag } = result;
  if (!vorschlag) return null;

  return (
    <div
      className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-secondary)] p-4 space-y-4"
      role="region"
      aria-label="KI-Tagesordnungsvorschlag"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[color:var(--color-foreground)]">
          Vorgeschlagene Tagesordnung ({vorschlag.items.length} TOPs)
        </h3>
        <KonfidenzBadge konfidenz={vorschlag.konfidenz} />
      </div>

      {/* TOP list */}
      <ol className="space-y-3" aria-label="Vorgeschlagene Tagesordnungspunkte">
        {vorschlag.items.map((item, i) => (
          <AgendaItemCard key={i} item={item} index={i} />
        ))}
      </ol>

      {/* Missing inputs */}
      {vorschlag.fehlende_inputs.length > 0 ? (
        <div className="rounded-sm border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-700 dark:bg-amber-950">
          <p className="mb-1 text-xs font-medium text-amber-700 dark:text-amber-300 uppercase tracking-wide">
            Fehlende Kontext-Informationen
          </p>
          <ul className="list-disc list-inside space-y-0.5">
            {vorschlag.fehlende_inputs.map((inp, i) => (
              <li
                key={i}
                className="text-xs text-amber-800 dark:text-amber-200"
              >
                {inp}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-xs text-[color:var(--color-muted-foreground)]">
        KI-Vorschlag — der Verwalter entscheidet. TOPs können über „TOP hinzufügen“
        manuell übernommen werden.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

interface AgendaReviewPanelProps {
  wegId: string;
}

type SuggestAction = (
  prev: AgendaSuggestResult,
  formData: FormData,
) => Promise<AgendaSuggestResult>;

const _initial: AgendaSuggestResult = {
  vorschlag: null,
  thread_id: null,
  error: null,
};

export default function AgendaReviewPanel({ wegId }: AgendaReviewPanelProps) {
  const suggestAction: SuggestAction = async () => {
    return suggestAgendaWithAgent(wegId);
  };

  const [result, formAction, isPending] = useActionState<
    AgendaSuggestResult,
    FormData
  >(suggestAction, _initial);

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
          aria-describedby="agenda-ki-hint"
        >
          {isPending ? (
            <>
              <span
                className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
                aria-hidden="true"
              />
              KI erstellt Vorschlag …
            </>
          ) : (
            "Tagesordnung vorschlagen"
          )}
        </button>
      </form>

      <p
        id="agenda-ki-hint"
        className="text-xs text-[color:var(--color-muted-foreground)]"
      >
        Schlägt TOPs auf Basis der Vorjahres-Protokolle vor. Nur ein Vorschlag
        — der Verwalter entscheidet.
      </p>

      {result.error ? (
        <div
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
        >
          {result.error}
        </div>
      ) : null}

      {result.vorschlag ? <VorschlagDisplay result={result} /> : null}
    </div>
  );
}
