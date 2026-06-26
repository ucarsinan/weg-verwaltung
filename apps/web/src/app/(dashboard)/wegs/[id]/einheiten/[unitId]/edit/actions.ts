"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface UnitEditFormState {
  errors?: {
    bezeichnung?: string[];
    mea_zaehler?: string[];
    mea_nenner?: string[];
    _form?: string[];
  };
}

export async function updateUnit(
  wegId: string,
  unitId: string,
  _prev: UnitEditFormState,
  formData: FormData,
): Promise<UnitEditFormState> {
  const bezeichnung = String(formData.get("bezeichnung") ?? "").trim();
  const zaehlerRaw = String(formData.get("mea_zaehler") ?? "").trim();
  const nennerRaw = String(formData.get("mea_nenner") ?? "").trim();

  const errors: UnitEditFormState["errors"] = {};

  if (bezeichnung.length < 1) {
    errors.bezeichnung = ["Bezeichnung darf nicht leer sein."];
  } else if (bezeichnung.length > 200) {
    errors.bezeichnung = ["Bezeichnung darf höchstens 200 Zeichen lang sein."];
  }

  const zaehler = parseInt(zaehlerRaw, 10);
  if (!zaehlerRaw || isNaN(zaehler) || zaehler < 1) {
    errors.mea_zaehler = ["MEA-Zähler muss eine positive ganze Zahl sein."];
  }

  const nenner = parseInt(nennerRaw, 10);
  if (!nennerRaw || isNaN(nenner) || nenner < 1) {
    errors.mea_nenner = ["MEA-Nenner muss eine positive ganze Zahl sein."];
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("unit")
    .update({
      bezeichnung,
      mea_zaehler: zaehler,
      mea_nenner: nenner,
    })
    .eq("id", unitId);

  if (error) {
    console.error("[updateUnit] update failed", {
      code: error.code,
      hint: error.hint,
    });
    return {
      errors: {
        _form: ["Wohneinheit konnte nicht aktualisiert werden. Bitte erneut versuchen."],
      },
    };
  }

  revalidatePath(`/wegs/${wegId}`);
  redirect(`/wegs/${wegId}`);
}

export async function deleteUnit(
  wegId: string,
  unitId: string,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("unit")
    .delete()
    .eq("id", unitId);

  if (error) {
    console.error("[deleteUnit] delete failed", {
      code: error.code,
      hint: error.hint,
    });

    if (error.code === "23503") {
      return {
        error:
          "Die Wohneinheit kann nicht gelöscht werden, da ihr noch Eigentumsverhältnisse (Eigentümer) zugeordnet sind. Bitte löschen Sie zuerst alle Eigentumsverhältnisse dieser Einheit.",
      };
    }

    return {
      error: "Wohneinheit konnte nicht gelöscht werden. Bitte erneut versuchen.",
    };
  }

  revalidatePath(`/wegs/${wegId}`);
  redirect(`/wegs/${wegId}`);
}
