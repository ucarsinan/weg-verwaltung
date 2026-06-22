import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { UnitEditForm } from "./unit-edit-form";
import type { Database } from "@/lib/supabase/database.types";

type UnitRow = Database["public"]["Tables"]["unit"]["Row"];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditUnitPage({
  params,
}: {
  params: Promise<{ id: string; unitId: string }>;
}) {
  const { id, unitId } = await params;

  if (!UUID_RE.test(id) || !UUID_RE.test(unitId)) {
    notFound();
  }

  const supabase = await createClient();

  const { data: unit, error: unitError } = await supabase
    .from("unit")
    .select("bezeichnung, mea_zaehler, mea_nenner")
    .eq("id", unitId)
    .eq("weg_id", id)
    .single<Pick<UnitRow, "bezeichnung" | "mea_zaehler" | "mea_nenner">>();

  if (unitError || !unit) {
    if (unitError?.code === "PGRST116") {
      notFound();
    }
    console.error("[edit-unit] select failed:", unitError);
    throw new Error("Wohneinheit konnte nicht geladen werden.");
  }

  return (
    <section className="mx-auto max-w-2xl px-6 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Wohneinheit bearbeiten
        </h1>
        <p className="mt-2 text-sm text-[color:var(--color-muted-foreground)]">
          Passen Sie die Bezeichnung oder den Miteigentumsanteil dieser Wohneinheit an.
        </p>
        <p className="mt-1 text-sm">
          <Link
            href={`/wegs/${id}`}
            className="underline underline-offset-4 hover:text-[var(--color-accent)]"
          >
            ← Zurück zur WEG-Detailansicht
          </Link>
        </p>
      </header>

      <UnitEditForm wegId={id} unitId={unitId} initialData={unit} />
    </section>
  );
}
