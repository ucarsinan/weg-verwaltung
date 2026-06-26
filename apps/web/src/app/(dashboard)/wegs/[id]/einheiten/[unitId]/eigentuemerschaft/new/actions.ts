"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Server Action: create a new Person + Ownership in a single flow.
// Now handles multiple co-owners using public.ownership_co_owner join table.

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

  const existingPersonIds = formData.getAll("existing_person_ids").map(String);
  const vorname = String(formData.get("vorname") ?? "").trim();
  const nachname = String(formData.get("nachname") ?? "").trim();
  const emailRaw = String(formData.get("email") ?? "").trim();
  const telefonRaw = String(formData.get("telefon") ?? "").trim();
  const vonRaw = String(formData.get("von") ?? "").trim();

  const errors: EigentuemerFormState["errors"] = {};

  // Validate von
  if (!vonRaw || !DATE_RE.test(vonRaw)) {
    errors.von = ["Bitte ein gültiges Einzugsdatum angeben (JJJJ-MM-TT)."];
  }

  // Validate inline person fields if either is filled
  const hasInlinePerson = vorname.length > 0 || nachname.length > 0;
  if (hasInlinePerson) {
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
  }

  // If neither inline person nor existing person is selected:
  if (!hasInlinePerson && existingPersonIds.length === 0) {
    errors._form = [
      "Bitte entweder eine neue Person anlegen oder mindestens eine existierende Person auswählen.",
    ];
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  const supabase = await createClient();

  let newPersonId: string | null = null;

  // Step 1: Insert new person if provided
  if (hasInlinePerson) {
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
          _form: [
            "Person konnte nicht angelegt werden. Bitte erneut versuchen.",
          ],
        },
      };
    }
    newPersonId = personData.id;
  }

  // Step 2: Compile all owner IDs and remove duplicates
  const rawOwnerIds = [...(newPersonId ? [newPersonId] : []), ...existingPersonIds];
  const ownerIds = Array.from(new Set(rawOwnerIds));

  if (ownerIds.length === 0) {
    return {
      errors: {
        _form: [
          "Bitte mindestens einen Eigentümer auswählen oder anlegen.",
        ],
      },
    };
  }

  // Step 3: Insert the primary ownership record
  const { data: ownershipData, error: ownershipError } = await supabase
    .from("ownership")
    .insert({
      weg_id: wegId,
      unit_id: unitId,
      person_id: ownerIds[0],
      von: vonRaw,
    })
    .select("id")
    .single();

  if (ownershipError || !ownershipData) {
    console.error("[createEigentuemer] ownership insert failed", {
      code: ownershipError?.code,
      hint: ownershipError?.hint,
    });
    return {
      errors: {
        _form: [
          "Eigentümerschaft konnte nicht angelegt werden. Bitte erneut versuchen.",
        ],
      },
    };
  }

  // Step 4: Insert additional co-owners into public.ownership_co_owner
  const coOwnersToInsert = ownerIds.slice(1).map((personId) => ({
    ownership_id: ownershipData.id,
    person_id: personId,
  }));

  if (coOwnersToInsert.length > 0) {
    const { error: coOwnerError } = await supabase
      .from("ownership_co_owner")
      .insert(coOwnersToInsert);

    if (coOwnerError) {
      console.error("[createEigentuemer] co-owner insert failed", {
        code: coOwnerError.code,
        hint: coOwnerError.hint,
      });
      return {
        errors: {
          _form: [
            "Miteigentümer konnten nicht verknüpft werden. Bitte erneut versuchen.",
          ],
        },
      };
    }
  }

  revalidatePath(`/wegs/${wegId}/einheiten/${unitId}/eigentuemerschaft`);
  redirect(`/wegs/${wegId}/einheiten/${unitId}/eigentuemerschaft`);
}
