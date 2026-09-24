import { logPostgrestError } from "@/modules/action-kernel";
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
    logPostgrestError("einstellungenAufbewahrung", error);

    // Diese Seite existiert ausschließlich, um die geltende Frist mit
    // wahrheitsgemäßer Herkunft anzuzeigen — nie ohne Herkunft und nie
    // erfunden. Ein fehlgeschlagener Query-Zugriff zeigt deshalb einen
    // sichtbaren Fehlerzustand, keine sieben Zeilen mit stillschweigend
    // untergeschobenem "dauerhaft · gesetzlicher Rückfall": ein Verwalter
    // hätte sonst keine Möglichkeit zu erkennen, dass die Datenbank nie
    // erreicht wurde.
    return (
      <SettingsCard
        title="Aufbewahrungsfristen"
        description="Je Dokumentart gilt entweder eine eigene Regel dieses Mandanten oder — solange keine gesetzt ist — der gesetzliche Rückfall als Vorschlag. Eine geänderte Regel wirkt sofort auf alle WEGs."
      >
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          Die Aufbewahrungsfristen konnten nicht geladen werden. Bitte laden
          Sie die Seite neu; besteht das Problem weiterhin, wenden Sie sich an
          den Support.
        </p>
      </SettingsCard>
    );
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

          // aufbewahrung_effektiv garantiert (pgTAP-geprüft) genau eine
          // Zeile je Dokumentart — fehlt sie trotzdem, wäre jeder erfundene
          // Ersatzwert (z. B. "dauerhaft") eine Behauptung ohne Deckung.
          // Ehrlicher Fehlertext statt eines Rateergebnisses.
          if (!row) {
            return (
              <div
                key={docTyp}
                className="space-y-1 border-t border-[color:var(--color-border)] pt-5 first:border-t-0 first:pt-0"
              >
                <p className="font-medium text-[color:var(--color-foreground)]">
                  {DOC_TYP_LABEL[docTyp]}
                </p>
                <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                  Für diese Dokumentart konnte keine Frist geladen werden.
                </p>
              </div>
            );
          }

          return (
            <RegelForm
              key={docTyp}
              docTyp={docTyp}
              label={DOC_TYP_LABEL[docTyp]}
              effektiv={{
                jahre: row.jahre,
                herkunft: row.herkunft as FristHerkunft,
                rechtsgrundlage: row.rechtsgrundlage,
                notiz: row.notiz,
              }}
            />
          );
        })}
      </div>
    </SettingsCard>
  );
}
