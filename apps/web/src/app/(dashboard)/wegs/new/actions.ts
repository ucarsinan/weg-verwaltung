"use server";

import { logPostgrestError, runFormAction } from "@/modules/action-kernel";
import {
  formatWegAddress,
  readWegAddressFormData,
  validateWegAddress,
  type WegAddressErrors,
} from "../address";

// Server Action über den action-kernel: parse → Tenant-Guard → insert →
// revalidate/redirect. Errors are returned in state, redirects fire via
// next/navigation.redirect() on success.
//
// Section 3 invariants that govern this path:
//  - Mandanten-Iso via RLS (invariant 1): we never pass tenant_id from the
//    client. Migration 0003 defaults the column to auth.tenant_id() (derived
//    from the JWT app_metadata) and the WITH CHECK policy in 0008 rejects
//    any insert that would resolve to a foreign tenant. Der Kernel-Guard
//    prüft den Tenant-Kontext zusätzlich VOR dem Insert (Defense-in-Depth).
//  - All user-visible strings are German. PostgREST errors are logged
//    server-side only; the client receives a generic message.

export interface WegFormState {
  errors?: {
    name?: string[];
    adresse?: string[];
    address?: WegAddressErrors;
    _form?: string[];
  };
}

const NAME_MIN = 3;
const NAME_MAX = 200;

export async function createWeg(
  _prev: WegFormState,
  formData: FormData,
): Promise<WegFormState> {
  return runFormAction<{ name: string; adresse: string | null }, WegFormState>(
    {
      scope: "createWeg",
      guardError: (message) => ({ errors: { _form: [message] } }),
      parse: (data) => {
        // Pull + trim — never trust client whitespace. Browser-native
        // validation is disabled on the form (noValidate) so this is the
        // single source of truth.
        const name = String(data.get("name") ?? "").trim();
        const address = readWegAddressFormData(data);

        const errors: WegFormState["errors"] = {};

        if (name.length < NAME_MIN) {
          errors.name = [`Name muss mindestens ${NAME_MIN} Zeichen lang sein.`];
        } else if (name.length > NAME_MAX) {
          errors.name = [`Name darf höchstens ${NAME_MAX} Zeichen lang sein.`];
        }

        const addressErrors = validateWegAddress(address);
        if (Object.keys(addressErrors).length > 0) {
          errors.address = addressErrors;
        }

        if (Object.keys(errors).length > 0) {
          return { errors: { errors } };
        }

        return { input: { name, adresse: formatWegAddress(address) } };
      },
      execute: async ({ supabase }, { name, adresse }) => {
        // tenant_id is intentionally omitted — the column default
        // `auth.tenant_id()` (migration 0003) resolves it from the JWT, and
        // the RLS WITH CHECK policy (migration 0008) rejects any cross-tenant
        // write.
        const { data, error } = await supabase
          .from("weg")
          .insert({ name, adresse })
          .select("id")
          .single();

        if (error) {
          logPostgrestError("createWeg", error);
          return {
            errors: {
              errors: {
                _form: [
                  "WEG konnte nicht angelegt werden. Bitte erneut versuchen.",
                ],
              },
            },
          };
        }

        // The detail route may not exist yet — that's a separate scope and a
        // 404 is acceptable for now.
        return { revalidate: ["/wegs"], redirectTo: `/wegs/${data.id}` };
      },
    },
    formData,
  );
}
