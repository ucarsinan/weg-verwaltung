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
import type { OffenerPosten } from "@/modules/finanzen";
import type { Database } from "@/lib/supabase/database.types";
import ZuordnungForm from "./zuordnung-form";

type WegRow = Database["public"]["Tables"]["weg"]["Row"];
type ZahlungRow = Database["public"]["Tables"]["zahlung"]["Row"];
type ZuordnungRow = Database["public"]["Tables"]["zahlungszuordnung"]["Row"];
type OffenerPostenRow = Database["public"]["Views"]["offener_posten"]["Row"];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ZahlungZuordnenPage({
  params,
}: {
  params: Promise<{ id: string; zahlungId: string }>;
}) {
  const { id: wegId, zahlungId } = await params;

  if (!UUID_RE.test(wegId) || !UUID_RE.test(zahlungId)) {
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
    console.error("[zahlung/zuordnen] WEG select failed:", wegError);
    throw new Error("WEG konnte nicht geladen werden.");
  }

  const { data: zahlung, error: zahlungError } = await supabase
    .from("zahlung")
    .select("*")
    .eq("id", zahlungId)
    .eq("weg_id", wegId)
    .single<ZahlungRow>();

  if (zahlungError || !zahlung) {
    if (zahlungError?.code === "PGRST116") {
      notFound();
    }
    console.error("[zahlung/zuordnen] Zahlung select failed:", zahlungError);
    throw new Error("Zahlung konnte nicht geladen werden.");
  }

  const { data: bestehendeZuordnungen, error: zuordnungError } = await supabase
    .from("zahlungszuordnung")
    .select("*")
    .eq("zahlung_id", zahlungId)
    .returns<ZuordnungRow[]>();

  if (zuordnungError) {
    console.error("[zahlung/zuordnen] Zuordnungen select failed:", zuordnungError);
  }

  const bestehend: Record<string, number> = Object.fromEntries(
    (bestehendeZuordnungen ?? []).map((z) => [
      z.sollstellung_id,
      Number(z.betrag),
    ]),
  );

  const { data: offen, error: offenError } = await supabase
    .from("offener_posten")
    .select("*")
    .eq("weg_id", wegId)
    .order("jahr", { ascending: true })
    .order("monat", { ascending: true })
    .returns<OffenerPostenRow[]>();

  if (offenError) {
    console.error("[zahlung/zuordnen] offene Posten select failed:", offenError);
  }

  // Posten, die noch offen sind ODER bereits von dieser Zahlung bedient werden
  // (sonst verschwände die eigene Zuordnung beim erneuten Bearbeiten).
  const posten: OffenerPosten[] = (offen ?? [])
    .filter(
      (row) =>
        Number(row.offen_betrag) > 0 ||
        bestehend[row.sollstellung_id] !== undefined,
    )
    .map((row) => ({
      sollstellungId: row.sollstellung_id,
      unitBezeichnung: row.unit_bezeichnung,
      jahr: row.jahr,
      monat: row.monat,
      sollBetrag: Number(row.soll_betrag),
      // Der eigene Anteil zählt beim Bearbeiten wieder als verfügbar.
      offenBetrag:
        Number(row.offen_betrag) + (bestehend[row.sollstellung_id] ?? 0),
    }));

  return (
    <section className="mx-auto max-w-3xl space-y-6 px-6 py-12">
      <header>
        <p className="text-sm text-[color:var(--color-muted-foreground)]">
          <Link
            href={`/wegs/${wegId}/finanzen/zahlungen` as Route}
            className="underline underline-offset-4 hover:text-[color:var(--color-foreground)]"
          >
            ← Zurück zu den Zahlungen
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Zahlung zuordnen
        </h1>
        <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
          {zahlung.zahler_referenz} · {weg.name}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Offene Posten</CardTitle>
          <CardDescription>
            Ein Betrag unter dem offenen Posten ist eine Teilzahlung — der Rest
            bleibt offen. Eine Zahlung darf auch teilweise unzugeordnet bleiben.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {posten.length === 0 ? (
            <p
              role="status"
              className="rounded-md border border-dashed border-[color:var(--color-border)] p-6 text-center text-sm text-[color:var(--color-muted-foreground)]"
            >
              Für diese WEG ist kein Posten offen. Sollstellungen entstehen erst,
              wenn ein Wirtschaftsplan aktiviert wurde.
            </p>
          ) : (
            <ZuordnungForm
              wegId={wegId}
              zahlungId={zahlungId}
              zahlbetrag={Number(zahlung.betrag)}
              posten={posten}
              bestehend={bestehend}
            />
          )}
        </CardContent>
      </Card>
    </section>
  );
}
