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
import { sendInvitation } from "./actions";
import { InvitationForm } from "./invitation-form";
import AgendaReviewPanel from "./agenda-review-panel";
import type { Database, MeetingModus, MeetingStatus } from "@/lib/supabase/database.types";

type MeetingRow = Database["public"]["Tables"]["meeting"]["Row"];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DATE_LONG: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

function formatDateLongDE(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", DATE_LONG);
}

const MODUS_LABEL: Record<MeetingModus, string> = {
  praesenz: "Präsenz",
  hybrid: "Hybrid",
  virtuell: "Virtuell",
  umlauf: "Umlauf",
};

const STATUS_LABEL: Record<MeetingStatus, string> = {
  entwurf: "Entwurf",
  eingeladen: "Eingeladen",
  laufend: "Laufend",
  beendet: "Beendet",
  abgesagt: "Abgesagt",
};

export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ meetingId: string }>;
}) {
  const { meetingId } = await params;

  if (!UUID_RE.test(meetingId)) {
    notFound();
  }

  const supabase = await createClient();
  const { data: meeting, error: meetingError } = await supabase
    .from("meeting")
    .select("*")
    .eq("id", meetingId)
    .single<MeetingRow>();

  if (meetingError || !meeting) {
    // PGRST116: 0 rows — indistinguishable from foreign-tenant row under RLS.
    // Correct security posture: always 404, never leak existence of foreign resources.
    if (meetingError?.code === "PGRST116") {
      notFound();
    }
    console.error("[versammlungen/[meetingId]] select failed:", meetingError);
    throw new Error("Versammlung konnte nicht geladen werden.");
  }

  // Secondary aggregate: TOPs for this meeting. RLS scopes via JWT, no
  // explicit tenant_id filter needed. A query error degrades to an empty
  // list — the detail page must not 500 if the sub-query fails.
  type AgendaItemRow = Pick<
    Database["public"]["Tables"]["agenda_item"]["Row"],
    "id" | "position" | "titel" | "beschreibung"
  >;

  const { data: agendaItemsRaw, error: agendaItemsError } = await supabase
    .from("agenda_item")
    .select("id, position, titel, beschreibung")
    .eq("meeting_id", meetingId)
    .order("position", { ascending: true });

  if (agendaItemsError) {
    console.error(
      "[versammlungen/[meetingId]] agenda_item select failed:",
      agendaItemsError,
    );
  }

  const agendaItems: AgendaItemRow[] = agendaItemsRaw ?? [];

  return (
    <section className="mx-auto max-w-3xl space-y-6 px-6 py-12">
      <header className="flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-2 text-sm text-[color:var(--color-muted-foreground)]">
            <Link
              href={`/wegs/${meeting.weg_id}`}
              className="underline underline-offset-4 hover:text-[color:var(--color-foreground)]"
            >
              ← Zurück zur WEG
            </Link>
          </p>
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {meeting.titel}
          </h1>
        </div>
      </header>

      {/* ─────────────────────── Details ─────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status + Modus pills */}
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full border border-[color:var(--color-border)] px-2.5 py-0.5 text-xs font-medium">
              {STATUS_LABEL[meeting.status] ?? meeting.status}
            </span>
            <span className="inline-flex items-center rounded-full border border-[color:var(--color-border)] px-2.5 py-0.5 text-xs font-medium">
              {MODUS_LABEL[meeting.modus] ?? meeting.modus}
            </span>
          </div>

          {/* Termin */}
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-muted-foreground)]">
              Termin
            </p>
            {meeting.termin_von ? (
              <p className="text-sm">{formatDateLongDE(meeting.termin_von)}</p>
            ) : (
              <p className="text-sm italic text-[color:var(--color-muted-foreground)]">
                Termin noch offen
              </p>
            )}
          </div>

          {/* Einladungsfrist — only relevant once the meeting has been invited */}
          {meeting.status !== "entwurf" ? (
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-muted-foreground)]">
                Einladungsfrist
              </p>
              {meeting.frist_einladung_ok ? (
                <p className="text-sm text-green-700 dark:text-green-400">
                  Einladungsfrist eingehalten ✓
                </p>
              ) : (
                <p className="text-sm text-[color:var(--color-muted-foreground)]">
                  Einladungsfrist nicht erfüllt
                </p>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* ───────────────────────── Einladung ─────────────────────── */}
      {meeting.status === "entwurf" ? (
        <Card>
          <CardHeader>
            <CardTitle>Einladung versenden</CardTitle>
            <CardDescription>
              § 24 Abs. 4 WEG — 3 Wochen Frist zwischen Versand und Termin.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InvitationForm action={sendInvitation.bind(null, meetingId)} />
          </CardContent>
        </Card>
      ) : null}

      {/* ──────────────── KI: Tagesordnung vorschlagen ────────── */}
      <Card>
        <CardHeader>
          <CardTitle>KI-Tagesordnungsvorschlag</CardTitle>
          <CardDescription>
            Der Agent schlägt TOPs auf Basis der Vorjahres-Protokolle vor
            (§ 4.1). Nur ein Vorschlag — der Verwalter entscheidet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AgendaReviewPanel wegId={meeting.weg_id} />
        </CardContent>
      </Card>

      {/* ─────────────────── Tagesordnungspunkte ─────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Tagesordnungspunkte</CardTitle>
            </div>
            <Link
              href={`/versammlungen/${meetingId}/tops/new`}
              className="shrink-0 text-sm underline underline-offset-4 hover:text-[color:var(--color-accent)]"
              aria-label="Neuen Tagesordnungspunkt hinzufügen"
            >
              TOP hinzufügen
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {agendaItems.length === 0 ? (
            <p
              role="status"
              className="rounded-md border border-dashed border-[color:var(--color-border)] p-6 text-center text-sm text-[color:var(--color-muted-foreground)]"
            >
              Noch keine TOPs angelegt.{" "}
              <Link
                href={`/versammlungen/${meetingId}/tops/new`}
                className="underline underline-offset-4 hover:text-[color:var(--color-accent)]"
              >
                Jetzt ersten TOP anlegen
              </Link>
              .
            </p>
          ) : (
            <ol className="space-y-3">
              {agendaItems.map((top) => (
                <li
                  key={top.id}
                  className="flex gap-3 rounded-md border border-[color:var(--color-border)] p-3"
                >
                  <span
                    className="shrink-0 text-sm font-medium tabular-nums text-[color:var(--color-muted-foreground)]"
                    aria-label={`Position ${top.position}`}
                  >
                    {top.position}.
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/versammlungen/${meetingId}/tops/${top.id}`}
                      className="text-sm font-medium underline underline-offset-4 hover:text-[color:var(--color-accent)]"
                    >
                      {top.titel}
                    </Link>
                    {top.beschreibung ? (
                      <p className="mt-1 line-clamp-1 text-xs text-[color:var(--color-muted-foreground)]">
                        {top.beschreibung}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {/* ─────────────────────────── Aktionen ─────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Aktionen</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href={`/versammlungen/${meetingId}/tops/new`}>
              Neuen TOP anlegen
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/versammlungen/${meetingId}/protokoll`}>
              Protokoll
            </Link>
          </Button>
        </CardContent>
      </Card>

      <div className="mt-4">
        <Link
          href={`/versammlungen/${meetingId}/vorschlaege`}
          className="text-sm underline underline-offset-4 hover:text-(--color-accent)"
        >
          KI-Vorschläge anzeigen →
        </Link>
      </div>
    </section>
  );
}
