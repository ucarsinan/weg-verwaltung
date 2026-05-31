import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TopForm } from "../../new/top-form";
import { editAgendaItem } from "../actions";
import type { Database } from "@/lib/supabase/database.types";

// Server Component — renders the TOP-Edit form pre-filled with the
// current values. RLS scopes the SELECT to the user's tenant; the
// cross-meeting guard on agenda_item prevents URL-tampering across
// meetings within the same tenant.

type AgendaItemRow = Database["public"]["Tables"]["agenda_item"]["Row"];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditTopPage({
  params,
}: {
  params: Promise<{ meetingId: string; topId: string }>;
}) {
  const { meetingId, topId } = await params;

  if (!UUID_RE.test(meetingId) || !UUID_RE.test(topId)) {
    notFound();
  }

  const supabase = await createClient();

  const { data: agendaItem, error } = await supabase
    .from("agenda_item")
    .select("id, meeting_id, titel, beschreibung")
    .eq("id", topId)
    .single<
      Pick<AgendaItemRow, "id" | "meeting_id" | "titel" | "beschreibung">
    >();

  if (error || !agendaItem) {
    if (error?.code === "PGRST116") {
      notFound();
    }
    console.error("[tops/[topId]/edit] select failed:", error);
    throw new Error("TOP konnte nicht geladen werden.");
  }

  if (agendaItem.meeting_id !== meetingId) {
    notFound();
  }

  const action = editAgendaItem.bind(null, meetingId, topId);

  return (
    <section className="mx-auto max-w-2xl px-6 py-12">
      <header className="mb-6">
        <p className="mb-2 text-sm text-[color:var(--color-muted-foreground)]">
          <Link
            href={`/versammlungen/${meetingId}/tops/${topId}`}
            className="underline underline-offset-4 hover:text-[color:var(--color-foreground)]"
          >
            ← Zurück zum TOP
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">TOP bearbeiten</h1>
      </header>
      <TopForm
        action={action}
        defaultTitel={agendaItem.titel}
        defaultBeschreibung={agendaItem.beschreibung ?? undefined}
        cardTitle="Tagesordnungspunkt bearbeiten"
        submitLabel="Änderungen speichern"
      />
    </section>
  );
}
