import { notFound } from "next/navigation";
import Link from "next/link";
import { createUnit, type UnitFormState } from "./actions";

// Server Component — renders the Unit-Anlage-Form using a plain <form>
// with a Server Action. No client component needed here because there is
// no progressive-enhancement requirement beyond what HTML forms provide.
//
// noValidate on the form: server-side validation is the single source of
// truth (§ 5.10 — German error messages, not browser-native en-US fallbacks).

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Server Actions can't return JSX errors directly from a Server Component
// form. We use a static form that posts and redirects — no useActionState
// needed because this page is a pure Server Component. Errors would require
// a Client island; for now we keep it simple: redirect on success, throw on
// DB error (caught by error.tsx boundary).
//
// If fine-grained inline errors are required later, extract a client island
// (like weg-form.tsx) and use useActionState.

export default async function NewEinheitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!UUID_RE.test(id)) {
    notFound();
  }

  // Bind the server action to pre-fill weg_id. We pass it as a hidden input
  // so the Server Action receives it from FormData (no closure needed).
  const createUnitWithState = createUnit.bind(null, {} as UnitFormState);

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

      <form action={createUnitWithState} className="space-y-4" noValidate>
        {/* Hidden field: weg_id — validated server-side, never trusted blindly */}
        <input type="hidden" name="weg_id" value={id} />

        {/* Bezeichnung */}
        <div className="space-y-1">
          <label htmlFor="bezeichnung" className="block text-sm font-medium">
            Bezeichnung <span aria-hidden="true">*</span>
          </label>
          <input
            id="bezeichnung"
            name="bezeichnung"
            type="text"
            required
            aria-required="true"
            maxLength={200}
            autoComplete="off"
            placeholder="z.B. Whg. 12, 3. OG links"
            className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
          />
        </div>

        {/* MEA — Zähler + Nenner side by side */}
        <fieldset className="space-y-1">
          <legend className="block text-sm font-medium">
            Miteigentumsanteil (MEA) <span aria-hidden="true">*</span>
          </legend>
          <div className="flex items-center gap-3">
            <div className="flex-1 space-y-1">
              <label htmlFor="mea_zaehler" className="block text-xs text-[var(--color-muted)]">
                Zähler
              </label>
              <input
                id="mea_zaehler"
                name="mea_zaehler"
                type="number"
                required
                aria-required="true"
                min={1}
                step={1}
                className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
              />
            </div>
            <span className="mt-5 text-lg text-[var(--color-muted)]">/</span>
            <div className="flex-1 space-y-1">
              <label htmlFor="mea_nenner" className="block text-xs text-[var(--color-muted)]">
                Nenner
              </label>
              <input
                id="mea_nenner"
                name="mea_nenner"
                type="number"
                required
                aria-required="true"
                min={1}
                step={1}
                defaultValue={1000}
                className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
              />
            </div>
          </div>
        </fieldset>

        <div className="flex items-center gap-4 pt-2">
          <Link
            href={`/wegs/${id}`}
            className="text-sm underline underline-offset-4 hover:text-[var(--color-accent)]"
          >
            Abbrechen
          </Link>
          <button
            type="submit"
            className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            Speichern
          </button>
        </div>
      </form>
    </section>
  );
}
