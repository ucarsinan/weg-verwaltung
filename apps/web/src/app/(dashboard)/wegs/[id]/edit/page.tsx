import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { WegEditForm } from "./weg-edit-form";
import type { Database } from "@/lib/supabase/database.types";

type WegRow = Database["public"]["Tables"]["weg"]["Row"];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditWegPage({
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
    .select("name, adresse")
    .eq("id", id)
    .single<Pick<WegRow, "name" | "adresse">>();

  if (wegError || !weg) {
    if (wegError?.code === "PGRST116") {
      notFound();
    }
    console.error("[edit-weg] select failed:", wegError);
    throw new Error("WEG konnte nicht geladen werden.");
  }

  return (
    <section className="mx-auto max-w-2xl px-6 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          WEG bearbeiten
        </h1>
        <p className="mt-2 text-sm text-[color:var(--color-muted-foreground)]">
          Passen Sie den Namen oder die Anschrift der Eigentümergemeinschaft an.
        </p>
        <p className="mt-1 text-sm">
          <Link
            href={`/wegs/${id}`}
            className="underline underline-offset-4 hover:text-[var(--color-accent)]"
          >
            ← Zurück zur WEG-Detailansicht
          </Link>
        </p>
      </header>

      <WegEditForm id={id} initialData={weg} />
    </section>
  );
}
