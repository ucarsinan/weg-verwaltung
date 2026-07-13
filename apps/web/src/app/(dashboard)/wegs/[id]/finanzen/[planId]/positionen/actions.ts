"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface PositionFormState {
  errors?: {
    kostenart?: string[];
    jahresbetrag?: string[];
    verteilungsschluessel_version_id?: string[];
    _form?: string[];
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mapPositionError(code?: string): string {
  if (code === "23514") {
    return "Positionen können nur bearbeitet werden, während der Plan im Entwurf ist.";
  }
  if (code === "23503") {
    return "Der gewählte Verteilungsschlüssel gehört nicht zu dieser WEG.";
  }
  if (code === "23505") {
    return "Es existiert bereits eine Position mit dieser Nummer.";
  }
  return "Position konnte nicht gespeichert werden. Bitte erneut versuchen.";
}

export async function createPositionAction(
  wegId: string,
  planId: string,
  _prev: PositionFormState,
  formData: FormData,
): Promise<PositionFormState> {
  if (!UUID_RE.test(wegId) || !UUID_RE.test(planId)) {
    return { errors: { _form: ["Ungültige ID. Bitte Seite neu laden."] } };
  }

  const kostenart = String(formData.get("kostenart") ?? "").trim();
  const beschreibung = String(formData.get("beschreibung") ?? "").trim();
  const jahresbetragRaw = String(formData.get("jahresbetrag") ?? "")
    .trim()
    .replace(",", ".");
  const versionId = String(
    formData.get("verteilungsschluessel_version_id") ?? "",
  ).trim();

  const errors: PositionFormState["errors"] = {};

  if (kostenart.length === 0 || kostenart.length > 200) {
    errors.kostenart = ["Bitte eine Kostenart zwischen 1 und 200 Zeichen angeben."];
  }

  const jahresbetrag = Number.parseFloat(jahresbetragRaw);
  if (!Number.isFinite(jahresbetrag) || jahresbetrag < 0) {
    errors.jahresbetrag = ["Der Jahresbetrag muss größer oder gleich 0 sein."];
  }

  if (!UUID_RE.test(versionId)) {
    errors.verteilungsschluessel_version_id = [
      "Bitte einen Verteilungsschlüssel auswählen.",
    ];
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  const supabase = await createClient();

  const { count } = await supabase
    .from("wirtschaftsplan_position")
    .select("id", { count: "exact", head: true })
    .eq("wirtschaftsplan_id", planId);

  const { error } = await supabase.from("wirtschaftsplan_position").insert({
    wirtschaftsplan_id: planId,
    position: (count ?? 0) + 1,
    kostenart,
    beschreibung: beschreibung.length > 0 ? beschreibung : null,
    jahresbetrag,
    verteilungsschluessel_version_id: versionId,
  });

  if (error) {
    console.error("[createPositionAction] insert failed:", error);
    return { errors: { _form: [mapPositionError(error.code)] } };
  }

  revalidatePath(`/wegs/${wegId}/finanzen/${planId}/positionen`);
  return {};
}

export async function deletePositionAction(
  wegId: string,
  planId: string,
  positionId: string,
): Promise<{ error?: string }> {
  if (!UUID_RE.test(wegId) || !UUID_RE.test(planId) || !UUID_RE.test(positionId)) {
    return { error: "Ungültige ID. Bitte Seite neu laden." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("wirtschaftsplan_position")
    .delete()
    .eq("id", positionId)
    .eq("wirtschaftsplan_id", planId);

  if (error) {
    console.error("[deletePositionAction] delete failed:", error);
    return { error: mapPositionError(error.code) };
  }

  revalidatePath(`/wegs/${wegId}/finanzen/${planId}/positionen`);
  return {};
}
