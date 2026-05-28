import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAgendaItem } from "./actions";
import { TopForm } from "./top-form";
import type { Database } from "@/lib/supabase/database.types";

// Server Component — renders the TOP-Anlage form for a specific meeting.
// RLS scopes the meeting SELECT to the user's tenant automatically.

type MeetingRow = Database["public"]["Tables"]["meeting"]["Row"];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewTopPage({
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
    .select("id, titel, weg_id")
    .eq("id", meetingId)
    .single<Pick<MeetingRow, "id" | "titel" | "weg_id">>();

  if (meetingError || !meeting) {
    if (meetingError?.code === "PGRST116") {
      notFound();
    }
    console.error("[tops/new] meeting select failed:", meetingError);
    throw new Error("Versammlung konnte nicht geladen werden.");
  }

  // Bind meetingId so the form action carries it without client exposure.
  const action = createAgendaItem.bind(null, meetingId);

  return (
    <section className="mx-auto max-w-2xl px-6 py-12">
      <header className="mb-6">
        <p className="mb-2 text-sm text-[color:var(--color-muted-foreground)]">
          <Link
            href={`/versammlungen/${meetingId}`}
            className="underline underline-offset-4 hover:text-[color:var(--color-foreground)]"
          >
            ← Zurück zur Versammlung: {meeting.titel}
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Neuer TOP</h1>
      </header>
      <TopForm action={action} />
    </section>
  );
}
