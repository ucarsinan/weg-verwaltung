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
import {
  VERTEILUNGSSCHLUESSEL_QUELLE_LABEL,
  VERTEILUNGSSCHLUESSEL_TYP_LABEL,
  brauchtBasiswerte,
  isGeneratorUnterstuetzt,
} from "@/modules/finanzen";
import type { Database } from "@/lib/supabase/database.types";

type WegRow = Database["public"]["Tables"]["weg"]["Row"];
type VersionRow =
  Database["public"]["Tables"]["verteilungsschluessel_version"]["Row"];
type KeyRow = Database["public"]["Tables"]["verteilungsschluessel"]["Row"] & {
  verteilungsschluessel_version: VersionRow[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatDateDE(iso: string): string {
  return new Intl.DateTimeFormat("de-DE").format(new Date(iso));
}

/** Jüngste Version nach `gueltig_ab` — dieselbe Ordnung wie der 0056-Index. */
function aktuelleVersion(versionen: VersionRow[]): VersionRow | undefined {
  return [...versionen].sort((a, b) =>
    b.gueltig_ab.localeCompare(a.gueltig_ab),
  )[0];
}

export default async function VerteilungsschluesselPage({
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
    console.error("[verteilungsschluessel] WEG select failed:", wegError);
    throw new Error("WEG konnte nicht geladen werden.");
  }

  const { data: keys, error: keysError } = await supabase
    .from("verteilungsschluessel")
    .select("*, verteilungsschluessel_version(*)")
    .eq("weg_id", wegId)
    .order("name", { ascending: true })
    .returns<KeyRow[]>();

  if (keysError) {
    console.error("[verteilungsschluessel] keys select failed:", keysError);
  }

  const keyRows: KeyRow[] = keys ?? [];

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
              Verteilungsschlüssel
            </h1>
            <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
              Kostenverteilung für {weg.name}
            </p>
          </div>
          <Button asChild className="shrink-0">
            <Link
              href={
                `/wegs/${wegId}/finanzen/verteilungsschluessel/new` as Route
              }
            >
              Verteilungsschlüssel anlegen
            </Link>
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Angelegte Schlüssel</CardTitle>
          <CardDescription>
            Nach § 16 Abs. 2 WEG gelten die Miteigentumsanteile, solange die
            Eigentümer für eine Kostenart nichts anderes beschlossen haben.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {keyRows.length === 0 ? (
            <p
              role="status"
              className="rounded-md border border-dashed border-[color:var(--color-border)] p-6 text-center text-sm text-[color:var(--color-muted-foreground)]"
            >
              Noch kein Verteilungsschlüssel angelegt.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--color-border)] text-left text-xs text-[color:var(--color-muted-foreground)]">
                    <th className="pb-2 pr-4 font-medium">Name</th>
                    <th className="pb-2 pr-4 font-medium">Typ</th>
                    <th className="pb-2 pr-4 font-medium">Grundlage</th>
                    <th className="pb-2 pr-4 font-medium">Gültig ab</th>
                    <th className="pb-2 text-right font-medium">Aktion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--color-border)]">
                  {keyRows.map((key) => {
                    const version = aktuelleVersion(
                      key.verteilungsschluessel_version ?? [],
                    );

                    return (
                      <tr key={key.id} className="align-middle">
                        <td className="py-3 pr-4 font-semibold text-[color:var(--color-foreground)]">
                          {key.name}
                        </td>
                        <td className="py-3 pr-4 text-[color:var(--color-foreground)]">
                          {version ? (
                            <>
                              {VERTEILUNGSSCHLUESSEL_TYP_LABEL[version.typ]}
                              {!isGeneratorUnterstuetzt(version.typ) && (
                                <span
                                  className="ml-2 inline-flex rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-400"
                                  title="Gemischte Schlüssel kann der Sollstellungs-Generator noch nicht auflösen."
                                >
                                  noch nicht buchbar
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-[color:var(--color-muted-foreground)]">
                              keine Version
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-[color:var(--color-foreground)]">
                          {version
                            ? VERTEILUNGSSCHLUESSEL_QUELLE_LABEL[version.quelle]
                            : "—"}
                        </td>
                        <td className="py-3 pr-4 tabular-nums text-[color:var(--color-foreground)]">
                          {version ? formatDateDE(version.gueltig_ab) : "—"}
                        </td>
                        <td className="py-3 text-right">
                          {version && brauchtBasiswerte(version.typ) ? (
                            <Link
                              href={
                                `/wegs/${wegId}/finanzen/verteilungsschluessel/${key.id}` as Route
                              }
                              className="text-sm underline underline-offset-4 hover:text-[var(--color-accent)]"
                              aria-label={`Basiswerte für ${key.name} pflegen`}
                            >
                              Basiswerte pflegen
                            </Link>
                          ) : (
                            <span className="text-sm text-[color:var(--color-muted-foreground)]">
                              keine Basiswerte nötig
                            </span>
                          )}
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
    </section>
  );
}
