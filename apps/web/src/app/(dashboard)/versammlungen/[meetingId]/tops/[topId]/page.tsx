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
import { deleteAgendaItem } from "./actions";
import type { Database } from "@/lib/supabase/database.types";

// Server Component — TOP Detail Page.
// RLS scopes all SELECTs to the user's tenant; "0 rows" from single()
// is indistinguishable from "exists in another tenant" — that is intentional.

type AgendaItemRow = Database["public"]["Tables"]["agenda_item"]["Row"];
type MeetingRow = Database["public"]["Tables"]["meeting"]["Row"];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TopDetailPage({
  params,
}: {
  params: Promise<{ meetingId: string; topId: string }>;
}) {
  const { meetingId, topId } = await params;

  if (!UUID_RE.test(meetingId) || !UUID_RE.test(topId)) {
    notFound();
  }

  const supabase = await createClient();

  const { data: agendaItem, error: agendaError } = await supabase
    .from("agenda_item")
    .select("*")
    .eq("id", topId)
    .single<AgendaItemRow>();

  if (agendaError || !agendaItem) {
    if (agendaError?.code === "PGRST116") {
      notFound();
    }
    console.error("[tops/[topId]] agenda_item select failed:", agendaError);
    throw new Error("TOP konnte nicht geladen werden.");
  }

  // Cross-meeting access guard: the row exists but belongs to a different meeting.
  if (agendaItem.meeting_id !== meetingId) {
    notFound();
  }

  const { data: meeting, error: meetingError } = await supabase
    .from("meeting")
    .select("id, titel, weg_id")
    .eq("id", meetingId)
    .single<Pick<MeetingRow, "id" | "titel" | "weg_id">>();

  if (meetingError || !meeting) {
    if (meetingError?.code === "PGRST116") {
      notFound();
    }
    console.error("[tops/[topId]] meeting select failed:", meetingError);
    throw new Error("Versammlung konnte nicht geladen werden.");
  }

  return (
    <section className="mx-auto max-w-3xl space-y-6 px-6 py-12">
      <header>
        <p className="mb-2 text-sm text-[color:var(--color-muted-foreground)]">
          <Link
            href={`/versammlungen/${meetingId}`}
            className="underline underline-offset-4 hover:text-[color:var(--color-foreground)]"
          >
            ← {meeting.titel}
          </Link>
        </p>
        <span className="inline-flex items-center rounded-full border border-[color:var(--color-border)] px-2 py-0.5 text-xs text-[color:var(--color-muted-foreground)]">
          TOP {agendaItem.position}
        </span>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {agendaItem.titel}
        </h1>
      </header>

      {/* ────────────────────────── Beschreibung ──────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Beschreibung</CardTitle>
        </CardHeader>
        <CardContent>
          {agendaItem.beschreibung ? (
            <p className="text-sm whitespace-pre-wrap">
              {agendaItem.beschreibung}
            </p>
          ) : (
            <p
              role="status"
              className="text-sm italic text-[color:var(--color-muted-foreground)]"
            >
              nicht hinterlegt
            </p>
          )}
        </CardContent>
      </Card>

      {/* ───────────────────────── Beschlussvorlage ───────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Beschlussvorlage</CardTitle>
          <CardDescription>
            Abstimmungsgegenstand für diesen TOP.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p
            role="status"
            className="text-sm text-[color:var(--color-muted-foreground)]"
          >
            Noch keine Beschlussvorlage angelegt.{" "}
            <Link
              href={`/versammlungen/${meetingId}/tops/${topId}/beschluss/new`}
              className="underline underline-offset-4 hover:text-[color:var(--color-foreground)]"
            >
              Jetzt Beschluss anlegen
            </Link>
          </p>
        </CardContent>
      </Card>

      {/* ─────────────────────────── Abstimmung ───────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Abstimmung</CardTitle>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link
              href={`/versammlungen/${meetingId}/tops/${topId}/abstimmung`}
            >
              Zur Abstimmung
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* ───────────────────────── TOP-Verwaltung ─────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>TOP-Verwaltung</CardTitle>
          <CardDescription>
            Inhalt korrigieren oder TOP entfernen, bevor die Versammlung läuft.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button asChild variant="outline">
            <Link href={`/versammlungen/${meetingId}/tops/${topId}/edit`}>
              TOP bearbeiten
            </Link>
          </Button>
          <form action={deleteAgendaItem.bind(null, meetingId, topId)}>
            <button
              type="submit"
              className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
              aria-label="Diesen TOP löschen"
            >
              TOP löschen
            </button>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
