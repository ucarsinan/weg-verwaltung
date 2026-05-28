"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Server Action — same shape as login/actions.ts: errors are returned in
// state, redirects fire via next/navigation.redirect() on success.
//
// Section 3 invariants that govern this path:
//  - Mandanten-Iso via RLS (invariant 1): we never pass tenant_id from the
//    client. Migration 0003 defaults the column to auth.tenant_id() (derived
//    from the JWT app_metadata) and the WITH CHECK policy in 0008 rejects
//    any insert that would resolve to a foreign tenant.
//  - All user-visible strings are German. PostgREST errors are logged
//    server-side only; the client receives a generic message.

export interface WegFormState {
  errors?: {
    name?: string[];
    adresse?: string[];
    _form?: string[];
  };
}

const NAME_MIN = 3;
const NAME_MAX = 200;
const ADRESSE_MAX = 500;

export async function createWeg(
  _prev: WegFormState,
  formData: FormData,
): Promise<WegFormState> {
  // 1. Pull + trim — never trust client whitespace.
  const name = String(formData.get("name") ?? "").trim();
  const adresseRaw = String(formData.get("adresse") ?? "").trim();

  // 2. Validate server-side. Browser-native validation is disabled on the
  //    form (noValidate) so this is the single source of truth.
  const errors: WegFormState["errors"] = {};

  if (name.length < NAME_MIN) {
    errors.name = [`Name muss mindestens ${NAME_MIN} Zeichen lang sein.`];
  } else if (name.length > NAME_MAX) {
    errors.name = [`Name darf höchstens ${NAME_MAX} Zeichen lang sein.`];
  }

  if (adresseRaw.length > ADRESSE_MAX) {
    errors.adresse = [
      `Adresse darf höchstens ${ADRESSE_MAX} Zeichen lang sein.`,
    ];
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  // 3. Insert. tenant_id is intentionally omitted — the column default
  //    `auth.tenant_id()` (migration 0003) resolves it from the JWT, and the
  //    RLS WITH CHECK policy (migration 0008) rejects any cross-tenant
  //    write. This is the Section-3 invariant 1 in action: tenant isolation
  //    is enforced by Postgres, not by application code.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("weg")
    .insert({ name, adresse: adresseRaw === "" ? null : adresseRaw })
    .select("id")
    .single();

  if (error) {
    // Log server-side with structured fields; never leak PostgREST error
    // text to the client (could disclose schema details or constraint names).
    console.error("[createWeg] insert failed", {
      code: error.code,
      hint: error.hint,
    });
    return {
      errors: {
        _form: ["WEG konnte nicht angelegt werden. Bitte erneut versuchen."],
      },
    };
  }

  // 4. Invalidate the list cache so /wegs reflects the new row, then redirect.
  //    The detail route may not exist yet — that's a separate scope and a
  //    404 is acceptable for now.
  revalidatePath("/wegs");
  redirect(`/wegs/${data.id}`);
}
