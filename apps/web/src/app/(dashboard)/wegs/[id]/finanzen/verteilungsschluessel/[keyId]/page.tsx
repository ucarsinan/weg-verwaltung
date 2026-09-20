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
  brauchtTeile,
  isVerteilungsschluesselRegelwerk,
} from "@/modules/finanzen";
import type { Database } from "@/lib/supabase/database.types";
import BasiswerteForm, { type BasiswerteUnit } from "./basiswerte-form";
import TeileForm, { type TeilKandidat } from "./teile-form";

type WegRow = Database["public"]["Tables"]["weg"]["Row"];
type UnitRow = Database["public"]["Tables"]["unit"]["Row"];
type VersionRow =
  Database["public"]["Tables"]["verteilungsschluessel_version"]["Row"];
type BasiswertRow =
  Database["public"]["Tables"]["verteilungsschluessel_basiswert"]["Row"];
type TeilRow = Database["public"]["Tables"]["verteilungsschluessel_teil"]["Row"];
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

  // Eine gemischte Regel setzt sich aus den EINFACHEN Schluesseln derselben WEG
  // zusammen. Verschachtelung ist in 0067 verboten, gemischte Kandidaten
  // tauchen deshalb gar nicht erst auf.
  let kandidaten: TeilKandidat[] = [];

  if (version && brauchtTeile(version.typ)) {
    const [{ data: alleKeys }, { data: teile }] = await Promise.all([
      supabase
        .from("verteilungsschluessel")
        .select("*, verteilungsschluessel_version(*)")
        .eq("weg_id", wegId)
        .order("name", { ascending: true })
        .returns<KeyRow[]>(),
      supabase
        .from("verteilungsschluessel_teil")
        .select("*")
        .eq("verteilungsschluessel_version_id", version.id)
        .returns<TeilRow[]>(),
    ]);

    const gewichtProVersion = new Map(
      (teile ?? []).map((teil) => [teil.teil_version_id, teil.gewicht]),
    );

    kandidaten = (alleKeys ?? []).flatMap((kandidat) => {
      const kandidatVersion = [
        ...(kandidat.verteilungsschluessel_version ?? []),
      ].sort((a, b) => b.gueltig_ab.localeCompare(a.gueltig_ab))[0];

      if (!kandidatVersion || kandidatVersion.typ === "gemischt") return [];

      const gespeichert = gewichtProVersion.get(kandidatVersion.id);

      return [
        {
          versionId: kandidatVersion.id,
          name: kandidat.name,
          typ: kandidatVersion.typ,
          gewicht: gespeichert === undefined ? "" : String(gespeichert),
          gewaehlt: gespeichert !== undefined,
        },
      ];
    });
  }

  const regelwerkRoh =
    version && typeof version.parameter === "object" && version.parameter !== null
      ? (version.parameter as Record<string, unknown>).regelwerk
      : undefined;
  const regelwerk = isVerteilungsschluesselRegelwerk(regelwerkRoh)
    ? regelwerkRoh
    : "frei";

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
          <CardTitle>
            {version && brauchtTeile(version.typ)
              ? "Zusammensetzung der Regel"
              : "Basiswerte je Einheit"}
          </CardTitle>
          <CardDescription>
            {version && brauchtTeile(version.typ)
              ? "Eine gemischte Regel verweist auf andere Schlüssel und gewichtet sie. Deren Basiswerte werden nur einmal gepflegt."
              : "Jede Einheit der WEG braucht einen Wert. Fehlt einer, lehnt die Sollstellung den Plan später ab, statt einen Teilbetrag zu verteilen."}
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
          ) : brauchtTeile(version.typ) ? (
            <TeileForm
              wegId={wegId}
              keyId={keyId}
              versionId={version.id}
              regelwerk={regelwerk}
              kandidaten={kandidaten}
            />
          ) : !brauchtBasiswerte(version.typ) ? (
            <p
              role="status"
              className="rounded-md border border-dashed border-[color:var(--color-border)] p-6 text-center text-sm text-[color:var(--color-muted-foreground)]"
            >
              Dieser Typ leitet die Anteile aus den Stammdaten der Einheiten ab
              — es sind keine Basiswerte nötig.
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
