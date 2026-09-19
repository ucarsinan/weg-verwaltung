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
  VERTEILUNGSSCHLUESSEL_TYP_LABEL,
  isGeneratorUnterstuetzt,
} from "@/modules/finanzen";
import type { Database } from "@/lib/supabase/database.types";
import PositionForm, { type SchluesselOption } from "./position-form";

type WegRow = Database["public"]["Tables"]["weg"]["Row"];
type WirtschaftsplanRow =
  Database["public"]["Tables"]["wirtschaftsplan"]["Row"];
type PositionRow =
  Database["public"]["Tables"]["wirtschaftsplan_position"]["Row"];
type VersionRow =
  Database["public"]["Tables"]["verteilungsschluessel_version"]["Row"];
type KeyRow = Database["public"]["Tables"]["verteilungsschluessel"]["Row"] & {
  verteilungsschluessel_version: VersionRow[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatCurrencyDE(amount: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

export default async function PositionenPage({
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
    .select("*")
    .eq("id", wegId)
    .single<WegRow>();

  if (wegError || !weg) {
    if (wegError?.code === "PGRST116") {
      notFound();
    }
    console.error("[positionen] WEG select failed:", wegError);
    throw new Error("WEG konnte nicht geladen werden.");
  }

  const { data: plan, error: planError } = await supabase
    .from("wirtschaftsplan")
    .select("*")
    .eq("id", planId)
    .eq("weg_id", wegId)
    .single<WirtschaftsplanRow>();

  if (planError || !plan) {
    if (planError?.code === "PGRST116") {
      notFound();
    }
    console.error("[positionen] plan select failed:", planError);
    throw new Error("Wirtschaftsplan konnte nicht geladen werden.");
  }

  const { data: positionen, error: positionenError } = await supabase
    .from("wirtschaftsplan_position")
    .select("*")
    .eq("wirtschaftsplan_id", planId)
    .order("position", { ascending: true })
    .returns<PositionRow[]>();

  if (positionenError) {
    console.error("[positionen] positions select failed:", positionenError);
  }

  const positionRows: PositionRow[] = positionen ?? [];

  const { data: keys, error: keysError } = await supabase
    .from("verteilungsschluessel")
    .select("*, verteilungsschluessel_version(*)")
    .eq("weg_id", wegId)
    .order("name", { ascending: true })
    .returns<KeyRow[]>();

  if (keysError) {
    console.error("[positionen] keys select failed:", keysError);
  }

  const schluesselOptionen: SchluesselOption[] = (keys ?? []).flatMap((key) => {
    const version = [...(key.verteilungsschluessel_version ?? [])].sort((a, b) =>
      b.gueltig_ab.localeCompare(a.gueltig_ab),
    )[0];

    if (!version) return [];

    return [
      {
        versionId: version.id,
        label: `${key.name} — ${VERTEILUNGSSCHLUESSEL_TYP_LABEL[version.typ]}`,
        buchbar: isGeneratorUnterstuetzt(version.typ),
      },
    ];
  });

  const versionLabel = new Map(
    schluesselOptionen.map((option) => [option.versionId, option.label]),
  );

  const summe = positionRows.reduce(
    (acc, position) => acc + Number(position.jahresbetrag),
    0,
  );

  const istEntwurf = plan.status === "entwurf";

  return (
    <section className="mx-auto max-w-3xl space-y-6 px-6 py-12">
      <header>
        <p className="text-sm text-[color:var(--color-muted-foreground)]">
          <Link
            href={`/wegs/${wegId}/finanzen` as Route}
            className="underline underline-offset-4 hover:text-[color:var(--color-foreground)]"
          >
            ← Zurück zu den Wirtschaftsplänen
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Kostenpositionen {plan.jahr}
        </h1>
        <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
          {plan.bezeichnung} · {weg.name}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Positionen</CardTitle>
          <CardDescription>
            Sobald der Plan mindestens eine Position hat, entstehen die
            Sollstellungen aus diesen Positionen — die Gesamtkosten des Plans
            werden dann nicht mehr pauschal nach MEA verteilt.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {positionRows.length === 0 ? (
            <p
              role="status"
              className="rounded-md border border-dashed border-[color:var(--color-border)] p-6 text-center text-sm text-[color:var(--color-muted-foreground)]"
            >
              Noch keine Position angelegt — der Plan verteilt seine
              Gesamtkosten aktuell nach Miteigentumsanteilen.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--color-border)] text-left text-xs text-[color:var(--color-muted-foreground)]">
                    <th className="pb-2 pr-4 font-medium">Nr.</th>
                    <th className="pb-2 pr-4 font-medium">Kostenart</th>
                    <th className="pb-2 pr-4 font-medium">Schlüssel</th>
                    <th className="pb-2 text-right font-medium">Jahresbetrag</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--color-border)]">
                  {positionRows.map((position) => (
                    <tr key={position.id} className="align-middle">
                      <td className="py-3 pr-4 tabular-nums text-[color:var(--color-muted-foreground)]">
                        {position.position}
                      </td>
                      <td className="py-3 pr-4 text-[color:var(--color-foreground)]">
                        {position.kostenart}
                        {position.beschreibung && (
                          <span className="block text-xs text-[color:var(--color-muted-foreground)]">
                            {position.beschreibung}
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-[color:var(--color-foreground)]">
                        {versionLabel.get(
                          position.verteilungsschluessel_version_id,
                        ) ?? "—"}
                      </td>
                      <td className="py-3 text-right tabular-nums font-mono text-[color:var(--color-foreground)]">
                        {formatCurrencyDE(Number(position.jahresbetrag))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-[color:var(--color-border)]">
                    <td colSpan={3} className="pt-3 pr-4 text-sm font-medium">
                      Summe der Positionen
                    </td>
                    <td className="pt-3 text-right tabular-nums font-mono font-semibold">
                      {formatCurrencyDE(summe)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Position hinzufügen</CardTitle>
          <CardDescription>
            {istEntwurf
              ? "Positionen lassen sich nur ändern, solange der Wirtschaftsplan im Entwurf ist."
              : "Dieser Wirtschaftsplan ist nicht mehr im Entwurf — Positionen sind gesperrt."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {istEntwurf ? (
            <PositionForm
              wegId={wegId}
              planId={planId}
              schluessel={schluesselOptionen}
            />
          ) : (
            <p
              role="status"
              className="rounded-md border border-dashed border-[color:var(--color-border)] p-6 text-center text-sm text-[color:var(--color-muted-foreground)]"
            >
              Für Änderungen einen Nachtragsplan anlegen.
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
