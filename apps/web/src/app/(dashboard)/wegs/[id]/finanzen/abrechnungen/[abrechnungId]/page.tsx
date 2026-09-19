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
  ABRECHNUNGS_STATUS_LABEL,
  SPITZEN_ART_LABEL,
  pruefeVerteilung,
  spitzenArt,
  summiereSpitzen,
} from "@/modules/finanzen";
import type { SpitzeZeile } from "@/modules/finanzen";
import type { Database } from "@/lib/supabase/database.types";
import BeschlussForm from "./beschluss-form";

type WegRow = Database["public"]["Tables"]["weg"]["Row"];
type AbrechnungRow = Database["public"]["Tables"]["abrechnung"]["Row"];
type SpitzeRow = Database["public"]["Views"]["abrechnung_spitze"]["Row"];
type AnteilRow = Database["public"]["Tables"]["abrechnung_anteil"]["Row"];
type KostenpositionRow =
  Database["public"]["Tables"]["abrechnung_kostenposition"]["Row"] & {
    abrechnung_anteil: AnteilRow[];
  };
type EntwicklungRow =
  Database["public"]["Views"]["ruecklage_entwicklung"]["Row"];

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

export default async function AbrechnungDetailPage({
  params,
}: {
  params: Promise<{ id: string; abrechnungId: string }>;
}) {
  const { id: wegId, abrechnungId } = await params;

  if (!UUID_RE.test(wegId) || !UUID_RE.test(abrechnungId)) {
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
    console.error("[abrechnung/detail] WEG select failed:", wegError);
    throw new Error("WEG konnte nicht geladen werden.");
  }

  const { data: abrechnung, error: abrechnungError } = await supabase
    .from("abrechnung")
    .select("*")
    .eq("id", abrechnungId)
    .eq("weg_id", wegId)
    .single<AbrechnungRow>();

  if (abrechnungError || !abrechnung) {
    if (abrechnungError?.code === "PGRST116") {
      notFound();
    }
    console.error("[abrechnung/detail] select failed:", abrechnungError);
    throw new Error("Abrechnung konnte nicht geladen werden.");
  }

  const { data: positionen, error: positionenError } = await supabase
    .from("abrechnung_kostenposition")
    .select("*, abrechnung_anteil(*)")
    .eq("abrechnung_id", abrechnungId)
    .order("kostenart", { ascending: true })
    .returns<KostenpositionRow[]>();

  if (positionenError) {
    console.error("[abrechnung/detail] Positionen select failed:", positionenError);
  }

  const kostenpositionen: KostenpositionRow[] = positionen ?? [];

  const { data: spitzenRows, error: spitzenError } = await supabase
    .from("abrechnung_spitze")
    .select("*")
    .eq("abrechnung_id", abrechnungId)
    .order("unit_bezeichnung", { ascending: true })
    .returns<SpitzeRow[]>();

  if (spitzenError) {
    console.error("[abrechnung/detail] Spitze select failed:", spitzenError);
  }

  const spitzen: SpitzeZeile[] = (spitzenRows ?? []).map((row) => ({
    unitId: row.unit_id,
    unitBezeichnung: row.unit_bezeichnung,
    kostenanteil: Number(row.kostenanteil),
    sollVorschuesse: Number(row.soll_vorschuesse),
    spitze: Number(row.spitze),
  }));

  const { data: ruecklage } = await supabase
    .from("ruecklage_entwicklung")
    .select("*")
    .eq("weg_id", wegId)
    .eq("jahr", abrechnung.jahr)
    .maybeSingle<EntwicklungRow>();

  const summeKosten = kostenpositionen.reduce(
    (s, k) => s + Number(k.betrag_gesamt),
    0,
  );
  const summeAnteile = kostenpositionen.reduce(
    (s, k) =>
      s + (k.abrechnung_anteil ?? []).reduce((a, an) => a + Number(an.betrag), 0),
    0,
  );
  const summen = summiereSpitzen(spitzen);
  const verteilung = pruefeVerteilung({
    summeKostenpositionen: summeKosten,
    summeAnteile,
    anzahlEinheiten: spitzen.length,
    anzahlKostenpositionen: kostenpositionen.length,
  });

  const istEntwurf = abrechnung.status === "entwurf";

  return (
    <section className="mx-auto max-w-3xl space-y-6 px-6 py-12">
      <header>
        <p className="text-sm text-[color:var(--color-muted-foreground)]">
          <Link
            href={`/wegs/${wegId}/finanzen/abrechnungen` as Route}
            className="underline underline-offset-4 hover:text-[color:var(--color-foreground)]"
          >
            ← Zurück zu den Jahresabrechnungen
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {abrechnung.bezeichnung}
        </h1>
        <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
          {weg.name} · {ABRECHNUNGS_STATUS_LABEL[abrechnung.status]}
          {abrechnung.beschlossen_am &&
            ` seit ${formatDateDE(abrechnung.beschlossen_am)}`}
          {abrechnung.version_nr > 1 && ` · Version ${abrechnung.version_nr}`}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Gesamtabrechnung</CardTitle>
          <CardDescription>
            Tatsächliche Ausgaben des Jahres {abrechnung.jahr}, je Kostenart und
            verwendetem Verteilungsschlüssel.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {kostenpositionen.length === 0 ? (
            <p
              role="status"
              className="rounded-md border border-dashed border-[color:var(--color-border)] p-6 text-center text-sm text-[color:var(--color-muted-foreground)]"
            >
              Für dieses Jahr wurden keine Ausgaben erfasst.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--color-border)] text-left text-xs text-[color:var(--color-muted-foreground)]">
                    <th className="pb-2 pr-4 font-medium">Kostenart</th>
                    <th className="pb-2 text-right font-medium">Gesamtbetrag</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--color-border)]">
                  {kostenpositionen.map((position) => (
                    <tr key={position.id} className="align-middle">
                      <td className="py-3 pr-4 text-[color:var(--color-foreground)]">
                        {position.kostenart}
                      </td>
                      <td className="py-3 text-right tabular-nums font-mono text-[color:var(--color-foreground)]">
                        {formatCurrencyDE(Number(position.betrag_gesamt))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-[color:var(--color-border)]">
                    <td className="pt-3 pr-4 text-sm font-medium">
                      Summe der Ausgaben
                    </td>
                    <td className="pt-3 text-right tabular-nums font-mono font-semibold">
                      {formatCurrencyDE(summeKosten)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {!verteilung.ok && (
            <p
              role="alert"
              className="mt-4 rounded-md border border-[var(--color-border)] p-3 text-sm text-amber-700 dark:text-amber-400"
            >
              Die verteilten Anteile weichen um{" "}
              {formatCurrencyDE(verteilung.differenz)} von den Kostenpositionen
              ab. Das geht über Rundung hinaus und sollte vor dem Beschluss
              geklärt werden.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Einzelabrechnungen</CardTitle>
          <CardDescription>
            Abrechnungsspitze je Einheit: anteilige Kosten abzüglich der
            beschlossenen Vorschüsse. Rückständiges Hausgeld bleibt davon
            unberührt und weiter aus dem Wirtschaftsplan geschuldet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {spitzen.length === 0 ? (
            <p
              role="status"
              className="rounded-md border border-dashed border-[color:var(--color-border)] p-6 text-center text-sm text-[color:var(--color-muted-foreground)]"
            >
              Die WEG hat keine Einheiten.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--color-border)] text-left text-xs text-[color:var(--color-muted-foreground)]">
                    <th className="pb-2 pr-4 font-medium">Einheit</th>
                    <th className="pb-2 pr-4 text-right font-medium">
                      Kostenanteil
                    </th>
                    <th className="pb-2 pr-4 text-right font-medium">
                      Vorschüsse (Soll)
                    </th>
                    <th className="pb-2 text-right font-medium">Spitze</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--color-border)]">
                  {spitzen.map((zeile) => {
                    const art = spitzenArt(zeile.spitze);

                    return (
                      <tr key={zeile.unitId} className="align-middle">
                        <td className="py-3 pr-4 text-[color:var(--color-foreground)]">
                          {zeile.unitBezeichnung}
                        </td>
                        <td className="py-3 pr-4 text-right tabular-nums font-mono text-[color:var(--color-muted-foreground)]">
                          {formatCurrencyDE(zeile.kostenanteil)}
                        </td>
                        <td className="py-3 pr-4 text-right tabular-nums font-mono text-[color:var(--color-muted-foreground)]">
                          {formatCurrencyDE(zeile.sollVorschuesse)}
                        </td>
                        <td
                          className={`py-3 text-right tabular-nums font-mono font-semibold ${
                            art === "nachschuss"
                              ? "text-amber-700 dark:text-amber-400"
                              : art === "guthaben"
                                ? "text-green-700 dark:text-green-400"
                                : "text-[color:var(--color-foreground)]"
                          }`}
                        >
                          {formatCurrencyDE(zeile.spitze)}
                          <span className="ml-2 text-xs font-normal">
                            {SPITZEN_ART_LABEL[art]}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-[color:var(--color-border)]">
                    <td colSpan={3} className="pt-3 pr-4 text-sm font-medium">
                      Nachschüsse {formatCurrencyDE(summen.nachschuesse)} ·
                      Guthaben {formatCurrencyDE(summen.guthaben)}
                    </td>
                    <td className="pt-3 text-right tabular-nums font-mono font-semibold">
                      {formatCurrencyDE(summen.saldo)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {ruecklage && (
        <Card>
          <CardHeader>
            <CardTitle>Erhaltungsrücklage {abrechnung.jahr}</CardTitle>
            <CardDescription>
              Pflichtbestandteil der Abrechnung nach § 28 Abs. 2 WEG.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-[color:var(--color-muted-foreground)]">
                  Anfang
                </dt>
                <dd className="tabular-nums font-mono">
                  {formatCurrencyDE(Number(ruecklage.anfangsbestand))}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[color:var(--color-muted-foreground)]">
                  Zuführungen
                </dt>
                <dd className="tabular-nums font-mono">
                  {formatCurrencyDE(Number(ruecklage.zufuehrungen))}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[color:var(--color-muted-foreground)]">
                  Entnahmen
                </dt>
                <dd className="tabular-nums font-mono">
                  {formatCurrencyDE(Number(ruecklage.entnahmen))}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[color:var(--color-muted-foreground)]">
                  Ende
                </dt>
                <dd className="tabular-nums font-mono font-semibold">
                  {formatCurrencyDE(Number(ruecklage.endbestand))}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Beschluss</CardTitle>
          <CardDescription>
            {istEntwurf
              ? "Mit dem Beschluss werden die Zahlen verbindlich und die Abrechnung gesperrt."
              : "Diese Abrechnung ist nicht mehr änderbar. Für eine Korrektur eine neue Abrechnung desselben Jahres erstellen und beschließen."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {istEntwurf ? (
            <BeschlussForm wegId={wegId} abrechnungId={abrechnungId} />
          ) : (
            <p
              role="status"
              className="rounded-md border border-dashed border-[color:var(--color-border)] p-6 text-center text-sm text-[color:var(--color-muted-foreground)]"
            >
              {ABRECHNUNGS_STATUS_LABEL[abrechnung.status]}
              {abrechnung.beschlossen_am &&
                ` am ${formatDateDE(abrechnung.beschlossen_am)}`}
              .
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
