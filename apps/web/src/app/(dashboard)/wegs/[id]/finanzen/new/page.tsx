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
import WirtschaftsplanForm from "./wirtschaftsplan-form";

type WegRow = Database["public"]["Tables"]["weg"]["Row"];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewWirtschaftsplanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: wegId } = await params;

  if (!UUID_RE.test(wegId)) {
    notFound();
  }

  const supabase = await createClient();

  // Load the WEG info
  const { data: weg, error: wegError } = await supabase
    .from("weg")
    .select("*")
    .eq("id", wegId)
    .single<WegRow>();

  if (wegError || !weg) {
    if (wegError?.code === "PGRST116") {
      notFound();
    }
    console.error("[new-wirtschaftsplan] WEG select failed:", wegError);
    throw new Error("WEG konnte nicht geladen werden.");
  }

  // Load units for the WEG to calculate Miteigentumsanteile preview
  const { data: units, error: unitsError } = await supabase
    .from("unit")
    .select("id, bezeichnung, mea_zaehler, mea_nenner")
    .eq("weg_id", wegId)
    .order("bezeichnung", { ascending: true });

  if (unitsError) {
    console.error("[new-wirtschaftsplan] units select failed:", unitsError);
  }

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
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Wirtschaftsplan erstellen
        </h1>
        <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
          Plan für {weg.name} anlegen
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Daten des Wirtschaftsplans</CardTitle>
          <CardDescription>
            Geben Sie das Jahr, die Bezeichnung und die veranschlagten Gesamtkosten an.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WirtschaftsplanForm wegId={wegId} units={units || []} />
        </CardContent>
      </Card>
    </section>
  );
}
