import { notFound } from "next/navigation";
import Link from "next/link";
import { UnitForm } from "./unit-form";

// Server Component — validates the URL-scoped WEG and renders the
// Unit-Anlage-Form as a small client island so Server Action errors are
// visible inline.
//
// noValidate on the form: server-side validation is the single source of
// truth (§ 5.10 — German error messages, not browser-native en-US fallbacks).

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewEinheitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!UUID_RE.test(id)) {
    notFound();
  }

  return (
    <section className="mx-auto max-w-2xl px-6 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Wohneinheit anlegen
        </h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Neue Einheit für diese WEG. Miteigentumsanteile (MEA) als Bruch
          angeben — z.B. 45/1000.
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

      <UnitForm wegId={id} />
    </section>
  );
}
