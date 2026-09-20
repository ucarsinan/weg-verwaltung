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
  VERMOEGENSBERICHT_ABSCHNITTE,
  VERMOEGENSBERICHT_ABSCHNITT_LABEL,
  VERMOEGENSBERICHT_STATUS_LABEL,
  berechneNettovermoegen,
  offeneAbschnitte,
  summiereAbschnitt,
} from "@/modules/finanzen";
import type { BerichtsPosition } from "@/modules/finanzen";
import type { Database } from "@/lib/supabase/database.types";
import PositionForm from "./position-form";
import PositionLoeschen from "./position-loeschen";
import FertigstellenForm from "./fertigstellen-form";

type WegRow = Database["public"]["Tables"]["weg"]["Row"];
type BerichtRow = Database["public"]["Tables"]["vermoegensbericht"]["Row"];
type PositionRow =
  Database["public"]["Tables"]["vermoegensbericht_position"]["Row"];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ROEMISCH = ["I", "II", "III", "IV", "V"] as const;

function formatCurrencyDE(amount: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

function formatDateDE(iso: string): string {
  return new Intl.DateTimeFormat("de-DE").format(new Date(iso));
}

export default async function VermoegensberichtDetailPage({
  params,
}: {
  params: Promise<{ id: string; berichtId: string }>;
}) {
  const { id: wegId, berichtId } = await params;

  if (!UUID_RE.test(wegId) || !UUID_RE.test(berichtId)) {
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
    console.error("[vermoegensbericht] WEG select failed:", wegError);
    throw new Error("WEG konnte nicht geladen werden.");
  }

  const { data: bericht, error: berichtError } = await supabase
    .from("vermoegensbericht")
    .select("*")
    .eq("id", berichtId)
    .eq("weg_id", wegId)
    .single<BerichtRow>();

  if (berichtError || !bericht) {
    if (berichtError?.code === "PGRST116") {
      notFound();
    }
    console.error("[vermoegensbericht] select failed:", berichtError);
    throw new Error("Der Vermögensbericht konnte nicht geladen werden.");
  }

  const { data: positionen, error: positionenError } = await supabase
    .from("vermoegensbericht_position")
    .select("*")
    .eq("vermoegensbericht_id", berichtId)
    .order("abschnitt", { ascending: true })
    .order("sortierung", { ascending: true })
    .returns<PositionRow[]>();

  if (positionenError) {
    console.error("[vermoegensbericht] positions select failed:", positionenError);
  }

  const rows: PositionRow[] = positionen ?? [];

  const fuerModul: BerichtsPosition[] = rows.map((row) => ({
    abschnitt: row.abschnitt,
    bezeichnung: row.bezeichnung,
    betragAnfang: row.betrag_anfang,
    betrag: row.betrag,
  }));

  const nettovermoegen = berechneNettovermoegen(fuerModul);
  const offen = offeneAbschnitte(fuerModul);
  const istEntwurf = bericht.status === "entwurf";

  return (
    <section className="mx-auto max-w-3xl space-y-6 px-6 py-12">
      <header>
        <p className="text-sm text-[color:var(--color-muted-foreground)]">
          <Link
            href={`/wegs/${wegId}/finanzen/vermoegensberichte` as Route}
            className="underline underline-offset-4 hover:text-[color:var(--color-foreground)]"
          >
            ← Zurück zu den Vermögensberichten
          </Link>
        </p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">
              {bericht.bezeichnung}
            </h1>
            <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
              {weg.name} · Stichtag {formatDateDE(bericht.stichtag)}
              {bericht.version_nr > 1 && ` · Fassung ${bericht.version_nr}`}
            </p>
          </div>
          <span className="inline-flex shrink-0 self-start rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-medium sm:self-auto">
            {VERMOEGENSBERICHT_STATUS_LABEL[bericht.status]}
            {bericht.erstellt_am && ` am ${formatDateDE(bericht.erstellt_am)}`}
          </span>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Vermögensübersicht</CardTitle>
          <CardDescription>
            Konten und Forderungen abzüglich Verbindlichkeiten. Die Rücklage
            bleibt hier außen vor — sie liegt auf einem der Konten und würde
            sonst doppelt gezählt.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="font-mono text-2xl font-semibold tabular-nums">
            {formatCurrencyDE(nettovermoegen)}
          </p>
          {offen.length > 0 && istEntwurf && (
            <p
              role="status"
              className="mt-4 rounded-md border border-dashed border-[color:var(--color-border)] p-3 text-sm text-[color:var(--color-muted-foreground)]"
            >
              Noch ohne Angaben:{" "}
              {offen
                .map((abschnitt) => VERMOEGENSBERICHT_ABSCHNITT_LABEL[abschnitt])
                .join(", ")}
              . Diese Abschnitte lassen sich nicht ableiten — im Zweifel lieber
              zu viel als zu wenig auflisten.
            </p>
          )}
        </CardContent>
      </Card>

      {VERMOEGENSBERICHT_ABSCHNITTE.map((abschnitt, index) => {
        const abschnittsZeilen = rows.filter((row) => row.abschnitt === abschnitt);
        const summe = summiereAbschnitt(fuerModul, abschnitt);
        const zeigtBestand = abschnitt === "konto" || abschnitt === "ruecklage";

        return (
          <Card key={abschnitt}>
            <CardHeader>
              <CardTitle>
                {ROEMISCH[index]}. {VERMOEGENSBERICHT_ABSCHNITT_LABEL[abschnitt]}
              </CardTitle>
              <CardDescription>
                {summe.anzahl === 0
                  ? "Keine Positionen."
                  : `${formatCurrencyDE(summe.summe)}${
                      summe.anzahlOhneBetrag > 0
                        ? ` · ${summe.anzahlOhneBetrag} Position${
                            summe.anzahlOhneBetrag === 1 ? "" : "en"
                          } ohne Bewertung`
                        : ""
                    }`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {abschnittsZeilen.length === 0 ? (
                <p className="text-sm text-[color:var(--color-muted-foreground)]">
                  —
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[color:var(--color-border)] text-left text-xs text-[color:var(--color-muted-foreground)]">
                        <th className="pb-2 pr-4 font-medium">Bezeichnung</th>
                        {zeigtBestand && (
                          <th className="pb-2 pr-4 text-right font-medium">
                            Anfang
                          </th>
                        )}
                        <th className="pb-2 pr-4 text-right font-medium">
                          {zeigtBestand ? "Ende" : "Betrag"}
                        </th>
                        <th className="pb-2 text-right font-medium">Quelle</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[color:var(--color-border)]">
                      {abschnittsZeilen.map((row) => (
                        <tr key={row.id} className="align-middle">
                          <td className="py-3 pr-4 text-[color:var(--color-foreground)]">
                            {row.bezeichnung}
                          </td>
                          {zeigtBestand && (
                            <td className="py-3 pr-4 text-right font-mono tabular-nums text-[color:var(--color-muted-foreground)]">
                              {row.betrag_anfang === null
                                ? "—"
                                : formatCurrencyDE(Number(row.betrag_anfang))}
                            </td>
                          )}
                          <td className="py-3 pr-4 text-right font-mono tabular-nums text-[color:var(--color-foreground)]">
                            {row.betrag === null
                              ? "ohne Bewertung"
                              : formatCurrencyDE(Number(row.betrag))}
                          </td>
                          <td className="py-3 text-right text-xs text-[color:var(--color-muted-foreground)]">
                            {row.quelle === "abgeleitet" ? (
                              "abgeleitet"
                            ) : istEntwurf ? (
                              <PositionLoeschen
                                wegId={wegId}
                                berichtId={berichtId}
                                positionId={row.id}
                                bezeichnung={row.bezeichnung}
                              />
                            ) : (
                              "erfasst"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {istEntwurf && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Position ergänzen</CardTitle>
              <CardDescription>
                Kontostände, offene Rechnungen gegenüber Dritten und bewegliche
                Sachen kennt die Buchhaltung nicht — die tragen Sie hier ein.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PositionForm wegId={wegId} berichtId={berichtId} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Bericht fertigstellen</CardTitle>
              <CardDescription>
                Danach ist der Bericht unveränderlich. Stellt sich später ein
                Fehler heraus, legen Sie einen neuen an — dieser wird dann
                abgelöst und bleibt lesbar.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FertigstellenForm wegId={wegId} berichtId={berichtId} />
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Was dieser Bericht nicht zeigt</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-[color:var(--color-muted-foreground)]">
          <p>
            Nachschüsse und Guthaben aus Jahresabrechnungen stehen in voller
            Höhe, auch wenn sie inzwischen bezahlt wurden: Zahlungen auf die
            Abrechnungsspitze werden noch nicht erfasst.
          </p>
          <p>
            Ausgewiesen wird nur die Erhaltungsrücklage. Weitere beschlossene
            Rücklagen — etwa für Prozesskosten — führt die Anwendung bislang
            nicht getrennt.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
