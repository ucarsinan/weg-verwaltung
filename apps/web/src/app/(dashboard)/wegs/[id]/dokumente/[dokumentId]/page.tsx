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
import { DOC_TYP_LABEL, formatAufbewahrung } from "@/modules/dokumente";
import type {
  Database,
  DocTyp,
  FristHerkunft,
} from "@/lib/supabase/database.types";

type WegRow = Database["public"]["Tables"]["weg"]["Row"];
type DokumentUebersichtRow = Database["public"]["Views"]["dokument_uebersicht"]["Row"];
type DocumentVersionRow = Database["public"]["Tables"]["document_version"]["Row"];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * ISO-Datum (YYYY-MM-DD) in deutsche Schreibweise, ohne `Date` — siehe
 * `modules/dokumente/aufbewahrung.ts` zur Zeitzonen-Begründung.
 */
function formatDatumDE(iso: string): string {
  const [jahr, monat, tag] = iso.split("-");
  return `${tag}.${monat}.${jahr}`;
}

/**
 * `uploaded_at` ist ein Zeitstempel (timestamptz), kein reines Datum — anders
 * als bei `dokument_datum` ist die Umrechnung über `Date` hier unproblematisch,
 * weil der Zeitstempel bereits einen absoluten Moment beschreibt.
 */
function formatZeitstempelDE(iso: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function formatDateiGroesse(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

interface VersionMitLink extends DocumentVersionRow {
  downloadUrl: string | null;
}

export default async function DokumentDetailPage({
  params,
}: {
  params: Promise<{ id: string; dokumentId: string }>;
}) {
  const { id: wegId, dokumentId } = await params;

  if (!UUID_RE.test(wegId) || !UUID_RE.test(dokumentId)) {
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
    console.error("[dokumente/detail] WEG select failed:", wegError);
    throw new Error("WEG konnte nicht geladen werden.");
  }

  const { data: dokument, error: dokumentError } = await supabase
    .from("dokument_uebersicht")
    .select(
      "dokument_id, titel, doc_typ, dokument_datum, aufzubewahren_bis, frist_herkunft",
    )
    .eq("dokument_id", dokumentId)
    .eq("weg_id", wegId)
    .is("deleted_at", null)
    .single<DokumentUebersichtRow>();

  if (
    dokumentError ||
    !dokument ||
    !dokument.titel ||
    !dokument.doc_typ ||
    !dokument.dokument_datum ||
    !dokument.frist_herkunft
  ) {
    if (dokumentError?.code === "PGRST116") {
      notFound();
    }
    console.error("[dokumente/detail] Dokument select failed:", dokumentError);
    throw new Error("Dokument konnte nicht geladen werden.");
  }

  const { data: versionen, error: versionenError } = await supabase
    .from("document_version")
    .select("*")
    .eq("document_id", dokumentId)
    .order("version_no", { ascending: false })
    .returns<DocumentVersionRow[]>();

  if (versionenError) {
    console.error("[dokumente/detail] Versionen select failed:", versionenError);
  }

  const versionRows: DocumentVersionRow[] = versionen ?? [];

  // Signierte URLs einzeln erzeugen statt den ganzen Seitenaufbau daran
  // scheitern zu lassen — schlägt eine Signierung fehl, bleibt die Version in
  // der Liste sichtbar, nur ohne Download-Link.
  const versionenMitLink: VersionMitLink[] = await Promise.all(
    versionRows.map(async (version) => {
      const { data: signed, error: signError } = await supabase.storage
        .from("weg-docs")
        .createSignedUrl(version.storage_path, 60);

      if (signError || !signed) {
        console.error(
          "[dokumente/detail] createSignedUrl failed:",
          version.id,
          signError,
        );
        return { ...version, downloadUrl: null };
      }

      return { ...version, downloadUrl: signed.signedUrl };
    }),
  );

  return (
    <section className="mx-auto max-w-3xl space-y-6 px-6 py-12">
      <header>
        <p className="text-sm text-[color:var(--color-muted-foreground)]">
          <Link
            href={`/wegs/${wegId}/dokumente` as Route}
            className="underline underline-offset-4 hover:text-[color:var(--color-foreground)]"
          >
            ← Zurück zu den Dokumenten
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {dokument.titel}
        </h1>
        <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
          {DOC_TYP_LABEL[dokument.doc_typ as DocTyp]} · Dokumentdatum{" "}
          {formatDatumDE(dokument.dokument_datum)} · Aufbewahrung{" "}
          {formatAufbewahrung(
            dokument.aufzubewahren_bis,
            dokument.frist_herkunft as FristHerkunft,
          )}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Versionen</CardTitle>
          <CardDescription>
            Jede hochgeladene Version bleibt erhalten und einzeln
            herunterladbar — keine überschreibt eine vorhandene Datei.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {versionRows.length === 0 ? (
            <p
              role="status"
              className="rounded-md border border-dashed border-[color:var(--color-border)] p-6 text-center text-sm text-[color:var(--color-muted-foreground)]"
            >
              Zu diesem Dokument ist keine Version hinterlegt.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--color-border)] text-left text-xs text-[color:var(--color-muted-foreground)]">
                    <th className="pb-2 pr-4 font-medium">Version</th>
                    <th className="pb-2 pr-4 font-medium">Hochgeladen am</th>
                    <th className="pb-2 pr-4 font-medium">Größe</th>
                    <th className="pb-2 text-right font-medium">Aktion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--color-border)]">
                  {versionenMitLink.map((version) => (
                    <tr key={version.id} className="align-middle">
                      <td className="py-3 pr-4 font-semibold tabular-nums text-[color:var(--color-foreground)]">
                        {version.version_no}
                      </td>
                      <td className="py-3 pr-4 tabular-nums text-[color:var(--color-foreground)]">
                        {formatZeitstempelDE(version.uploaded_at)}
                      </td>
                      <td className="py-3 pr-4 tabular-nums text-[color:var(--color-foreground)]">
                        {formatDateiGroesse(version.file_size_bytes)}
                      </td>
                      <td className="py-3 text-right">
                        {version.downloadUrl ? (
                          <a
                            href={version.downloadUrl}
                            className="text-sm underline underline-offset-4 hover:text-[var(--color-accent)]"
                            aria-label={`Version ${version.version_no} herunterladen`}
                          >
                            Herunterladen
                          </a>
                        ) : (
                          <span className="text-sm text-[color:var(--color-muted-foreground)]">
                            Download nicht verfügbar
                          </span>
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
    </section>
  );
}
