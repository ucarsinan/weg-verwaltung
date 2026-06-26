import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import type { Database, AgentSuggestionStatus } from "@/lib/supabase/database.types";
import { SuggestionActions } from "./suggestion-actions";
import { acceptSuggestion, rejectSuggestion } from "./actions";

type AgentSuggestionRow =
  Database["public"]["Tables"]["agent_suggestion"]["Row"];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DATE_SHORT: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

function formatDateDE(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", DATE_SHORT);
}

type StatusConfig = {
  label: string;
  className: string;
};

const STATUS_CONFIG: Record<AgentSuggestionStatus, StatusConfig> = {
  vorschlag: {
    label: "Offen",
    className:
      "inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300",
  },
  uebernommen: {
    label: "Übernommen",
    className:
      "inline-flex items-center rounded-full border border-green-300 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 dark:border-green-700 dark:bg-green-950 dark:text-green-300",
  },
  verworfen: {
    label: "Verworfen",
    className:
      "inline-flex items-center rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-secondary)] px-2 py-0.5 text-xs font-medium text-[color:var(--color-secondary-foreground)]",
  },
};

export default async function VorschlaegeListPage({
  params,
}: {
  params: Promise<{ meetingId: string }>;
}) {
  const { meetingId } = await params;

  if (!UUID_RE.test(meetingId)) {
    notFound();
  }

  const supabase = await createClient();

  const { data: suggestions, error } = await supabase
    .from("agent_suggestion")
    .select("*")
    .eq("meeting_id", meetingId)
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<AgentSuggestionRow[]>();

  if (error) {
    console.error("[vorschlaege] select failed:", error);
  }

  const rows: AgentSuggestionRow[] = suggestions ?? [];

  return (
    <section className="mx-auto max-w-3xl space-y-6 px-6 py-12">
      <header className="min-w-0">
        <p className="mb-2 text-sm text-[color:var(--color-muted-foreground)]">
          <Link
            href={`/versammlungen/${meetingId}`}
            className="underline underline-offset-4 hover:text-[color:var(--color-foreground)]"
          >
            ← Versammlung
          </Link>
        </p>
        <h1 className="truncate text-2xl font-semibold tracking-tight">
          KI-Vorschläge
        </h1>
        <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
          Vom Agenten generierte Vorschläge für diese Versammlung. Entscheidungen
          werden im Audit-Log festgehalten.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Vorschläge ({rows.length})</CardTitle>
          <CardDescription>
            Offene Vorschläge können übernommen oder verworfen werden.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p
              role="status"
              className="rounded-md border border-dashed border-[color:var(--color-border)] p-6 text-center text-sm text-[color:var(--color-muted-foreground)]"
            >
              Noch keine KI-Vorschläge für diese Versammlung.
            </p>
          ) : (
            <ul
              aria-label="KI-Vorschläge"
              className="divide-y divide-[color:var(--color-border)]"
            >
              {rows.map((suggestion) => {
                const statusCfg =
                  STATUS_CONFIG[suggestion.status] ?? STATUS_CONFIG.vorschlag;

                return (
                  <li key={suggestion.id} className="space-y-3 py-5">
                    {/* Header row */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-full border border-[color:var(--color-border)] px-2 py-0.5 text-xs font-medium">
                        {suggestion.vorschlag_typ}
                      </span>
                      <span className={statusCfg.className}>
                        {statusCfg.label}
                      </span>
                      <span className="text-xs text-[color:var(--color-muted-foreground)]">
                        {formatDateDE(suggestion.created_at)}
                      </span>
                    </div>

                    {/* Payload preview */}
                    <pre className="overflow-auto rounded-md bg-[color:var(--color-secondary)] p-3 text-xs text-[color:var(--color-foreground)]">
                      {JSON.stringify(suggestion.payload, null, 2)}
                    </pre>

                    {/* Actions — only for open suggestions */}
                    {suggestion.status === "vorschlag" ? (
                      <SuggestionActions
                        meetingId={meetingId}
                        suggestionId={suggestion.id}
                        acceptAction={acceptSuggestion}
                        rejectAction={rejectSuggestion}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
