"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface BasiswertFormState {
  errors?: {
    wert?: string[];
    einheit?: string[];
    gueltig_ab?: string[];
    _form?: string[];
  };
  success?: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function upsertBasiswertAction(
  wegId: string,
  keyId: string,
  versionId: string,
  unitId: string,
  _prev: BasiswertFormState,
  formData: FormData,
): Promise<BasiswertFormState> {
  if (
    !UUID_RE.test(wegId) ||
    !UUID_RE.test(keyId) ||
    !UUID_RE.test(versionId) ||
    !UUID_RE.test(unitId)
  ) {
    return { errors: { _form: ["Ungültige ID. Bitte Seite neu laden."] } };
  }

  const wertRaw = String(formData.get("wert") ?? "").trim().replace(",", ".");
  const einheit = String(formData.get("einheit") ?? "").trim();
  const gueltigAb = String(formData.get("gueltig_ab") ?? "").trim();

  const errors: BasiswertFormState["errors"] = {};

  const wert = Number.parseFloat(wertRaw);
  if (!Number.isFinite(wert) || wert < 0) {
    errors.wert = ["Bitte einen Wert größer oder gleich 0 angeben."];
  }
  if (einheit.length === 0 || einheit.length > 50) {
    errors.einheit = ["Bitte eine Einheit angeben, z. B. m² oder kWh."];
  }
  if (!gueltigAb || Number.isNaN(Date.parse(gueltigAb))) {
    errors.gueltig_ab = ["Bitte ein gültiges Datum angeben."];
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("verteilungsschluessel_basiswert").upsert(
    {
      verteilungsschluessel_version_id: versionId,
      unit_id: unitId,
      wert,
      einheit,
      gueltig_ab: gueltigAb,
    },
    { onConflict: "tenant_id,verteilungsschluessel_version_id,unit_id,gueltig_ab" },
  );

  if (error) {
    console.error("[upsertBasiswertAction] upsert failed:", error);
    return {
      errors: {
        _form: ["Basiswert konnte nicht gespeichert werden. Bitte erneut versuchen."],
      },
    };
  }

  revalidatePath(`/wegs/${wegId}/finanzen/verteilungsschluessel/${keyId}`);
  return { success: true };
}
