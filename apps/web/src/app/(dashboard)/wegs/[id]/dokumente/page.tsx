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
import { DOC_TYP_LABEL, formatAufbewahrung } from "@/modules/dokumente";
import type {
  Database,
  DocTyp,
  FristHerkunft,
} from "@/lib/supabase/database.types";

type WegRow = Database["public"]["Tables"]["weg"]["Row"];
type DokumentUebersichtRow = Database["public"]["Views"]["dokument_uebersicht"]["Row"];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * ISO-Datum (YYYY-MM-DD) in deutsche Schreibweise, ohne `Date` — westlich von
 * UTC verschiebt `new Date(iso)` das Datum sonst um einen Tag zurueck (siehe
 * `modules/dokumente/aufbewahrung.ts`).
 */
function formatDatumDE(iso: string): string {
  const [jahr, monat, tag] = iso.split("-");
  return `${tag}.${monat}.${jahr}`;
}

function formatDateiGroesse(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function DokumentePage({
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
    console.error("[dokumente] WEG select failed:", wegError);
    throw new Error("WEG konnte nicht geladen werden.");
  }

  const { data: dokumente, error: dokumenteError } = await supabase
    .from("dokument_uebersicht")
    .select(
      "dokument_id, titel, doc_typ, dokument_datum, version_no, file_size_bytes, aufzubewahren_bis, frist_herkunft",
    )
    .eq("weg_id", wegId)
    .is("deleted_at", null)
    .order("dokument_datum", { ascending: false })
    .returns<DokumentUebersichtRow[]>();

  if (dokumenteError) {
    console.error("[dokumente] Uebersicht select failed:", dokumenteError);
  }

  const dokumentRows: DokumentUebersichtRow[] = dokumente ?? [];

  return (
    <section className="mx-auto max-w-3xl space-y-6 px-6 py-12">
      <header>
        <p className="text-sm text-[color:var(--color-muted-foreground)]">
          <Link
            href={`/wegs/${wegId}` as Route}
            className="underline underline-offset-4 hover:text-[color:var(--color-foreground)]"
          >
            ← Zurück zur WEG
          </Link>
        </p>
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">
              Dokumente
            </h1>
            <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
              Ablage für die Verwaltung von {weg.name} — kein Eigentümerportal
              und kein Ersatz für das Einsichtsrecht nach § 18 Abs. 4 WEG.
            </p>
          </div>
          <Button asChild className="shrink-0">
            <Link href={`/wegs/${wegId}/dokumente/neu` as Route}>
              Dokument hochladen
            </Link>
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Abgelegte Dokumente</CardTitle>
          <CardDescription>
            Die Aufbewahrung ist eine Anzeige, kein Automatismus — nichts wird
            nach Fristablauf gelöscht oder archiviert.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dokumentRows.length === 0 ? (
            <p
              role="status"
              className="rounded-md border border-dashed border-[color:var(--color-border)] p-6 text-center text-sm text-[color:var(--color-muted-foreground)]"
            >
              Noch kein Dokument abgelegt.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--color-border)] text-left text-xs text-[color:var(--color-muted-foreground)]">
                    <th className="pb-2 pr-4 font-medium">Titel</th>
                    <th className="pb-2 pr-4 font-medium">Art</th>
                    <th className="pb-2 pr-4 font-medium">Datum</th>
                    <th className="pb-2 pr-4 font-medium">Version</th>
                    <th className="pb-2 pr-4 font-medium">Größe</th>
                    <th className="pb-2 font-medium">Aufbewahrung</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--color-border)]">
                  {dokumentRows.map((dokument) => (
                    <tr key={dokument.dokument_id} className="align-middle">
                      <td className="py-3 pr-4 font-semibold text-[color:var(--color-foreground)]">
                        <Link
                          href={
                            `/wegs/${wegId}/dokumente/${dokument.dokument_id}` as Route
                          }
                          className="underline-offset-4 hover:underline"
                        >
                          {dokument.titel ?? "(ohne Titel)"}
                        </Link>
                      </td>
                      <td className="py-3 pr-4 text-[color:var(--color-foreground)]">
                        {dokument.doc_typ
                          ? DOC_TYP_LABEL[dokument.doc_typ as DocTyp]
                          : "—"}
                      </td>
                      <td className="py-3 pr-4 tabular-nums text-[color:var(--color-foreground)]">
                        {dokument.dokument_datum
                          ? formatDatumDE(dokument.dokument_datum)
                          : "—"}
                      </td>
                      <td className="py-3 pr-4 tabular-nums text-[color:var(--color-foreground)]">
                        {dokument.version_no ?? "—"}
                      </td>
                      <td className="py-3 pr-4 tabular-nums text-[color:var(--color-foreground)]">
                        {dokument.file_size_bytes !== null
                          ? formatDateiGroesse(dokument.file_size_bytes)
                          : "—"}
                      </td>
                      <td className="py-3 text-[color:var(--color-foreground)]">
                        {dokument.frist_herkunft
                          ? formatAufbewahrung(
                              dokument.aufzubewahren_bis,
                              dokument.frist_herkunft as FristHerkunft,
                            )
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
