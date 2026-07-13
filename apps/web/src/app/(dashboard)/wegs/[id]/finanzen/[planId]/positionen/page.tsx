import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  Database,
  VerteilungsschluesselTyp,
  WirtschaftsplanStatus,
} from "@/lib/supabase/database.types";
import { PositionForm } from "./position-form";
import { DeletePositionButton } from "./delete-position-button";

type WegRow = Database["public"]["Tables"]["weg"]["Row"];
type WirtschaftsplanRow = Database["public"]["Tables"]["wirtschaftsplan"]["Row"];
type PositionRow = Database["public"]["Tables"]["wirtschaftsplan_position"]["Row"];
type VersionRow = Database["public"]["Tables"]["verteilungsschluessel_version"]["Row"];
type KeyRow = Database["public"]["Tables"]["verteilungsschluessel"]["Row"];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TYP_LABELS: Record<VerteilungsschluesselTyp, string> = {
  mea: "Miteigentumsanteil",
  einheit: "Gleichverteilung",
  flaeche: "Fläche",
  verbrauch: "Verbrauch",
  manuell: "Manuell",
  gemischt: "Gemischt",
};

function formatCurrencyDE(amount: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(
    amount,
  );
}

export default async function WirtschaftsplanPositionenPage({
  params,
}: {
  params: Promise<{ id: string; planId: string }>;
}) {
  const { id: wegId, planId } = await params;

  if (!UUID_RE.test(wegId) || !UUID_RE.test(planId)) {
    notFound();
  }

  const supabase = await createClient();

  const { data: weg, error: wegError } = await supabase
    .from("weg")
    .select("name")
    .eq("id", wegId)
    .single<Pick<WegRow, "name">>();

  if (wegError || !weg) {
    if (wegError?.code === "PGRST116") {
      notFound();
    }
    console.error("[positionen] WEG select failed:", wegError);
    throw new Error("WEG konnte nicht geladen werden.");
  }

  const { data: plan, error: planError } = await supabase
    .from("wirtschaftsplan")
    .select("jahr, bezeichnung, status")
    .eq("id", planId)
    .eq("weg_id", wegId)
    .single<Pick<WirtschaftsplanRow, "jahr" | "bezeichnung" | "status">>();

  if (planError || !plan) {
    if (planError?.code === "PGRST116") {
      notFound();
    }
    console.error("[positionen] plan select failed:", planError);
    throw new Error("Wirtschaftsplan konnte nicht geladen werden.");
  }

  const isDraft: boolean = (plan.status as WirtschaftsplanStatus) === "entwurf";

  const { data: positions, error: positionsError } = await supabase
    .from("wirtschaftsplan_position")
    .select(
      "id, position, kostenart, beschreibung, jahresbetrag, verteilungsschluessel_version_id, verteilungsschluessel_version(typ, verteilungsschluessel(name))",
    )
    .eq("wirtschaftsplan_id", planId)
    .order("position", { ascending: true })
    .returns<
      (Pick<
        PositionRow,
        | "id"
        | "position"
        | "kostenart"
        | "beschreibung"
        | "jahresbetrag"
        | "verteilungsschluessel_version_id"
      > & {
        verteilungsschluessel_version: {
          typ: VerteilungsschluesselTyp;
          verteilungsschluessel: { name: string } | null;
        } | null;
      })[]
    >();

  if (positionsError) {
    console.error("[positionen] positions select failed:", positionsError);
  }

  const positionRows = positions ?? [];
  const jahresbetragSumme = positionRows.reduce(
    (sum, position) => sum + Number(position.jahresbetrag),
    0,
  );

  const { data: keys, error: keysError } = await supabase
    .from("verteilungsschluessel")
    .select("id, name, verteilungsschluessel_version(id, typ)")
    .eq("weg_id", wegId)
    .returns<
      (Pick<KeyRow, "id" | "name"> & {
        verteilungsschluessel_version: Pick<VersionRow, "id" | "typ">[];
      })[]
    >();

  if (keysError) {
    console.error("[positionen] keys select failed:", keysError);
  }

  const versionOptions = (keys ?? []).flatMap((key) =>
    key.verteilungsschluessel_version.map((version) => ({
      id: version.id,
      keyName: key.name,
      typLabel: TYP_LABELS[version.typ],
    })),
  );

  return (
    <section className="mx-auto max-w-3xl space-y-6 px-6 py-12">
      <header>
        <p className="text-sm text-[color:var(--color-muted-foreground)]">
          <Link
            href={`/wegs/${wegId}/finanzen/${planId}/edit`}
            className="underline underline-offset-4 hover:text-[color:var(--color-foreground)]"
          >
            ← Zurück zum Wirtschaftsplan
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Positionen: {plan.bezeichnung} ({plan.jahr})
        </h1>
        <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
          Für {weg.name}. Hat der Plan mindestens eine Position, verteilt die
          Aktivierung die Positionsbeträge statt der MEA-Gesamtkosten.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Positionen</CardTitle>
          <CardDescription>
            Summe der Jahresbeträge: {formatCurrencyDE(jahresbetragSumme)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {positionRows.length === 0 ? (
            <p
              role="status"
              className="rounded-md border border-dashed border-[color:var(--color-border)] p-6 text-center text-sm text-[color:var(--color-muted-foreground)]"
            >
              Noch keine Position angelegt. Ohne Positionen nutzt die
              Aktivierung weiterhin die MEA-basierte Berechnung.
            </p>
          ) : (
            <ul className="divide-y divide-[color:var(--color-border)] text-sm">
              {positionRows.map((position) => (
                <li key={position.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-[color:var(--color-foreground)]">
                      {position.position}. {position.kostenart}
                    </p>
                    <p className="mt-0.5 text-xs text-[color:var(--color-muted-foreground)]">
                      {position.verteilungsschluessel_version?.verteilungsschluessel?.name ??
                        "Unbekannter Schlüssel"}{" "}
                      (
                      {position.verteilungsschluessel_version
                        ? TYP_LABELS[position.verteilungsschluessel_version.typ]
                        : "–"}
                      )
                    </p>
                    {position.beschreibung ? (
                      <p className="mt-0.5 text-xs text-[color:var(--color-muted-foreground)]">
                        {position.beschreibung}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-mono font-semibold">
                      {formatCurrencyDE(Number(position.jahresbetrag))}
                    </span>
                    {isDraft ? (
                      <DeletePositionButton
                        wegId={wegId}
                        planId={planId}
                        positionId={position.id}
                        kostenart={position.kostenart}
                      />
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {isDraft ? (
        <Card>
          <CardHeader>
            <CardTitle>Position hinzufügen</CardTitle>
            <CardDescription>
              Nur möglich, während der Plan im Entwurf ist.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PositionForm wegId={wegId} planId={planId} versionOptions={versionOptions} />
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-[color:var(--color-muted-foreground)]">
          Positionen sind nur im Entwurf editierbar. Dieser Plan hat den Status
          &bdquo;{plan.status}&ldquo;.
        </p>
      )}
    </section>
  );
}
