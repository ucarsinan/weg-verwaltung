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
  VerteilungsschluesselQuelle,
  VerteilungsschluesselTyp,
} from "@/lib/supabase/database.types";
import { upsertBasiswertAction } from "./actions";
import { BasiswertRowForm } from "./basiswert-row-form";

type WegRow = Database["public"]["Tables"]["weg"]["Row"];
type KeyRow = Database["public"]["Tables"]["verteilungsschluessel"]["Row"];
type VersionRow = Database["public"]["Tables"]["verteilungsschluessel_version"]["Row"];
type BasiswertRow = Database["public"]["Tables"]["verteilungsschluessel_basiswert"]["Row"];
type UnitRow = Database["public"]["Tables"]["unit"]["Row"];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TYP_LABELS: Record<VerteilungsschluesselTyp, string> = {
  mea: "Miteigentumsanteil (MEA)",
  einheit: "Gleichverteilung je Einheit",
  flaeche: "Fläche",
  verbrauch: "Verbrauch",
  manuell: "Manuell",
  gemischt: "Gemischt",
};
const QUELLE_LABELS: Record<VerteilungsschluesselQuelle, string> = {
  gesetz: "Gesetz",
  teilungserklaerung: "Teilungserklärung",
  gemeinschaftsordnung: "Gemeinschaftsordnung",
  beschluss: "Beschluss",
  manuell: "Manuell",
};
const NEEDS_BASISWERT: VerteilungsschluesselTyp[] = ["flaeche", "verbrauch", "manuell"];

export default async function VerteilungsschluesselDetailPage({
  params,
}: {
  params: Promise<{ id: string; keyId: string }>;
}) {
  const { id: wegId, keyId } = await params;

  if (!UUID_RE.test(wegId) || !UUID_RE.test(keyId)) {
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
    console.error("[verteilungsschluessel-detail] WEG select failed:", wegError);
    throw new Error("WEG konnte nicht geladen werden.");
  }

  const { data: key, error: keyError } = await supabase
    .from("verteilungsschluessel")
    .select("id, name")
    .eq("id", keyId)
    .eq("weg_id", wegId)
    .single<Pick<KeyRow, "id" | "name">>();

  if (keyError || !key) {
    if (keyError?.code === "PGRST116") {
      notFound();
    }
    console.error("[verteilungsschluessel-detail] key select failed:", keyError);
    throw new Error("Verteilungsschlüssel konnte nicht geladen werden.");
  }

  const { data: versions, error: versionsError } = await supabase
    .from("verteilungsschluessel_version")
    .select("id, typ, quelle, gueltig_ab, gueltig_bis")
    .eq("verteilungsschluessel_id", keyId)
    .order("gueltig_ab", { ascending: false })
    .returns<
      Pick<VersionRow, "id" | "typ" | "quelle" | "gueltig_ab" | "gueltig_bis">[]
    >();

  if (versionsError) {
    console.error("[verteilungsschluessel-detail] versions select failed:", versionsError);
  }

  const versionRows = versions ?? [];
  const currentVersion = versionRows[0] ?? null;

  const { data: units, error: unitsError } = await supabase
    .from("unit")
    .select("id, bezeichnung")
    .eq("weg_id", wegId)
    .order("bezeichnung", { ascending: true })
    .returns<Pick<UnitRow, "id" | "bezeichnung">[]>();

  if (unitsError) {
    console.error("[verteilungsschluessel-detail] units select failed:", unitsError);
  }

  const unitRows = units ?? [];

  let basiswertByUnit = new Map<string, Pick<BasiswertRow, "wert" | "einheit" | "gueltig_ab">>();
  if (currentVersion && NEEDS_BASISWERT.includes(currentVersion.typ)) {
    const { data: basiswerte, error: basiswerteError } = await supabase
      .from("verteilungsschluessel_basiswert")
      .select("unit_id, wert, einheit, gueltig_ab")
      .eq("verteilungsschluessel_version_id", currentVersion.id)
      .returns<
        (Pick<BasiswertRow, "wert" | "einheit" | "gueltig_ab"> & { unit_id: string })[]
      >();

    if (basiswerteError) {
      console.error(
        "[verteilungsschluessel-detail] basiswerte select failed:",
        basiswerteError,
      );
    }

    basiswertByUnit = new Map(
      (basiswerte ?? []).map((row) => [row.unit_id, row]),
    );
  }

  return (
    <section className="mx-auto max-w-3xl space-y-6 px-6 py-12">
      <header>
        <p className="text-sm text-[color:var(--color-muted-foreground)]">
          <Link
            href={`/wegs/${wegId}/finanzen/verteilungsschluessel`}
            className="underline underline-offset-4 hover:text-[color:var(--color-foreground)]"
          >
            ← Zurück zu Verteilungsschlüssel
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{key.name}</h1>
        <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
          Für {weg.name}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Versionen</CardTitle>
          <CardDescription>
            Die aktuellste Version (nach Gültig-ab) wird vom Sollstellung-Generator
            verwendet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {versionRows.length === 0 ? (
            <p className="text-sm text-[color:var(--color-muted-foreground)]">
              Keine Version vorhanden.
            </p>
          ) : (
            <ul className="divide-y divide-[color:var(--color-border)] text-sm">
              {versionRows.map((version) => (
                <li key={version.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {TYP_LABELS[version.typ]}
                    <span className="ml-2 text-xs text-[color:var(--color-muted-foreground)]">
                      ({QUELLE_LABELS[version.quelle]})
                    </span>
                  </span>
                  <span className="text-xs text-[color:var(--color-muted-foreground)]">
                    gültig ab {version.gueltig_ab}
                    {version.gueltig_bis ? ` bis ${version.gueltig_bis}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {currentVersion && NEEDS_BASISWERT.includes(currentVersion.typ) ? (
        <Card>
          <CardHeader>
            <CardTitle>Basiswerte je Einheit</CardTitle>
            <CardDescription>
              Für {TYP_LABELS[currentVersion.typ]} muss jede Einheit einen Basiswert
              haben, sonst schlägt die Aktivierung eines Wirtschaftsplans mit einer
              Position auf diesen Schlüssel fehl.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {unitRows.length === 0 ? (
              <p className="text-sm text-[color:var(--color-muted-foreground)]">
                Keine Wohneinheiten in dieser WEG vorhanden.
              </p>
            ) : (
              <div>
                {unitRows.map((unit) => {
                  const existing = basiswertByUnit.get(unit.id) ?? null;
                  const boundAction = upsertBasiswertAction.bind(
                    null,
                    wegId,
                    keyId,
                    currentVersion.id,
                    unit.id,
                  );
                  return (
                    <BasiswertRowForm
                      key={unit.id}
                      action={boundAction}
                      unitLabel={unit.bezeichnung}
                      initialValue={existing}
                    />
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}
