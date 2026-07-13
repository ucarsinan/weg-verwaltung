import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Database } from "@/lib/supabase/database.types";
import VerteilungsschluesselForm from "./verteilungsschluessel-form";

type WegRow = Database["public"]["Tables"]["weg"]["Row"];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewVerteilungsschluesselPage({
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
    console.error("[new-verteilungsschluessel] WEG select failed:", wegError);
    throw new Error("WEG konnte nicht geladen werden.");
  }

  return (
    <section className="mx-auto max-w-3xl space-y-6 px-6 py-12">
      <header>
        <p className="text-sm text-[color:var(--color-muted-foreground)]">
          <Link
            href={`/wegs/${wegId}/finanzen/verteilungsschluessel`}
            className="underline underline-offset-4 hover:text-[color:var(--color-foreground)]"
          >
            ← Zurück zu Verteilungsschlüssel
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Verteilungsschlüssel anlegen
        </h1>
        <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
          Für {weg.name}. Legt den Schlüssel und seine erste Version an.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Neuer Verteilungsschlüssel</CardTitle>
          <CardDescription>
            Fläche, Verbrauch und Manuell benötigen anschließend Basiswerte je
            Einheit, bevor sie in einer Wirtschaftsplan-Position verwendet
            werden können.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VerteilungsschluesselForm wegId={wegId} />
        </CardContent>
      </Card>
    </section>
  );
}
