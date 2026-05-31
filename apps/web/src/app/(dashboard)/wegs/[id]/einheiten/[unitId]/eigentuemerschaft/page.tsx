import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

// Server Component — shows active + historic ownership for a single unit.
// RLS scopes all SELECTs to the user's tenant automatically.

type UnitRow = Database["public"]["Tables"]["unit"]["Row"];
type OwnershipRow = Database["public"]["Tables"]["ownership"]["Row"];
type PersonRow = Database["public"]["Tables"]["person"]["Row"];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DATE_SHORT: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
};

function formatDateDE(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", DATE_SHORT);
}

// Enriched ownership row: ownership columns + person display name.
interface OwnershipWithPerson extends OwnershipRow {
  person: Pick<PersonRow, "vorname" | "nachname"> | null;
}

export default async function EigentuemerschaftPage({
  params,
}: {
  params: Promise<{ id: string; unitId: string }>;
}) {
  const { id: wegId, unitId } = await params;

  if (!UUID_RE.test(wegId) || !UUID_RE.test(unitId)) {
    notFound();
  }

  const supabase = await createClient();

  // Load the unit to display its name in the header.
  const { data: unit, error: unitError } = await supabase
    .from("unit")
    .select("*")
    .eq("id", unitId)
    .eq("weg_id", wegId)
    .single<UnitRow>();

  if (unitError || !unit) {
    if (unitError?.code === "PGRST116") {
      notFound();
    }
    console.error("[eigentuemerschaft] unit select failed:", unitError);
    throw new Error("Wohneinheit konnte nicht geladen werden.");
  }

  // Load all ownerships for this unit, joined with the person's name.
  // We use a Supabase implicit join via foreign key (ownership.person_id → person.id).
  const { data: ownerships, error: ownershipsError } = await supabase
    .from("ownership")
    .select("*, person(vorname, nachname)")
    .eq("unit_id", unitId)
    .order("von", { ascending: false })
    .returns<OwnershipWithPerson[]>();

  if (ownershipsError) {
    console.error(
      "[eigentuemerschaft] ownerships select failed:",
      ownershipsError,
    );
  }

  const ownershipRows: OwnershipWithPerson[] = ownerships ?? [];

  // Split into active (bis IS NULL) and historic (bis IS NOT NULL).
  const active = ownershipRows.filter((o) => o.bis === null);
  const historic = ownershipRows.filter((o) => o.bis !== null);

  return (
    <section className="mx-auto max-w-3xl px-6 py-12 space-y-6">
      <header>
        <p className="text-sm text-[var(--color-muted)]">
          <Link
            href={`/wegs/${wegId}`}
            className="underline underline-offset-4 hover:text-[var(--color-accent)]"
          >
            ← Zurück zur WEG
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Eigentümerschaft
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          {unit.bezeichnung} &mdash; MEA {unit.mea_zaehler}/{unit.mea_nenner}
        </p>
      </header>

      {/* ─────────────── Aktuelle Eigentümer ────────────── */}
      <div>
        <div className="flex items-baseline justify-between gap-4 mb-3">
          <h2 className="text-lg font-medium">Aktuelle Eigentümer</h2>
          <Link
            href={`/wegs/${wegId}/einheiten/${unitId}/eigentuemerschaft/new`}
            className="text-sm underline underline-offset-4 hover:text-[var(--color-accent)]"
          >
            Eigentümer hinzufügen
          </Link>
        </div>

        {active.length === 0 ? (
          <p
            role="status"
            className="rounded-md border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-muted)]"
          >
            Kein aktiver Eigentümer erfasst.{" "}
            <Link
              href={`/wegs/${wegId}/einheiten/${unitId}/eigentuemerschaft/new`}
              className="underline underline-offset-4 hover:text-[var(--color-accent)]"
            >
              Eigentümer hinzufügen
            </Link>
            .
          </p>
        ) : (
          <ul
            aria-label="Aktuelle Eigentümer"
            className="divide-y divide-[var(--color-border)] rounded-md border border-[var(--color-border)]"
          >
            {active.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {o.person
                      ? `${o.person.vorname} ${o.person.nachname}`
                      : "—"}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                    seit {formatDateDE(o.von)}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-muted)]">
                  aktiv
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ─────────────── Historische Eigentümer ──────────── */}
      {historic.length > 0 && (
        <div>
          <h2 className="text-lg font-medium mb-3">Historische Eigentümer</h2>
          <ul
            aria-label="Historische Eigentümer"
            className="divide-y divide-[var(--color-border)] rounded-md border border-[var(--color-border)]"
          >
            {historic.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {o.person
                      ? `${o.person.vorname} ${o.person.nachname}`
                      : "—"}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                    {formatDateDE(o.von)} – {o.bis ? formatDateDE(o.bis) : "?"}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-muted)]">
                  beendet
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
