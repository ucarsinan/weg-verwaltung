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
import { VERMOEGENSBERICHT_STATUS_LABEL } from "@/modules/finanzen";
import type { Database } from "@/lib/supabase/database.types";
import VermoegensberichtForm from "./vermoegensbericht-form";

type WegRow = Database["public"]["Tables"]["weg"]["Row"];
type BerichtRow = Database["public"]["Tables"]["vermoegensbericht"]["Row"];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatDateDE(iso: string): string {
  return new Intl.DateTimeFormat("de-DE").format(new Date(iso));
}

export default async function VermoegensberichtePage({
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
    console.error("[vermoegensberichte] WEG select failed:", wegError);
    throw new Error("WEG konnte nicht geladen werden.");
  }

  const { data: berichte, error: berichteError } = await supabase
    .from("vermoegensbericht")
    .select("*")
    .eq("weg_id", wegId)
    .order("jahr", { ascending: false })
    .order("version_nr", { ascending: false })
    .returns<BerichtRow[]>();

  if (berichteError) {
    console.error("[vermoegensberichte] select failed:", berichteError);
  }

  const rows: BerichtRow[] = berichte ?? [];

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
          Vermögensberichte
        </h1>
        <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
          {weg.name}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Erstellte Berichte</CardTitle>
          <CardDescription>
            Der Vermögensbericht wird nicht beschlossen (§ 28 Abs. 4 WEG). Er
            wird erstellt und jedem Eigentümer zur Verfügung gestellt — wer ihn
            für falsch hält, kann eine Berichtigung verlangen, nicht ihn
            anfechten.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p
              role="status"
              className="rounded-md border border-dashed border-[color:var(--color-border)] p-6 text-center text-sm text-[color:var(--color-muted-foreground)]"
            >
              Noch kein Vermögensbericht erstellt.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--color-border)] text-left text-xs text-[color:var(--color-muted-foreground)]">
                    <th className="pb-2 pr-4 font-medium">Jahr</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 pr-4 font-medium">Erstellt am</th>
                    <th className="pb-2 text-right font-medium">Aktion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--color-border)]">
                  {rows.map((bericht) => (
                    <tr key={bericht.id} className="align-middle">
                      <td className="py-3 pr-4 font-semibold tabular-nums text-[color:var(--color-foreground)]">
                        {bericht.jahr}
                        {bericht.version_nr > 1 && (
                          <span className="ml-2 text-xs font-normal text-[color:var(--color-muted-foreground)]">
                            v{bericht.version_nr}
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <span className="inline-flex rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-medium">
                          {VERMOEGENSBERICHT_STATUS_LABEL[bericht.status]}
                        </span>
                      </td>
                      <td className="py-3 pr-4 tabular-nums text-[color:var(--color-foreground)]">
                        {bericht.erstellt_am
                          ? formatDateDE(bericht.erstellt_am)
                          : "—"}
                      </td>
                      <td className="py-3 text-right">
                        <Link
                          href={
                            `/wegs/${wegId}/finanzen/vermoegensberichte/${bericht.id}` as Route
                          }
                          className="text-sm underline underline-offset-4 hover:text-[var(--color-accent)]"
                          aria-label={`Vermögensbericht ${bericht.jahr} öffnen`}
                        >
                          Öffnen
                        </Link>
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
          <CardTitle>Bericht erstellen</CardTitle>
          <CardDescription>
            Für eine Berichtigung einfach erneut erstellen — der bisherige
            Bericht wird dabei abgelöst und bleibt lesbar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VermoegensberichtForm
            wegId={wegId}
            vorschlagJahr={new Date().getFullYear() - 1}
          />
        </CardContent>
      </Card>
    </section>
  );
}
