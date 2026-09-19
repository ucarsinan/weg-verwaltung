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
import { Button } from "@/components/ui/button";
import { formatMonat } from "@/modules/finanzen";
import type { Database } from "@/lib/supabase/database.types";

type WegRow = Database["public"]["Tables"]["weg"]["Row"];
type OffenerPostenRow = Database["public"]["Views"]["offener_posten"]["Row"];
type OwnershipRow = Database["public"]["Tables"]["ownership"]["Row"] & {
  person: { vorname: string; nachname: string } | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatCurrencyDE(amount: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

export default async function OffenePostenPage({
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
    console.error("[offene-posten] WEG select failed:", wegError);
    throw new Error("WEG konnte nicht geladen werden.");
  }

  const { data: offen, error: offenError } = await supabase
    .from("offener_posten")
    .select("*")
    .eq("weg_id", wegId)
    .gt("offen_betrag", 0)
    .order("jahr", { ascending: true })
    .order("monat", { ascending: true })
    .returns<OffenerPostenRow[]>();

  if (offenError) {
    console.error("[offene-posten] select failed:", offenError);
  }

  const posten: OffenerPostenRow[] = offen ?? [];

  // Aktuelle Eigentuemer nur als Kontaktangabe. Die Forderung haengt an der
  // Einheit; bei Eigentuemerwechsel wird NICHT umgebucht, weil Sollstellungen
  // historische Datensaetze sind (docs/07-finance-lifecycle.md).
  const { data: eigentuemer, error: eigentuemerError } = await supabase
    .from("ownership")
    .select("*, person(vorname, nachname)")
    .eq("weg_id", wegId)
    .is("bis", null)
    .returns<OwnershipRow[]>();

  if (eigentuemerError) {
    console.error("[offene-posten] ownership select failed:", eigentuemerError);
  }

  const eigentuemerProUnit = new Map<string, string>();
  for (const row of eigentuemer ?? []) {
    if (!row.person) continue;
    const name = `${row.person.vorname} ${row.person.nachname}`;
    const vorhanden = eigentuemerProUnit.get(row.unit_id);
    eigentuemerProUnit.set(
      row.unit_id,
      vorhanden ? `${vorhanden}, ${name}` : name,
    );
  }

  const gesamt = posten.reduce(
    (summe, row) => summe + Number(row.offen_betrag),
    0,
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
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">
              Offene Posten
            </h1>
            <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
              Nicht ausgeglichenes Hausgeld für {weg.name}
            </p>
          </div>
          <Button asChild className="shrink-0">
            <Link href={`/wegs/${wegId}/finanzen/zahlungen` as Route}>
              Zahlungen
            </Link>
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Nicht ausgeglichen</CardTitle>
          <CardDescription>
            Offener Betrag je Sollstellung: Sollbetrag abzüglich der bereits
            zugeordneten Zahlungen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {posten.length === 0 ? (
            <p
              role="status"
              className="rounded-md border border-dashed border-[color:var(--color-border)] p-6 text-center text-sm text-[color:var(--color-muted-foreground)]"
            >
              Kein offener Posten — entweder ist alles ausgeglichen oder es wurde
              noch kein Wirtschaftsplan aktiviert.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--color-border)] text-left text-xs text-[color:var(--color-muted-foreground)]">
                    <th className="pb-2 pr-4 font-medium">Einheit</th>
                    <th className="pb-2 pr-4 font-medium">Eigentümer</th>
                    <th className="pb-2 pr-4 font-medium">Monat</th>
                    <th className="pb-2 pr-4 text-right font-medium">Soll</th>
                    <th className="pb-2 text-right font-medium">Offen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--color-border)]">
                  {posten.map((row) => (
                    <tr key={row.sollstellung_id} className="align-middle">
                      <td className="py-3 pr-4 text-[color:var(--color-foreground)]">
                        {row.unit_bezeichnung}
                      </td>
                      <td className="py-3 pr-4 text-[color:var(--color-muted-foreground)]">
                        {eigentuemerProUnit.get(row.unit_id) ?? "—"}
                      </td>
                      <td className="py-3 pr-4 tabular-nums text-[color:var(--color-foreground)]">
                        {formatMonat(row.jahr, row.monat)}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums font-mono text-[color:var(--color-muted-foreground)]">
                        {formatCurrencyDE(Number(row.soll_betrag))}
                      </td>
                      <td className="py-3 text-right tabular-nums font-mono font-semibold text-[color:var(--color-foreground)]">
                        {formatCurrencyDE(Number(row.offen_betrag))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-[color:var(--color-border)]">
                    <td colSpan={4} className="pt-3 pr-4 text-sm font-medium">
                      Summe offen
                    </td>
                    <td className="pt-3 text-right tabular-nums font-mono font-semibold">
                      {formatCurrencyDE(gesamt)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
