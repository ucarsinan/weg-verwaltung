import { notFound } from "next/navigation";
import Link from "next/link";
import { PersonForm } from "../../person-form";
import { updatePerson } from "../../actions";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type PersonRow = Database["public"]["Tables"]["person"]["Row"];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditPersonPage({
  params,
}: {
  params: Promise<{ id: string; personId: string }>;
}) {
  const { id, personId } = await params;

  if (!UUID_RE.test(id) || !UUID_RE.test(personId)) {
    notFound();
  }

  const supabase = await createClient();
  const { data: person, error } = await supabase
    .from("person")
    .select("*")
    .eq("id", personId)
    .single<PersonRow>();

  if (error || !person) {
    if (error?.code === "PGRST116") {
      notFound();
    }
    console.error("[editPersonPage] select failed:", error);
    throw new Error("Person konnte nicht geladen werden.");
  }

  const updatePersonWithState = updatePerson.bind(null, id, personId);

  return (
    <section className="mx-auto max-w-2xl px-6 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Person bearbeiten
        </h1>
        <p className="mt-2 text-sm text-[color:var(--color-muted-foreground)]">
          Aktualisieren Sie die Daten der Person.
        </p>
        <p className="mt-1 text-sm">
          <Link
            href={`/wegs/${id}`}
            className="underline underline-offset-4 hover:text-[var(--color-accent)]"
          >
            ← Zurück zur WEG
          </Link>
        </p>
      </header>

      <PersonForm
        wegId={id}
        action={updatePersonWithState}
        initialData={person}
      />
    </section>
  );
}
