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
import type { Database, VerteilungsschluesselTyp } from "@/lib/supabase/database.types";

type WegRow = Database["public"]["Tables"]["weg"]["Row"];
type KeyRow = Database["public"]["Tables"]["verteilungsschluessel"]["Row"];
type VersionRow = Database["public"]["Tables"]["verteilungsschluessel_version"]["Row"];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TYP_LABELS: Record<VerteilungsschluesselTyp, string> = {
  mea: "Miteigentumsanteil",
  einheit: "Gleichverteilung je Einheit",
  flaeche: "Fläche",
  verbrauch: "Verbrauch",
  manuell: "Manuell",
  gemischt: "Gemischt",
};

export default async function VerteilungsschluesselListPage({
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
    .select("name")
    .eq("id", wegId)
    .single<Pick<WegRow, "name">>();

  if (wegError || !weg) {
    if (wegError?.code === "PGRST116") {
      notFound();
    }
    console.error("[verteilungsschluessel] WEG select failed:", wegError);
    throw new Error("WEG konnte nicht geladen werden.");
  }

  const { data: keys, error: keysError } = await supabase
    .from("verteilungsschluessel")
    .select("id, name, verteilungsschluessel_version(id, typ, gueltig_ab, gueltig_bis)")
    .eq("weg_id", wegId)
    .order("name", { ascending: true })
    .returns<
      (Pick<KeyRow, "id" | "name"> & {
        verteilungsschluessel_version: Pick<
          VersionRow,
          "id" | "typ" | "gueltig_ab" | "gueltig_bis"
        >[];
      })[]
    >();

  if (keysError) {
    console.error("[verteilungsschluessel] keys select failed:", keysError);
  }

  const keyRows = keys ?? [];

  return (
    <section className="mx-auto max-w-3xl space-y-6 px-6 py-12">
      <header>
        <p className="text-sm text-[color:var(--color-muted-foreground)]">
          <Link
            href={`/wegs/${wegId}/finanzen`}
            className="underline underline-offset-4 hover:text-[color:var(--color-foreground)]"
          >
            ← Zurück zu Wirtschaftspläne
          </Link>
        </p>
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">
              Verteilungsschlüssel
            </h1>
            <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
              Verteilungsregeln für {weg.name}
            </p>
          </div>
          <Button asChild className="shrink-0">
            <Link href={`/wegs/${wegId}/finanzen/verteilungsschluessel/new` as Route}>
              Verteilungsschlüssel anlegen
            </Link>
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Angelegte Verteilungsschlüssel</CardTitle>
          <CardDescription>
            Wirtschaftsplan-Positionen verweisen auf eine Version eines dieser
            Schlüssel. Fläche/Verbrauch/Manuell benötigen Basiswerte je Einheit.
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
            <ul className="divide-y divide-[color:var(--color-border)] text-sm">
              {keyRows.map((key) => (
                <li key={key.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-[color:var(--color-foreground)]">
                      {key.name}
                    </p>
                    <p className="mt-0.5 text-xs text-[color:var(--color-muted-foreground)]">
                      {key.verteilungsschluessel_version.length === 0
                        ? "Keine Version"
                        : key.verteilungsschluessel_version
                            .map((version) => TYP_LABELS[version.typ])
                            .join(", ")}
                    </p>
                  </div>
                  <Link
                    href={
                      `/wegs/${wegId}/finanzen/verteilungsschluessel/${key.id}` as Route
                    }
                    className="shrink-0 text-sm underline underline-offset-4 hover:text-[var(--color-accent)]"
                  >
                    Verwalten
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
