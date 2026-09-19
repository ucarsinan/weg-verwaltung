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
import type { Database } from "@/lib/supabase/database.types";
import ZahlungForm from "./zahlung-form";

type WegRow = Database["public"]["Tables"]["weg"]["Row"];
type ZahlungRow = Database["public"]["Tables"]["zahlung"]["Row"] & {
  zahlungszuordnung: { betrag: number }[];
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

export default async function ZahlungenPage({
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
    console.error("[zahlungen] WEG select failed:", wegError);
    throw new Error("WEG konnte nicht geladen werden.");
  }

  const { data: zahlungen, error: zahlungenError } = await supabase
    .from("zahlung")
    .select("*, zahlungszuordnung(betrag)")
    .eq("weg_id", wegId)
    .order("wert_datum", { ascending: false })
    .returns<ZahlungRow[]>();

  if (zahlungenError) {
    console.error("[zahlungen] select failed:", zahlungenError);
  }

  const rows: ZahlungRow[] = zahlungen ?? [];

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
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Zahlungen</h1>
        <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
          Zahlungseingänge für {weg.name}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Erfasste Zahlungen</CardTitle>
          <CardDescription>
            Eine Zahlung senkt erst dann einen offenen Posten, wenn sie einer
            Sollstellung zugeordnet ist.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p
              role="status"
              className="rounded-md border border-dashed border-[color:var(--color-border)] p-6 text-center text-sm text-[color:var(--color-muted-foreground)]"
            >
              Noch keine Zahlung erfasst.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--color-border)] text-left text-xs text-[color:var(--color-muted-foreground)]">
                    <th className="pb-2 pr-4 font-medium">Wertstellung</th>
                    <th className="pb-2 pr-4 font-medium">Einzahler</th>
                    <th className="pb-2 pr-4 text-right font-medium">Betrag</th>
                    <th className="pb-2 pr-4 text-right font-medium">Offen</th>
                    <th className="pb-2 text-right font-medium">Aktion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--color-border)]">
                  {rows.map((zahlung) => {
                    const zugeordnet = (zahlung.zahlungszuordnung ?? []).reduce(
                      (summe, z) => summe + Number(z.betrag),
                      0,
                    );
                    const rest = Number(zahlung.betrag) - zugeordnet;

                    return (
                      <tr key={zahlung.id} className="align-middle">
                        <td className="py-3 pr-4 tabular-nums text-[color:var(--color-foreground)]">
                          {formatDateDE(zahlung.wert_datum)}
                        </td>
                        <td className="py-3 pr-4 text-[color:var(--color-foreground)]">
                          {zahlung.zahler_referenz}
                        </td>
                        <td className="py-3 pr-4 text-right tabular-nums font-mono text-[color:var(--color-foreground)]">
                          {formatCurrencyDE(Number(zahlung.betrag))}
                        </td>
                        <td className="py-3 pr-4 text-right tabular-nums font-mono">
                          {rest === 0 ? (
                            <span className="text-[color:var(--color-muted-foreground)]">
                              zugeordnet
                            </span>
                          ) : (
                            <span className="text-amber-700 dark:text-amber-400">
                              {formatCurrencyDE(rest)}
                            </span>
                          )}
                        </td>
                        <td className="py-3 text-right">
                          <Link
                            href={
                              `/wegs/${wegId}/finanzen/zahlungen/${zahlung.id}` as Route
                            }
                            className="text-sm underline underline-offset-4 hover:text-[var(--color-accent)]"
                            aria-label={`Zahlung vom ${formatDateDE(zahlung.wert_datum)} zuordnen`}
                          >
                            Zuordnen
                          </Link>
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

      <Card>
        <CardHeader>
          <CardTitle>Zahlung erfassen</CardTitle>
          <CardDescription>
            Manuelle Erfassung. Der Import von Kontoauszügen (CAMT) folgt als
            eigener Schritt.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ZahlungForm wegId={wegId} />
        </CardContent>
      </Card>
    </section>
  );
}
