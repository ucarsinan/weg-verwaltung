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
import { Button } from "@/components/ui/button";
import type { Database } from "@/lib/supabase/database.types";
import {
  PROTOCOL_STATUS_LABEL,
  isProtocolStatus,
} from "@/modules/versammlung";
import { generateProtokoll, submitRevision, signProtokoll } from "./protokoll-actions";
import { DraftReviewForm } from "./draft-review-form";
import { SignForm } from "./sign-form";

type ProtocolRow = Database["public"]["Tables"]["protocol"]["Row"];
type MeetingRow = Database["public"]["Tables"]["meeting"]["Row"];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  params: Promise<{ meetingId: string }>;
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

function StatusPill({ status }: { status: string }) {
  const label = isProtocolStatus(status) ? PROTOCOL_STATUS_LABEL[status] : status;

  const classMap: Record<string, string> = {
    awaiting_review:
      "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200",
    ki_entwurf:
      "border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-200",
    verwalter_revision:
      "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200",
    unterzeichnet:
      "border-green-300 bg-green-50 text-green-800 dark:border-green-700 dark:bg-green-950 dark:text-green-200",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${classMap[status] ?? "border-[color:var(--color-border)]"}`}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function ProtokollPage({ params }: PageProps) {
  const { meetingId } = await params;

  if (!UUID_RE.test(meetingId)) {
    notFound();
  }

  const supabase = await createClient();

  // Load meeting
  const { data: meeting, error: meetingError } = await supabase
    .from("meeting")
    .select("id, titel, weg_id, tenant_id, status")
    .eq("id", meetingId)
    .single<
      Pick<MeetingRow, "id" | "titel" | "weg_id" | "tenant_id" | "status">
    >();

  if (meetingError?.code === "PGRST116" || !meeting) {
    notFound();
  }

  if (meetingError) {
    console.error("[protokoll] meeting select failed:", meetingError);
    throw new Error("Versammlung konnte nicht geladen werden.");
  }

  if (meeting.status !== "beendet") {
    return (
      <section className="mx-auto max-w-3xl space-y-6 px-6 py-12">
        <header className="min-w-0">
          <p className="mb-2 text-sm text-[color:var(--color-muted-foreground)]">
            <Link
              href={`/versammlungen/${meetingId}`}
              className="underline underline-offset-4 hover:text-[color:var(--color-foreground)]"
            >
              ← Zurück zur Versammlung
            </Link>
          </p>
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            Protokoll
          </h1>
          <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
            {meeting.titel}
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Protokoll noch gesperrt</CardTitle>
            <CardDescription>
              Protokoll-Generierung und Review sind erst verfügbar, wenn die
              Versammlung beendet wurde.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    );
  }

  // Load protocol for this meeting (one-to-one via protocol_meeting_fk)
  const { data: protocol, error: protocolError } = await supabase
    .from("protocol")
    .select("id, status, text, document_id, meeting_id, langgraph_thread_id")
    .eq("meeting_id", meetingId)
    .maybeSingle<
      Pick<ProtocolRow, "id" | "status" | "text" | "document_id" | "meeting_id" | "langgraph_thread_id">
    >();

  if (protocolError) {
    console.error("[protokoll] protocol select failed:", protocolError);
    // Non-fatal — we'll treat as no protocol
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <section className="mx-auto max-w-3xl space-y-6 px-6 py-12">
      {/* Breadcrumb */}
      <header className="min-w-0">
        <p className="mb-2 text-sm text-[color:var(--color-muted-foreground)]">
          <Link
            href={`/versammlungen/${meetingId}`}
            className="underline underline-offset-4 hover:text-[color:var(--color-foreground)]"
          >
            ← Zurück zur Versammlung
          </Link>
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            Protokoll
          </h1>
          {protocol ? <StatusPill status={protocol.status} /> : null}
        </div>
        <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
          {meeting.titel}
        </p>
      </header>

      {/* ── Case 1: No protocol exists ─────────────────────────────── */}
      {!protocol ? (
        <Card>
          <CardHeader>
            <CardTitle>Kein Protokoll vorhanden</CardTitle>
            <CardDescription>
              Der KI-Agent entwirft ein Protokoll auf Basis der Versammlungs-Daten
              und Tagesordnungspunkte. Das Ergebnis ist ein Vorschlag — der
              Verwalter prüft und unterzeichnet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              action={async () => {
                "use server";
                await generateProtokoll(meetingId);
              }}
            >
              <Button type="submit">Protokoll generieren</Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {/* ── Case 2: awaiting_review — Verwalter prüft den KI-Entwurf ── */}
      {protocol?.status === "awaiting_review" ? (
        <Card>
          <CardHeader>
            <CardTitle>KI-Entwurf prüfen</CardTitle>
            <CardDescription>
              Der Agent hat einen Protokoll-Entwurf erstellt. Bitte prüfen, ggf.
              anpassen und anschließend freigeben.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DraftReviewForm
              meetingId={meetingId}
              threadId={protocol.langgraph_thread_id ?? ""}
              initialDraft={protocol.text ?? ""}
              submitRevisionAction={submitRevision}
            />
          </CardContent>
        </Card>
      ) : null}

      {/* ── Case 3: ki_entwurf — Verwalter-Freigabe, bereit zur Unterzeichnung ─ */}
      {protocol?.status === "ki_entwurf" ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Protokoll-Entwurf</CardTitle>
              <CardDescription>
                Vom Verwalter geprüfter Entwurf. Bereit zur Unterzeichnung.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="overflow-auto whitespace-pre-wrap rounded-md bg-[color:var(--color-secondary)] px-4 py-3 font-mono text-sm text-[color:var(--color-foreground)]">
                {protocol.text}
              </pre>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Unterzeichnen</CardTitle>
              <CardDescription>
                Mit der Unterzeichnung wird das Protokoll rechtskräftig und ein
                PDF im Dokumenten-Archiv abgelegt (§ 24 Abs. 7 WEG).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SignForm
                protocolId={protocol.id}
                signAction={signProtokoll}
              />
            </CardContent>
          </Card>
        </>
      ) : null}

      {/* ── Case 4: unterzeichnet — final ─────────────────────────── */}
      {protocol?.status === "unterzeichnet" ? (
        <Card>
          <CardHeader>
            <CardTitle>Protokoll unterzeichnet</CardTitle>
            <CardDescription>
              Das Protokoll wurde unterzeichnet und ist im Dokumenten-Archiv
              abgelegt.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Status indicator */}
            <div
              role="status"
              className="flex items-center gap-2 rounded-md border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-700 dark:bg-green-950 dark:text-green-200"
            >
              <span aria-hidden="true">✓</span>
              Protokoll ist rechtskräftig unterzeichnet.
            </div>

            {/* PDF download link — only when document_id is set */}
            {protocol.document_id ? (
              <div>
                <p className="mb-2 text-sm text-[color:var(--color-muted-foreground)]">
                  Das Protokoll-PDF steht im Dokumenten-Archiv zur Verfügung.
                </p>
                <Button asChild variant="outline">
                  <Link href={`/wegs/${meeting.weg_id}/beschluss-sammlung`}>
                    Zum Dokumenten-Archiv
                  </Link>
                </Button>
              </div>
            ) : null}

            {/* Protocol text (read-only) */}
            {protocol.text ? (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-[color:var(--color-muted-foreground)] underline underline-offset-4">
                  Protokoll-Text anzeigen
                </summary>
                <pre className="mt-3 overflow-auto whitespace-pre-wrap rounded-md bg-[color:var(--color-secondary)] px-4 py-3 font-mono text-sm text-[color:var(--color-foreground)]">
                  {protocol.text}
                </pre>
              </details>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}
