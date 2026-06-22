"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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
  const name = String(formData.get("name") ?? "").trim();
  const address = readWegAddressFormData(formData);

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
    return { errors };
  }

  const adresse = formatWegAddress(address);

  const supabase = await createClient();
  const { error } = await supabase
    .from("weg")
    .update({ name, adresse })
    .eq("id", id);

  if (error) {
    console.error("[updateWeg] update failed", {
      code: error.code,
      hint: error.hint,
    });
    return {
      errors: {
        _form: ["WEG konnte nicht aktualisiert werden. Bitte erneut versuchen."],
      },
    };
  }

  revalidatePath("/wegs");
  revalidatePath(`/wegs/${id}`);
  redirect(`/wegs/${id}`);
}
