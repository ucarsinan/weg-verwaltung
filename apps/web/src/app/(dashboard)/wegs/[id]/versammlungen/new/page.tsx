import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createMeeting } from "./actions";
import { MeetingForm } from "./meeting-form";
import type { Database } from "@/lib/supabase/database.types";

type WegRow = Database["public"]["Tables"]["weg"]["Row"];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewMeetingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!UUID_RE.test(id)) {
    notFound();
  }

  const supabase = await createClient();
  const { data: weg, error: wegError } = await supabase
    .from("weg")
    .select("id, name")
    .eq("id", id)
    .single<Pick<WegRow, "id" | "name">>();

  if (wegError || !weg) {
    if (wegError?.code === "PGRST116") {
      notFound();
    }
    console.error("[wegs/[id]/versammlungen/new] weg select failed:", wegError);
    throw new Error("WEG konnte nicht geladen werden.");
  }

  const action = createMeeting.bind(null, id);

  return (
    <section className="mx-auto max-w-2xl px-6 py-12">
      <header className="mb-6">
        <p className="mb-2 text-sm text-[color:var(--color-muted-foreground)]">
          <Link
            href={`/wegs/${id}`}
            className="underline underline-offset-4 hover:text-[color:var(--color-foreground)]"
          >
            ← Zurück zur WEG
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Neue Versammlung
        </h1>
        <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
          für WEG: {weg.name}
        </p>
      </header>
      <MeetingForm action={action} wegId={id} />
    </section>
  );
}
