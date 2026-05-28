import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createResolution } from "./actions";
import { BeschlussForm } from "./beschluss-form";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  params: Promise<{ meetingId: string; topId: string }>;
}

export default async function NewBeschlussPage({ params }: PageProps) {
  const { meetingId, topId } = await params;

  if (!UUID_RE.test(meetingId) || !UUID_RE.test(topId)) {
    notFound();
  }

  const supabase = await createClient();

  const { data: agendaItem, error } = await supabase
    .from("agenda_item")
    .select("id, meeting_id, position, titel")
    .eq("id", topId)
    .single();

  if (error?.code === "PGRST116" || !agendaItem) {
    notFound();
  }

  if (agendaItem.meeting_id !== meetingId) {
    notFound();
  }

  const action = createResolution.bind(null, meetingId, topId);

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <div>
        <Link
          href={`/versammlungen/${meetingId}/tops/${topId}`}
          className="text-sm underline underline-offset-4 hover:text-[var(--color-accent)]"
        >
          ← Zurück zum TOP
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-semibold">Beschlussvorlage anlegen</h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          TOP {agendaItem.position}: {agendaItem.titel}
        </p>
      </div>

      <BeschlussForm action={action} />
    </div>
  );
}
