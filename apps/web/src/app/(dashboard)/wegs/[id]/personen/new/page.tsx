import { notFound } from "next/navigation";
import Link from "next/link";
import { PersonForm } from "../person-form";
import { createPerson } from "../actions";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewPersonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!UUID_RE.test(id)) {
    notFound();
  }

  const createPersonWithId = createPerson.bind(null, id);

  return (
    <section className="mx-auto max-w-2xl px-6 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Neue Person anlegen
        </h1>
        <p className="mt-2 text-sm text-[color:var(--color-muted-foreground)]">
          Fügen Sie eine neue Person zu Ihrem Mandanten hinzu.
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

      <PersonForm wegId={id} action={createPersonWithId} />
    </section>
  );
}
