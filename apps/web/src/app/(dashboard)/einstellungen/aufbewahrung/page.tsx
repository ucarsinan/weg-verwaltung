import { createClient } from "@/lib/supabase/server";
import { DOC_TYP_LABEL } from "@/modules/dokumente";
import { SettingsCard } from "@/modules/settings/segments/shared";
import type { Database, DocTyp, FristHerkunft } from "@/lib/supabase/database.types";
import { RegelForm } from "./regel-form";

export const metadata = { title: "Aufbewahrung — Einstellungen" };

type AufbewahrungEffektivRow = Database["public"]["Views"]["aufbewahrung_effektiv"]["Row"];

export default async function AufbewahrungPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("aufbewahrung_effektiv")
    .select("doc_typ, jahre, herkunft, rechtsgrundlage, notiz")
    .returns<AufbewahrungEffektivRow[]>();

  if (error) {
    console.error("[einstellungen/aufbewahrung] Uebersicht select failed:", error);
  }

  // aufbewahrung_effektiv (0071) liefert immer alle sieben Dokumentarten,
  // aber ohne garantierte Reihenfolge (unnest() legt keine fest) — die feste
  // Reihenfolge fuer die Anzeige kommt deshalb aus DOC_TYP_LABEL, nicht aus
  // der Antwort der Datenbank.
  const byDocTyp = new Map(
    (data ?? []).map((row) => [row.doc_typ as DocTyp, row]),
  );

  return (
    <SettingsCard
      title="Aufbewahrungsfristen"
      description="Je Dokumentart gilt entweder eine eigene Regel dieses Mandanten oder — solange keine gesetzt ist — der gesetzliche Rückfall als Vorschlag. Eine geänderte Regel wirkt sofort auf alle WEGs."
    >
      <div className="space-y-6">
        {(Object.keys(DOC_TYP_LABEL) as DocTyp[]).map((docTyp) => {
          const row = byDocTyp.get(docTyp);
          const effektiv = {
            jahre: row?.jahre ?? null,
            herkunft: (row?.herkunft as FristHerkunft) ?? "gesetzlicher_rueckfall",
            rechtsgrundlage: row?.rechtsgrundlage ?? null,
            notiz: row?.notiz ?? null,
          };

          return (
            <RegelForm
              key={docTyp}
              docTyp={docTyp}
              label={DOC_TYP_LABEL[docTyp]}
              effektiv={effektiv}
            />
          );
        })}
      </div>
    </SettingsCard>
  );
}
