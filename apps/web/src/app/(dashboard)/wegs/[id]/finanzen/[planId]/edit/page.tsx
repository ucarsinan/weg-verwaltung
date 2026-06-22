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
import { WirtschaftsplanEditForm } from "./wirtschaftsplan-edit-form";

type WegRow = Database["public"]["Tables"]["weg"]["Row"];
type WirtschaftsplanRow =
  Database["public"]["Tables"]["wirtschaftsplan"]["Row"];
type UnitRow = Database["public"]["Tables"]["unit"]["Row"];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditWirtschaftsplanPage({
  params,
}: {
  params: Promise<{ id: string; planId: string }>;
}) {
  const { id: wegId, planId } = await params;

  if (!UUID_RE.test(wegId) || !UUID_RE.test(planId)) {
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
    console.error("[edit-wirtschaftsplan] WEG select failed:", wegError);
    throw new Error("WEG konnte nicht geladen werden.");
  }

  const { data: plan, error: planError } = await supabase
    .from("wirtschaftsplan")
    .select(
      "jahr, bezeichnung, gesamtkosten, status, version_nr, wirksam_ab_monat, aktiviert_am, abgeloest_am, archiviert_am",
    )
    .eq("id", planId)
    .eq("weg_id", wegId)
    .single<
      Pick<
        WirtschaftsplanRow,
        | "jahr"
        | "bezeichnung"
        | "gesamtkosten"
        | "status"
        | "version_nr"
        | "wirksam_ab_monat"
        | "aktiviert_am"
        | "abgeloest_am"
        | "archiviert_am"
      >
    >();

  if (planError || !plan) {
    if (planError?.code === "PGRST116") {
      notFound();
    }
    console.error("[edit-wirtschaftsplan] plan select failed:", planError);
    throw new Error("Wirtschaftsplan konnte nicht geladen werden.");
  }

  const { data: units, error: unitsError } = await supabase
    .from("unit")
    .select("id, bezeichnung, mea_zaehler, mea_nenner")
    .eq("weg_id", wegId)
    .order("bezeichnung", { ascending: true })
    .returns<Pick<UnitRow, "id" | "bezeichnung" | "mea_zaehler" | "mea_nenner">[]>();

  if (unitsError) {
    console.error("[edit-wirtschaftsplan] units select failed:", unitsError);
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
          Wirtschaftsplan bearbeiten
        </h1>
        <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
          Plan für {weg.name} aktualisieren oder in den Lifecycle überführen.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Daten des Wirtschaftsplans</CardTitle>
          <CardDescription>
            Bestehende Sollstellungen bleiben historisch unverändert; fachliche
            Änderungen erfolgen über Nachtrag oder Korrektur.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WirtschaftsplanEditForm
            wegId={wegId}
            planId={planId}
            initialData={plan}
            units={units ?? []}
          />
        </CardContent>
      </Card>
    </section>
  );
}
