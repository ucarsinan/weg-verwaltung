"use server";

import { logPostgrestError, runFormAction } from "@/modules/action-kernel";
import {
  formatWegAddress,
  readWegAddressFormData,
  validateWegAddress,
  type WegAddressErrors,
} from "../../address";

export interface WegEditFormState {
  errors?: {
    name?: string[];
    adresse?: string[];
    address?: WegAddressErrors;
    _form?: string[];
  };
}

const NAME_MIN = 3;
const NAME_MAX = 200;

export async function updateWeg(
  id: string,
  _prev: WegEditFormState,
  formData: FormData,
): Promise<WegEditFormState> {
  return runFormAction<{ name: string; adresse: string | null }, WegEditFormState>(
    {
      scope: "updateWeg",
      guardError: (message) => ({ errors: { _form: [message] } }),
      parse: (data) => {
        const name = String(data.get("name") ?? "").trim();
        const address = readWegAddressFormData(data);

        const errors: WegEditFormState["errors"] = {};

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
        const { error } = await supabase
          .from("weg")
          .update({ name, adresse })
          .eq("id", id);

        if (error) {
          logPostgrestError("updateWeg", error);
          return {
            errors: {
              errors: {
                _form: [
                  "WEG konnte nicht aktualisiert werden. Bitte erneut versuchen.",
                ],
              },
            },
          };
        }

        return {
          revalidate: ["/wegs", `/wegs/${id}`],
          redirectTo: `/wegs/${id}`,
        };
      },
    },
    formData,
  );
}
