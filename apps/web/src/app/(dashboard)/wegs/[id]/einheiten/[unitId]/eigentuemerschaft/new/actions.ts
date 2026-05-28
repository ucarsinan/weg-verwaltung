"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Server Action: create a new Person + Ownership in a single flow.
//
// Two-step insert (person first, ownership second). If the person insert
// succeeds but the ownership insert fails, the person row is orphaned — an
// acceptable trade-off for now (no cross-table transaction via PostgREST
// without an RPC). The orphaned person can be reused or cleaned up later.
//
// Section 3 invariants:
//  - tenant_id omitted from both inserts: resolved from JWT by column default.
//  - weg_id + unit_id come from hidden form fields; both validated as UUID.
//  - Person data is trimmed server-side; never trust client whitespace.

export interface EigentuemerFormState {
  errors?: {
    vorname?: string[];
    nachname?: string[];
    email?: string[];
    telefon?: string[];
    von?: string[];
    _form?: string[];
  };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ISO date format YYYY-MM-DD (what <input type="date"> submits).
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function createEigentuemer(
  _prev: EigentuemerFormState,
  formData: FormData,
): Promise<EigentuemerFormState> {
  const wegId = String(formData.get("weg_id") ?? "").trim();
  const unitId = String(formData.get("unit_id") ?? "").trim();

  if (!UUID_RE.test(wegId) || !UUID_RE.test(unitId)) {
    return {
      errors: { _form: ["Ungültige IDs. Bitte Seite neu laden."] },
    };
  }

  const vorname = String(formData.get("vorname") ?? "").trim();
  const nachname = String(formData.get("nachname") ?? "").trim();
  const emailRaw = String(formData.get("email") ?? "").trim();
  const telefonRaw = String(formData.get("telefon") ?? "").trim();
  const vonRaw = String(formData.get("von") ?? "").trim();

  const errors: EigentuemerFormState["errors"] = {};

  if (vorname.length < 1) {
    errors.vorname = ["Vorname darf nicht leer sein."];
  } else if (vorname.length > 100) {
    errors.vorname = ["Vorname darf höchstens 100 Zeichen lang sein."];
  }

  if (nachname.length < 1) {
    errors.nachname = ["Nachname darf nicht leer sein."];
  } else if (nachname.length > 100) {
    errors.nachname = ["Nachname darf höchstens 100 Zeichen lang sein."];
  }

  if (!vonRaw || !DATE_RE.test(vonRaw)) {
    errors.von = ["Bitte ein gültiges Einzugsdatum angeben (JJJJ-MM-TT)."];
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  const supabase = await createClient();

  // Step 1: Insert person.
  const { data: personData, error: personError } = await supabase
    .from("person")
    .insert({
      vorname,
      nachname,
      email: emailRaw === "" ? null : emailRaw,
      telefon: telefonRaw === "" ? null : telefonRaw,
    })
    .select("id")
    .single();

  if (personError || !personData) {
    console.error("[createEigentuemer] person insert failed", {
      code: personError?.code,
      hint: personError?.hint,
    });
    return {
      errors: {
        _form: ["Person konnte nicht angelegt werden. Bitte erneut versuchen."],
      },
    };
  }

  // Step 2: Insert ownership.
  const { error: ownershipError } = await supabase.from("ownership").insert({
    weg_id: wegId,
    unit_id: unitId,
    person_id: personData.id,
    von: vonRaw,
  });

  if (ownershipError) {
    console.error("[createEigentuemer] ownership insert failed", {
      code: ownershipError.code,
      hint: ownershipError.hint,
    });
    return {
      errors: {
        _form: [
          "Eigentümerschaft konnte nicht angelegt werden. Die Person wurde gespeichert — bitte erneut versuchen.",
        ],
      },
    };
  }

  revalidatePath(`/wegs/${wegId}/einheiten/${unitId}/eigentuemerschaft`);
  redirect(`/wegs/${wegId}/einheiten/${unitId}/eigentuemerschaft`);
}
