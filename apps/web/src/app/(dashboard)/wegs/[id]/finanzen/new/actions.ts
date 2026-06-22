"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface WirtschaftsplanFormState {
  errors?: {
    jahr?: string[];
    bezeichnung?: string[];
    gesamtkosten?: string[];
    wirksam_ab_monat?: string[];
    _form?: string[];
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createWirtschaftsplanAction(
  _prev: WirtschaftsplanFormState,
  formData: FormData,
): Promise<WirtschaftsplanFormState> {
  const wegId = String(formData.get("weg_id") ?? "").trim();
  const jahrRaw = String(formData.get("jahr") ?? "").trim();
  const bezeichnung = String(formData.get("bezeichnung") ?? "").trim();
  const gesamtkostenRaw = String(formData.get("gesamtkosten") ?? "").trim();
  const wirksamAbMonatRaw = String(
    formData.get("wirksam_ab_monat") ?? "",
  ).trim();

  if (!UUID_RE.test(wegId)) {
    return {
      errors: { _form: ["Ungültige WEG-ID. Bitte Seite neu laden."] },
    };
  }

  const errors: WirtschaftsplanFormState["errors"] = {};

  // Validate Jahr
  const jahr = parseInt(jahrRaw, 10);
  if (isNaN(jahr) || jahr < 1900 || jahr > 2100) {
    errors.jahr = ["Bitte ein gültiges Jahr zwischen 1900 und 2100 angeben."];
  }

  // Validate Bezeichnung
  if (bezeichnung.length === 0) {
    errors.bezeichnung = ["Bitte eine Bezeichnung angeben."];
  }

  // Validate Gesamtkosten (must be strictly positive according to E2E tests)
  const gesamtkosten = parseFloat(gesamtkostenRaw);
  if (isNaN(gesamtkosten) || gesamtkosten <= 0) {
    errors.gesamtkosten = ["Die Gesamtkosten müssen größer als 0 sein."];
  }

  const wirksamAbMonat =
    wirksamAbMonatRaw.length > 0 ? parseInt(wirksamAbMonatRaw, 10) : null;
  if (
    wirksamAbMonatRaw.length > 0 &&
    (!Number.isInteger(wirksamAbMonat) ||
      wirksamAbMonat === null ||
      wirksamAbMonat < 1 ||
      wirksamAbMonat > 12)
  ) {
    errors.wirksam_ab_monat = [
      "Der Wirksamkeitsmonat muss zwischen 1 und 12 liegen.",
    ];
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  const supabase = await createClient();

  // 1. Insert Wirtschaftsplan
  const { data: planData, error: planError } = await supabase
    .from("wirtschaftsplan")
    .insert({
      weg_id: wegId,
      jahr,
      bezeichnung,
      gesamtkosten,
      wirksam_ab_monat: wirksamAbMonat,
    })
    .select("id")
    .single();

  if (planError || !planData) {
    console.error("[createWirtschaftsplanAction] insert failed:", planError);
    if (planError?.code === "23505") { // unique constraint violation
      return {
        errors: {
          jahr: ["Für dieses Jahr existiert bereits ein aktiver Wirtschaftsplan."],
        },
      };
    }
    return {
      errors: {
        _form: ["Wirtschaftsplan konnte nicht angelegt werden. Bitte erneut versuchen."],
      },
    };
  }

  revalidatePath(`/wegs/${wegId}/finanzen`);
  redirect(`/wegs/${wegId}/finanzen`);
}
