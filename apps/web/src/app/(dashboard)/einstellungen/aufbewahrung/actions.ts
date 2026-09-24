"use server";

import { revalidatePath } from "next/cache";

import { logPostgrestError, runFormAction } from "@/modules/action-kernel";
import { parseRegelForm } from "@/modules/dokumente";
import type { RegelFormState as ModuleRegelFormState, RegelInput } from "@/modules/dokumente";

// Lokaler Typ-Alias statt `export type {...} from …` — dasselbe Muster wie
// in wegs/[id]/dokumente/actions.ts: "use server"-Dateien vertragen laut
// dortigem Kommentar keine `export type {…}`-Re-Exports unter Turbopack.
export type RegelFormState = ModuleRegelFormState;

export async function speichereRegelAction(
  _prev: RegelFormState,
  formData: FormData,
): Promise<RegelFormState> {
  return runFormAction<RegelInput, RegelFormState>(
    {
      scope: "speichereRegel",
      guardError: (message) => ({ errors: { _form: [message] } }),
      parse: parseRegelForm,
      execute: async (ctx, input) => {
        // upsert auf (tenant_id, doc_typ) — die Unique-Constraint aus 0069.
        // tenant_id kommt aus dem verifizierten Session-Kontext, nie aus dem
        // Formular: ein Client könnte sonst eine fremde tenant_id einschicken
        // und versuchen, die Regel eines anderen Mandanten zu überschreiben.
        // RLS würde das zwar ohnehin verhindern (Defense-in-Depth), aber der
        // Wert kommt hier erst gar nicht vom Client.
        const { error } = await ctx.supabase.from("aufbewahrungsregel").upsert(
          {
            tenant_id: ctx.tenantId,
            doc_typ: input.docTyp,
            jahre: input.jahre,
            rechtsgrundlage: input.rechtsgrundlage,
            notiz: input.notiz,
          },
          { onConflict: "tenant_id,doc_typ" },
        );

        if (error) {
          logPostgrestError("speichereRegel", error);
          return {
            errors: { errors: { _form: ["Speichern fehlgeschlagen."] } },
          };
        }

        // Eine geänderte Frist gilt mandantenweit, nicht nur für eine WEG —
        // jede Dokumentenliste unter /wegs/[id]/dokumente zeigt sie über
        // dokument_uebersicht mit an. revalidatePath kennt für ein
        // dynamisches Segment ohne konkrete ID nur den "page"-Musterpfad
        // (Next.js-API); der Kernel selbst revalidiert nur einzelne, feste
        // Pfade, deshalb hier zusätzlich direkt aufgerufen.
        revalidatePath("/wegs/[id]/dokumente", "page");

        return {
          revalidate: ["/einstellungen/aufbewahrung"],
          state: { success: "Frist gespeichert." },
        };
      },
    },
    formData,
  );
}
