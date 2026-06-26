import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createEigentuemer, type EigentuemerFormState } from "./actions";

// Server Component — form for adding a new owner (Person + Ownership) to a unit.
// Pure server form + Server Action; no client island needed.
//
// noValidate: server-side validation is the single source of truth. The form
// binds weg_id + unit_id as hidden fields so the Server Action can validate
// and use them without exposing them to client-side manipulation blindly.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Default: today's date in YYYY-MM-DD format (what <input type="date"> expects).
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function NewEigentuemerPage({
  params,
}: {
  params: Promise<{ id: string; unitId: string }>;
}) {
  const { id: wegId, unitId } = await params;

  if (!UUID_RE.test(wegId) || !UUID_RE.test(unitId)) {
    notFound();
  }

  const supabase = await createClient();

  // Fetch all existing people in the tenant
  const { data: people, error: peopleError } = await supabase
    .from("person")
    .select("id, vorname, nachname, email")
    .order("nachname", { ascending: true })
    .order("vorname", { ascending: true });

  if (peopleError) {
    console.error("[new-eigentuemer] failed to fetch people:", peopleError);
  }

  const peopleRows = people ?? [];

  // Cast: action returns EigentuemerFormState on validation failure but the
  // form's `action` prop expects Promise<void> — direct-bind path; inline
  // errors require a client island.
  const createEigentuemerWithState = createEigentuemer.bind(
    null,
    {} as EigentuemerFormState,
  ) as unknown as (formData: FormData) => Promise<void>;

  return (
    <section className="mx-auto max-w-2xl px-6 py-12">
      <header className="mb-6">
        <p className="text-sm text-[var(--color-muted)]">
          <Link
            href={`/wegs/${wegId}/einheiten/${unitId}/eigentuemerschaft`}
            className="underline underline-offset-4 hover:text-[var(--color-accent)]"
          >
            ← Zurück zur Eigentümerschaft
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Eigentümer hinzufügen
        </h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Fügen Sie einen oder mehrere Eigentümer (Haupt- und Miteigentümer) zu dieser Wohneinheit hinzu. Sie können entweder bestehende Personen auswählen, eine neue Person anlegen, oder beides kombinieren.
        </p>
      </header>

      <form action={createEigentuemerWithState} className="space-y-6" noValidate>
        {/* Hidden context fields */}
        <input type="hidden" name="weg_id" value={wegId} />
        <input type="hidden" name="unit_id" value={unitId} />

        {/* ─── Option A: Existierende Person(en) auswählen ─── */}
        <fieldset className="space-y-4">
          <legend className="text-base font-semibold">Existierende Personen auswählen</legend>
          <p className="text-xs text-[var(--color-muted)]">
            Wählen Sie eine oder mehrere bereits im System registrierte Personen aus, die der Eigentümerschaft hinzugefügt werden sollen:
          </p>

          {peopleRows.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)] italic p-3 border border-dashed border-[var(--color-border)] rounded-md">
              Keine existierenden Personen vorhanden.
            </p>
          ) : (
            <div className="max-h-60 overflow-y-auto rounded-md border border-[var(--color-border)] p-4 space-y-3">
              {peopleRows.map((person) => (
                <label key={person.id} className="flex items-center gap-3 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    name="existing_person_ids"
                    value={person.id}
                    className="rounded border-[var(--color-border)] bg-transparent text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
                  />
                  <span>
                    {person.vorname} {person.nachname}
                    {person.email && (
                      <span className="text-[var(--color-muted)] ml-1">
                        ({person.email})
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          )}
        </fieldset>

        {/* Trennlinie */}
        <div className="relative flex py-2 items-center">
          <div className="flex-grow border-t border-[var(--color-border)]"></div>
          <span className="flex-shrink mx-4 text-xs font-semibold text-[var(--color-muted)] uppercase">ODER / UND</span>
          <div className="flex-grow border-t border-[var(--color-border)]"></div>
        </div>

        {/* ─── Option B: Neue Person anlegen ─── */}
        <fieldset className="space-y-4">
          <legend className="text-base font-semibold">Neue Person anlegen (Inline)</legend>
          <p className="text-xs text-[var(--color-muted)]">
            Erstellen Sie eine neue Person, die als Eigentümer hinzugefügt werden soll:
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="vorname" className="block text-sm font-medium">
                Vorname
              </label>
              <input
                id="vorname"
                name="vorname"
                type="text"
                maxLength={100}
                autoComplete="given-name"
                className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="nachname" className="block text-sm font-medium">
                Nachname
              </label>
              <input
                id="nachname"
                name="nachname"
                type="text"
                maxLength={100}
                autoComplete="family-name"
                className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="email" className="block text-sm font-medium">
              E-Mail{" "}
              <span className="font-normal text-[var(--color-muted)]">
                (optional)
              </span>
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              maxLength={200}
              className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="telefon" className="block text-sm font-medium">
              Telefon{" "}
              <span className="font-normal text-[var(--color-muted)]">
                (optional)
              </span>
            </label>
            <input
              id="telefon"
              name="telefon"
              type="tel"
              autoComplete="tel"
              maxLength={50}
              className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
            />
          </div>
        </fieldset>

        {/* Trennlinie */}
        <hr className="border-[var(--color-border)]" />

        {/* ─── Eigentümerschaft ─── */}
        <fieldset className="space-y-4">
          <legend className="text-base font-semibold">Eigentümerschaft</legend>

          <div className="space-y-1">
            <label htmlFor="von" className="block text-sm font-medium">
              Einzug ab (von) <span aria-hidden="true">*</span>
            </label>
            <input
              id="von"
              name="von"
              type="date"
              required
              aria-required="true"
              defaultValue={todayISO()}
              className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
            />
            <p className="text-xs text-[var(--color-muted)]">
              Datum des Eigentumserwerbs (z.B. Datum der Grundbucheintragung).
            </p>
          </div>
        </fieldset>

        <div className="flex items-center gap-4 pt-2">
          <Link
            href={`/wegs/${wegId}/einheiten/${unitId}/eigentuemerschaft`}
            className="text-sm underline underline-offset-4 hover:text-[var(--color-accent)]"
          >
            Abbrechen
          </Link>
          <button
            type="submit"
            className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            Eigentümer speichern
          </button>
        </div>
      </form>
    </section>
  );
}
