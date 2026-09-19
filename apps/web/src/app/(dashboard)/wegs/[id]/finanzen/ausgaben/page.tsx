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
import { VERTEILUNGSSCHLUESSEL_TYP_LABEL } from "@/modules/finanzen";
import type { Database } from "@/lib/supabase/database.types";
import AusgabeForm, { type SchluesselOption } from "./ausgabe-form";

type WegRow = Database["public"]["Tables"]["weg"]["Row"];
type AusgabeRow = Database["public"]["Tables"]["ausgabe"]["Row"];
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

function formatDateDE(iso: string): string {
  return new Intl.DateTimeFormat("de-DE").format(new Date(iso));
}

export default async function AusgabenPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: wegId } = await params;

  if (!UUID_RE.test(wegId)) {
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
    console.error("[ausgaben] WEG select failed:", wegError);
    throw new Error("WEG konnte nicht geladen werden.");
  }

  const { data: ausgaben, error: ausgabenError } = await supabase
    .from("ausgabe")
    .select("*")
    .eq("weg_id", wegId)
    .order("wert_datum", { ascending: false })
    .returns<AusgabeRow[]>();

  if (ausgabenError) {
    console.error("[ausgaben] select failed:", ausgabenError);
  }

  const rows: AusgabeRow[] = ausgaben ?? [];

  const { data: keys, error: keysError } = await supabase
    .from("verteilungsschluessel")
    .select("*, verteilungsschluessel_version(*)")
    .eq("weg_id", wegId)
    .order("name", { ascending: true })
    .returns<KeyRow[]>();

  if (keysError) {
    console.error("[ausgaben] keys select failed:", keysError);
  }

  const schluessel: SchluesselOption[] = (keys ?? []).flatMap((key) => {
    const version = [...(key.verteilungsschluessel_version ?? [])].sort((a, b) =>
      b.gueltig_ab.localeCompare(a.gueltig_ab),
    )[0];

    if (!version) return [];

    return [
      {
        versionId: version.id,
        label: `${key.name} — ${VERTEILUNGSSCHLUESSEL_TYP_LABEL[version.typ]}`,
      },
    ];
  });

  // Nach Jahr gruppieren: das Wertstellungsdatum bestimmt das Abrechnungsjahr
  // (Zufluss-/Abflussprinzip), nicht das Rechnungsdatum.
  const jahre = [...new Set(rows.map((r) => r.wert_datum.slice(0, 4)))].sort(
    (a, b) => b.localeCompare(a),
  );

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
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Ausgaben</h1>
        <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
          Tatsächliche Abflüsse für {weg.name}
        </p>
      </header>

      {jahre.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Noch keine Ausgabe</CardTitle>
            <CardDescription>
              Die Jahresabrechnung verteilt genau diese Beträge auf die Einheiten.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        jahre.map((jahr) => {
          const desJahres = rows.filter((r) => r.wert_datum.startsWith(jahr));
          const summe = desJahres.reduce((s, r) => s + Number(r.betrag), 0);

          return (
            <Card key={jahr}>
              <CardHeader>
                <CardTitle>{jahr}</CardTitle>
                <CardDescription>
                  {desJahres.length} Buchung(en) · {formatCurrencyDE(summe)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[color:var(--color-border)] text-left text-xs text-[color:var(--color-muted-foreground)]">
                        <th className="pb-2 pr-4 font-medium">Datum</th>
                        <th className="pb-2 pr-4 font-medium">Empfänger</th>
                        <th className="pb-2 pr-4 font-medium">Kostenart</th>
                        <th className="pb-2 text-right font-medium">Betrag</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[color:var(--color-border)]">
                      {desJahres.map((ausgabe) => (
                        <tr key={ausgabe.id} className="align-middle">
                          <td className="py-3 pr-4 tabular-nums text-[color:var(--color-foreground)]">
                            {formatDateDE(ausgabe.wert_datum)}
                          </td>
                          <td className="py-3 pr-4 text-[color:var(--color-foreground)]">
                            {ausgabe.empfaenger}
                          </td>
                          <td className="py-3 pr-4 text-[color:var(--color-foreground)]">
                            {ausgabe.kostenart}
                            {ausgabe.art === "ruecklage_zufuehrung" && (
                              <span className="ml-2 inline-flex rounded-md border border-[var(--color-border)] px-2 py-1 text-xs">
                                Rücklage
                              </span>
                            )}
                          </td>
                          <td className="py-3 text-right tabular-nums font-mono text-[color:var(--color-foreground)]">
                            {formatCurrencyDE(Number(ausgabe.betrag))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          );
        })
      )}

      <Card>
        <CardHeader>
          <CardTitle>Ausgabe erfassen</CardTitle>
          <CardDescription>
            Es zählt der tatsächliche Abfluss. Eine periodengerechte Abgrenzung
            wäre in der WEG-Abrechnung unzulässig.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AusgabeForm wegId={wegId} schluessel={schluessel} />
        </CardContent>
      </Card>
    </section>
  );
}
