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
import {
  WirtschaftsplanEditForm,
  type BeschlussOption,
} from "./wirtschaftsplan-edit-form";

type WegRow = Database["public"]["Tables"]["weg"]["Row"];
type WirtschaftsplanRow =
  Database["public"]["Tables"]["wirtschaftsplan"]["Row"];
type UnitRow = Database["public"]["Tables"]["unit"]["Row"];
type BeschlussSammlungEntryRow =
  Database["public"]["Tables"]["beschluss_sammlung_entry"]["Row"];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DATE_SHORT: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
};

function formatDateDE(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", DATE_SHORT);
}

// Kurzformen wie auf der Liste der Beschluss-Sammlung.
const TYP_LABEL: Record<
  BeschlussSammlungEntryRow["typ"],
  string
> = {
  positiv_beschluss: "Positiv",
  negativ_beschluss: "Negativ",
  umlaufbeschluss: "Umlauf",
};

/** Beschlusstexte sind bis 10.000 Zeichen lang — im Auswahlfeld wird gekürzt. */
function kuerze(text: string, max = 70): string {
  const einzeilig = text.replace(/\s+/g, " ").trim();
  return einzeilig.length > max ? `${einzeilig.slice(0, max - 1)}…` : einzeilig;
}

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
      "jahr, bezeichnung, gesamtkosten, status, version_nr, wirksam_ab_monat, aktiviert_am, abgeloest_am, archiviert_am, beschluss_sammlung_entry_id",
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
        | "beschluss_sammlung_entry_id"
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

  // Nur zustimmende Beschluesse. Ein abgelehnter Antrag begruendet keine
  // Vorschuesse — 0074 weist ihn ab, ihn hier anzubieten waere eine falsche
  // Faehrte. Neueste zuerst: den Beschluss zu einem frischen Plan sucht man oben.
  const { data: beschluesse, error: beschluesseError } = await supabase
    .from("beschluss_sammlung_entry")
    .select("id, lfd_nr, datum, typ, beschluss_text")
    .eq("weg_id", wegId)
    .in("typ", ["positiv_beschluss", "umlaufbeschluss"])
    .order("lfd_nr", { ascending: false })
    .returns<
      Pick<
        BeschlussSammlungEntryRow,
        "id" | "lfd_nr" | "datum" | "typ" | "beschluss_text"
      >[]
    >();

  if (beschluesseError) {
    console.error(
      "[edit-wirtschaftsplan] beschluss-sammlung select failed:",
      beschluesseError,
    );
  }

  const beschlussOptionen: BeschlussOption[] = (beschluesse ?? []).map(
    (eintrag) => ({
      id: eintrag.id,
      label: `#${eintrag.lfd_nr} — ${formatDateDE(eintrag.datum)} — ${
        TYP_LABEL[eintrag.typ]
      } — ${kuerze(eintrag.beschluss_text)}`,
    }),
  );

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
            beschluesse={beschlussOptionen}
          />
        </CardContent>
      </Card>
    </section>
  );
}
