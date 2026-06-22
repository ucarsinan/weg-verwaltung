import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Server Component — shows active + historic ownership for a single unit.
// RLS scopes all SELECTs to the user's tenant automatically.

type UnitRow = Database["public"]["Tables"]["unit"]["Row"];
type OwnershipRow = Database["public"]["Tables"]["ownership"]["Row"];
type PersonRow = Database["public"]["Tables"]["person"]["Row"];
type SollstellungRow = Database["public"]["Tables"]["sollstellung"]["Row"];

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

// Enriched ownership row: ownership columns + person display name + co-owners.
interface OwnershipWithCoOwners extends OwnershipRow {
  person: Pick<PersonRow, "vorname" | "nachname"> | null;
  ownership_co_owner?: {
    person: Pick<PersonRow, "vorname" | "nachname"> | null;
  }[] | null;
}

interface SollstellungWithPlan extends SollstellungRow {
  wirtschaftsplan: Pick<
    Database["public"]["Tables"]["wirtschaftsplan"]["Row"],
    "jahr" | "bezeichnung"
  > | null;
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

  // Load all ownerships for this unit, joined with the person's name and co-owners from the join table.
  const { data: ownerships, error: ownershipsError } = await supabase
    .from("ownership")
    .select(`
      *,
      person(vorname, nachname),
      ownership_co_owner(
        person(vorname, nachname)
      )
    `)
    .eq("unit_id", unitId)
    .order("von", { ascending: false })
    .returns<OwnershipWithCoOwners[]>();

  if (ownershipsError) {
    console.error(
      "[eigentuemerschaft] ownerships select failed:",
      ownershipsError,
    );
  }

  const ownershipRows: OwnershipWithCoOwners[] = ownerships ?? [];

  // Load Sollstellungen for this unit
  const { data: sollstellungen, error: sollstellungenError } = await supabase
    .from("sollstellung")
    .select(`
      *,
      wirtschaftsplan(jahr, bezeichnung)
    `)
    .eq("unit_id", unitId)
    .order("monat", { ascending: true })
    .returns<SollstellungWithPlan[]>();

  if (sollstellungenError) {
    console.error("[eigentuemerschaft] sollstellungen select failed:", sollstellungenError);
  }

  const sollstellungRows: SollstellungWithPlan[] = sollstellungen ?? [];

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
            {active.map((o) => {
              const primaryName = o.person ? `${o.person.vorname} ${o.person.nachname}` : "";
              const coNames = o.ownership_co_owner?.map(co => co.person ? `${co.person.vorname} ${co.person.nachname}` : "").filter(Boolean) ?? [];
              const allNames = [primaryName, ...coNames].filter(Boolean).join(", ") || "—";
              return (
                <li key={o.id} className="flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {allNames}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                      seit {formatDateDE(o.von)}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-muted)]">
                    aktiv
                  </span>
                </li>
              );
            })}
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
            {historic.map((o) => {
              const primaryName = o.person ? `${o.person.vorname} ${o.person.nachname}` : "";
              const coNames = o.ownership_co_owner?.map(co => co.person ? `${co.person.vorname} ${co.person.nachname}` : "").filter(Boolean) ?? [];
              const allNames = [primaryName, ...coNames].filter(Boolean).join(", ") || "—";
              return (
                <li key={o.id} className="flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {allNames}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                      {formatDateDE(o.von)} – {o.bis ? formatDateDE(o.bis) : "?"}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-muted)]">
                    beendet
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ─────────────── Sollstellungen ────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Sollstellungen</CardTitle>
          <CardDescription>
            Monatliche Soll-Zahlungen für diese Wohneinheit.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sollstellungRows.length === 0 ? (
            <p className="text-sm text-[color:var(--color-muted-foreground)] py-4 text-center">
              Keine Sollstellungen erfasst.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--color-border)] text-left text-xs text-[color:var(--color-muted-foreground)]">
                    <th className="pb-2 pr-4 font-medium">Jahr</th>
                    <th className="pb-2 pr-4 font-medium">Monat</th>
                    <th className="pb-2 pr-4 font-medium">Wirtschaftsplan</th>
                    <th className="pb-2 text-right font-medium">Betrag</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--color-border)] font-mono text-xs">
                  {sollstellungRows.map((s) => {
                    const jahr = s.wirtschaftsplan?.jahr ?? "—";
                    const bezeichnung = s.wirtschaftsplan?.bezeichnung ?? "—";
                    const formattedBetrag = Number(s.betrag).toLocaleString("de-DE", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    });
                    const monatName = [
                      "Januar", "Februar", "März", "April", "Mai", "Juni",
                      "Juli", "August", "September", "Oktober", "November", "Dezember"
                    ][s.monat - 1] || s.monat;

                    return (
                      <tr key={s.id} className="align-middle">
                        <td className="py-2 pr-4 font-semibold text-[color:var(--color-foreground)]">
                          {jahr}
                        </td>
                        <td className="py-2 pr-4 text-[color:var(--color-foreground)]">
                          {monatName}
                        </td>
                        <td className="py-2 pr-4 font-sans text-[color:var(--color-muted-foreground)]">
                          {bezeichnung}
                        </td>
                        <td className="py-2 text-right font-bold text-[color:var(--color-foreground)]">
                          {formattedBetrag} €
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
