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
import { ABRECHNUNGS_STATUS_LABEL } from "@/modules/finanzen";
import type { Database } from "@/lib/supabase/database.types";
import AbrechnungForm from "./abrechnung-form";

type WegRow = Database["public"]["Tables"]["weg"]["Row"];
type AbrechnungRow = Database["public"]["Tables"]["abrechnung"]["Row"];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatDateDE(iso: string): string {
  return new Intl.DateTimeFormat("de-DE").format(new Date(iso));
}

export default async function AbrechnungenPage({
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
    console.error("[abrechnungen] WEG select failed:", wegError);
    throw new Error("WEG konnte nicht geladen werden.");
  }

  const { data: abrechnungen, error: abrechnungenError } = await supabase
    .from("abrechnung")
    .select("*")
    .eq("weg_id", wegId)
    .order("jahr", { ascending: false })
    .order("version_nr", { ascending: false })
    .returns<AbrechnungRow[]>();

  if (abrechnungenError) {
    console.error("[abrechnungen] select failed:", abrechnungenError);
  }

  const rows: AbrechnungRow[] = abrechnungen ?? [];

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
          Jahresabrechnungen
        </h1>
        <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
          {weg.name}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Erstellte Abrechnungen</CardTitle>
          <CardDescription>
            Beschlossen wird nicht die Abrechnung als Ganzes, sondern die
            Abrechnungsspitze — Nachschüsse oder die Anpassung der Vorschüsse
            (§ 28 Abs. 2 WEG).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p
              role="status"
              className="rounded-md border border-dashed border-[color:var(--color-border)] p-6 text-center text-sm text-[color:var(--color-muted-foreground)]"
            >
              Noch keine Abrechnung erstellt.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--color-border)] text-left text-xs text-[color:var(--color-muted-foreground)]">
                    <th className="pb-2 pr-4 font-medium">Jahr</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 pr-4 font-medium">Beschlossen am</th>
                    <th className="pb-2 text-right font-medium">Aktion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--color-border)]">
                  {rows.map((abrechnung) => (
                    <tr key={abrechnung.id} className="align-middle">
                      <td className="py-3 pr-4 font-semibold tabular-nums text-[color:var(--color-foreground)]">
                        {abrechnung.jahr}
                        {abrechnung.version_nr > 1 && (
                          <span className="ml-2 text-xs font-normal text-[color:var(--color-muted-foreground)]">
                            v{abrechnung.version_nr}
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <span className="inline-flex rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-medium">
                          {ABRECHNUNGS_STATUS_LABEL[abrechnung.status]}
                        </span>
                      </td>
                      <td className="py-3 pr-4 tabular-nums text-[color:var(--color-foreground)]">
                        {abrechnung.beschlossen_am
                          ? formatDateDE(abrechnung.beschlossen_am)
                          : "—"}
                      </td>
                      <td className="py-3 text-right">
                        <Link
                          href={
                            `/wegs/${wegId}/finanzen/abrechnungen/${abrechnung.id}` as Route
                          }
                          className="text-sm underline underline-offset-4 hover:text-[var(--color-accent)]"
                          aria-label={`Jahresabrechnung ${abrechnung.jahr} öffnen`}
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
          <CardTitle>Abrechnung erstellen</CardTitle>
          <CardDescription>
            Für eine Korrektur einer bereits beschlossenen Abrechnung einfach
            erneut erstellen — ein Zweitbeschluss ist zulässig und löst den
            ersten ab.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AbrechnungForm
            wegId={wegId}
            vorschlagJahr={new Date().getFullYear() - 1}
          />
        </CardContent>
      </Card>
    </section>
  );
}
