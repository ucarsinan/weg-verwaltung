"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Server Action for Unit (Wohneinheit) creation.
//
// Section 3 invariants:
//  - tenant_id omitted: column default `auth.tenant_id()` in migration 0003
//    resolves it from the JWT. RLS WITH CHECK rejects cross-tenant writes.
//  - weg_id is taken from the URL segment (passed as hidden field in the form)
//    and validated server-side — we only insert if it looks like a UUID.

export interface UnitFormState {
  errors?: {
    bezeichnung?: string[];
    mea_zaehler?: string[];
    mea_nenner?: string[];
    _form?: string[];
  };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createUnit(
  _prev: UnitFormState,
  formData: FormData,
): Promise<UnitFormState> {
  const wegId = String(formData.get("weg_id") ?? "").trim();
  const bezeichnung = String(formData.get("bezeichnung") ?? "").trim();
  const zaehlerRaw = String(formData.get("mea_zaehler") ?? "").trim();
  const nennerRaw = String(formData.get("mea_nenner") ?? "").trim();

  // Guard: weg_id must be a valid UUID (it comes from a hidden form field,
  // but we must not trust it).
  if (!UUID_RE.test(wegId)) {
    return { errors: { _form: ["Ungültige WEG-ID. Bitte Seite neu laden."] } };
  }

  const errors: UnitFormState["errors"] = {};

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
  const { error } = await supabase.from("unit").insert({
    weg_id: wegId,
    bezeichnung,
    mea_zaehler: zaehler,
    mea_nenner: nenner,
  });

  if (error) {
    console.error("[createUnit] insert failed", {
      code: error.code,
      hint: error.hint,
    });
    return {
      errors: {
        _form: [
          "Wohneinheit konnte nicht angelegt werden. Bitte erneut versuchen.",
        ],
      },
    };
  }

  revalidatePath(`/wegs/${wegId}`);
  redirect(`/wegs/${wegId}`);
}
