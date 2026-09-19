import { notFound } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  VERTEILUNGSSCHLUESSEL_QUELLE_LABEL,
  VERTEILUNGSSCHLUESSEL_TYP_LABEL,
  brauchtBasiswerte,
} from "@/modules/finanzen";
import type { Database } from "@/lib/supabase/database.types";
import BasiswerteForm, { type BasiswerteUnit } from "./basiswerte-form";

type WegRow = Database["public"]["Tables"]["weg"]["Row"];
type UnitRow = Database["public"]["Tables"]["unit"]["Row"];
type VersionRow =
  Database["public"]["Tables"]["verteilungsschluessel_version"]["Row"];
type BasiswertRow =
  Database["public"]["Tables"]["verteilungsschluessel_basiswert"]["Row"];
type KeyRow = Database["public"]["Tables"]["verteilungsschluessel"]["Row"] & {
  verteilungsschluessel_version: VersionRow[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    .select("*")
    .eq("id", wegId)
    .single<WegRow>();

  if (wegError || !weg) {
    if (wegError?.code === "PGRST116") {
      notFound();
    }
    console.error("[verteilungsschluessel/detail] WEG select failed:", wegError);
    throw new Error("WEG konnte nicht geladen werden.");
  }

  const { data: key, error: keyError } = await supabase
    .from("verteilungsschluessel")
    .select("*, verteilungsschluessel_version(*)")
    .eq("id", keyId)
    .eq("weg_id", wegId)
    .single<KeyRow>();

  if (keyError || !key) {
    if (keyError?.code === "PGRST116") {
      notFound();
    }
    console.error("[verteilungsschluessel/detail] key select failed:", keyError);
    throw new Error("Verteilungsschlüssel konnte nicht geladen werden.");
  }

  const version = [...(key.verteilungsschluessel_version ?? [])].sort((a, b) =>
    b.gueltig_ab.localeCompare(a.gueltig_ab),
  )[0];

  const { data: units, error: unitsError } = await supabase
    .from("unit")
    .select("*")
    .eq("weg_id", wegId)
    .order("bezeichnung", { ascending: true })
    .returns<UnitRow[]>();

  if (unitsError) {
    console.error("[verteilungsschluessel/detail] units select failed:", unitsError);
  }

  const unitRows: UnitRow[] = units ?? [];

  let basiswerte: BasiswertRow[] = [];

  if (version) {
    const { data, error } = await supabase
      .from("verteilungsschluessel_basiswert")
      .select("*")
      .eq("verteilungsschluessel_version_id", version.id)
      .returns<BasiswertRow[]>();

    if (error) {
      console.error(
        "[verteilungsschluessel/detail] basiswert select failed:",
        error,
      );
    } else {
      basiswerte = data ?? [];
    }
  }

  const werteProUnit = new Map(basiswerte.map((b) => [b.unit_id, b]));

  const formUnits: BasiswerteUnit[] = unitRows.map((unit) => ({
    id: unit.id,
    bezeichnung: unit.bezeichnung,
    meaZaehler: Number(unit.mea_zaehler),
    meaNenner: Number(unit.mea_nenner),
    vorhandenerWert: werteProUnit.has(unit.id)
      ? Number(werteProUnit.get(unit.id)?.wert)
      : null,
  }));

  const ersterBasiswert = basiswerte[0];

  return (
    <section className="mx-auto max-w-3xl space-y-6 px-6 py-12">
      <header>
        <p className="text-sm text-[color:var(--color-muted-foreground)]">
          <Link
            href={`/wegs/${wegId}/finanzen/verteilungsschluessel` as Route}
            className="underline underline-offset-4 hover:text-[color:var(--color-foreground)]"
          >
            ← Zurück zu den Verteilungsschlüsseln
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{key.name}</h1>
        <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
          {version
            ? `${VERTEILUNGSSCHLUESSEL_TYP_LABEL[version.typ]} · ${VERTEILUNGSSCHLUESSEL_QUELLE_LABEL[version.quelle]}`
            : "Noch keine Version hinterlegt"}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Basiswerte je Einheit</CardTitle>
          <CardDescription>
            Jede Einheit der WEG braucht einen Wert. Fehlt einer, lehnt die
            Sollstellung den Plan später ab, statt einen Teilbetrag zu verteilen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!version ? (
            <p
              role="status"
              className="rounded-md border border-dashed border-[color:var(--color-border)] p-6 text-center text-sm text-[color:var(--color-muted-foreground)]"
            >
              Für diesen Schlüssel ist noch keine Version hinterlegt.
            </p>
          ) : !brauchtBasiswerte(version.typ) ? (
            <p
              role="status"
              className="rounded-md border border-dashed border-[color:var(--color-border)] p-6 text-center text-sm text-[color:var(--color-muted-foreground)]"
            >
              {version.typ === "gemischt"
                ? "Gemischte Schlüssel lassen sich derzeit nicht für Sollstellungen verwenden."
                : "Dieser Typ leitet die Anteile aus den Stammdaten der Einheiten ab — es sind keine Basiswerte nötig."}
            </p>
          ) : unitRows.length === 0 ? (
            <p
              role="status"
              className="rounded-md border border-dashed border-[color:var(--color-border)] p-6 text-center text-sm text-[color:var(--color-muted-foreground)]"
            >
              Die WEG hat noch keine Einheiten.
            </p>
          ) : (
            <BasiswerteForm
              wegId={wegId}
              keyId={keyId}
              versionId={version.id}
              typ={version.typ}
              einheitVorgabe={ersterBasiswert?.einheit ?? ""}
              gueltigAbVorgabe={
                ersterBasiswert?.gueltig_ab ?? version.gueltig_ab
              }
              units={formUnits}
            />
          )}
        </CardContent>
      </Card>
    </section>
  );
}
