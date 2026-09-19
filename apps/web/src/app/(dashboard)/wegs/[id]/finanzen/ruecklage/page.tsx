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
import type { RuecklagenBewegung } from "@/modules/finanzen";
import type { Database } from "@/lib/supabase/database.types";
import RuecklageForm from "./ruecklage-form";

type WegRow = Database["public"]["Tables"]["weg"]["Row"];
type BewegungRow = Database["public"]["Tables"]["ruecklage_bewegung"]["Row"];
type EntwicklungRow =
  Database["public"]["Views"]["ruecklage_entwicklung"]["Row"];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatCurrencyDE(amount: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

export default async function RuecklagePage({
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
    console.error("[ruecklage] WEG select failed:", wegError);
    throw new Error("WEG konnte nicht geladen werden.");
  }

  const { data: entwicklung, error: entwicklungError } = await supabase
    .from("ruecklage_entwicklung")
    .select("*")
    .eq("weg_id", wegId)
    .order("jahr", { ascending: true })
    .returns<EntwicklungRow[]>();

  if (entwicklungError) {
    console.error("[ruecklage] Entwicklung select failed:", entwicklungError);
  }

  const jahre: EntwicklungRow[] = entwicklung ?? [];

  const { data: bewegungenRows, error: bewegungenError } = await supabase
    .from("ruecklage_bewegung")
    .select("*")
    .eq("weg_id", wegId)
    .order("datum", { ascending: true })
    .returns<BewegungRow[]>();

  if (bewegungenError) {
    console.error("[ruecklage] Bewegungen select failed:", bewegungenError);
  }

  const bewegungen: RuecklagenBewegung[] = (bewegungenRows ?? []).map((b) => ({
    datum: b.datum,
    betrag: Number(b.betrag),
    richtung: b.richtung,
  }));

  const hatAnfangsbestand = bewegungen.some(
    (b) => b.richtung === "anfangsbestand",
  );
  const aktuellerBestand = jahre.at(-1)?.endbestand;

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
          Erhaltungsrücklage
        </h1>
        <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
          {weg.name}
          {aktuellerBestand !== undefined && (
            <>
              {" · aktueller Bestand: "}
              <strong>{formatCurrencyDE(Number(aktuellerBestand))}</strong>
            </>
          )}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Entwicklung</CardTitle>
          <CardDescription>
            Anfangsbestand, Zuführungen, Entnahmen und Endbestand je Jahr — die
            vier Größen, die § 28 Abs. 2 WEG für die Jahresabrechnung verlangt.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {jahre.length === 0 ? (
            <p
              role="status"
              className="rounded-md border border-dashed border-[color:var(--color-border)] p-6 text-center text-sm text-[color:var(--color-muted-foreground)]"
            >
              Noch keine Bewegung erfasst. Beginnen Sie mit dem Anfangsbestand.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--color-border)] text-left text-xs text-[color:var(--color-muted-foreground)]">
                    <th className="pb-2 pr-4 font-medium">Jahr</th>
                    <th className="pb-2 pr-4 text-right font-medium">Anfang</th>
                    <th className="pb-2 pr-4 text-right font-medium">
                      Zuführungen
                    </th>
                    <th className="pb-2 pr-4 text-right font-medium">
                      Entnahmen
                    </th>
                    <th className="pb-2 text-right font-medium">Ende</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--color-border)]">
                  {jahre.map((jahr) => (
                    <tr key={jahr.jahr} className="align-middle">
                      <td className="py-3 pr-4 font-semibold tabular-nums text-[color:var(--color-foreground)]">
                        {jahr.jahr}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums font-mono text-[color:var(--color-muted-foreground)]">
                        {formatCurrencyDE(Number(jahr.anfangsbestand))}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums font-mono text-green-700 dark:text-green-400">
                        {formatCurrencyDE(Number(jahr.zufuehrungen))}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums font-mono text-amber-700 dark:text-amber-400">
                        {formatCurrencyDE(Number(jahr.entnahmen))}
                      </td>
                      <td className="py-3 text-right tabular-nums font-mono font-semibold text-[color:var(--color-foreground)]">
                        {formatCurrencyDE(Number(jahr.endbestand))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bewegung erfassen</CardTitle>
          <CardDescription>
            Eine Entnahme muss zu ihrem Datum gedeckt sein — später zugeführtes
            Geld zählt nicht.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RuecklageForm
            wegId={wegId}
            bewegungen={bewegungen}
            hatAnfangsbestand={hatAnfangsbestand}
          />
        </CardContent>
      </Card>
    </section>
  );
}
