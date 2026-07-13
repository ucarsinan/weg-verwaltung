"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type {
  VerteilungsschluesselQuelle,
  VerteilungsschluesselTyp,
} from "@/lib/supabase/database.types";

export interface VerteilungsschluesselFormState {
  errors?: {
    name?: string[];
    typ?: string[];
    quelle?: string[];
    gueltig_ab?: string[];
    _form?: string[];
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYP_VALUES: VerteilungsschluesselTyp[] = [
  "mea",
  "einheit",
  "flaeche",
  "verbrauch",
  "manuell",
  "gemischt",
];
const QUELLE_VALUES: VerteilungsschluesselQuelle[] = [
  "gesetz",
  "teilungserklaerung",
  "gemeinschaftsordnung",
  "beschluss",
  "manuell",
];

function isTyp(value: string): value is VerteilungsschluesselTyp {
  return (TYP_VALUES as string[]).includes(value);
}

function isQuelle(value: string): value is VerteilungsschluesselQuelle {
  return (QUELLE_VALUES as string[]).includes(value);
}

export async function createVerteilungsschluesselAction(
  _prev: VerteilungsschluesselFormState,
  formData: FormData,
): Promise<VerteilungsschluesselFormState> {
  const wegId = String(formData.get("weg_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const typRaw = String(formData.get("typ") ?? "").trim();
  const quelleRaw = String(formData.get("quelle") ?? "").trim();
  const gueltigAb = String(formData.get("gueltig_ab") ?? "").trim();

  if (!UUID_RE.test(wegId)) {
    return { errors: { _form: ["Ungültige WEG-ID. Bitte Seite neu laden."] } };
  }

  const errors: VerteilungsschluesselFormState["errors"] = {};

  if (name.length === 0 || name.length > 200) {
    errors.name = ["Bitte einen Namen zwischen 1 und 200 Zeichen angeben."];
  }
  if (!isTyp(typRaw)) {
    errors.typ = ["Bitte einen gültigen Typ auswählen."];
  }
  if (!isQuelle(quelleRaw)) {
    errors.quelle = ["Bitte eine gültige Quelle auswählen."];
  }
  if (!gueltigAb || Number.isNaN(Date.parse(gueltigAb))) {
    errors.gueltig_ab = ["Bitte ein gültiges Datum angeben."];
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  const typ = typRaw as VerteilungsschluesselTyp;
  const quelle = quelleRaw as VerteilungsschluesselQuelle;

  const supabase = await createClient();

  const { data: key, error: keyError } = await supabase
    .from("verteilungsschluessel")
    .insert({ weg_id: wegId, name })
    .select("id")
    .single();

  if (keyError || !key) {
    console.error("[createVerteilungsschluesselAction] key insert failed:", keyError);
    if (keyError?.code === "23505") {
      return {
        errors: { name: ["Ein Verteilungsschlüssel mit diesem Namen existiert bereits."] },
      };
    }
    return {
      errors: { _form: ["Verteilungsschlüssel konnte nicht angelegt werden."] },
    };
  }

  const { error: versionError } = await supabase
    .from("verteilungsschluessel_version")
    .insert({
      verteilungsschluessel_id: key.id,
      typ,
      quelle,
      gueltig_ab: gueltigAb,
    });

  if (versionError) {
    console.error(
      "[createVerteilungsschluesselAction] version insert failed:",
      versionError,
    );
    // Compensate: a key without any version is not usable.
    await supabase.from("verteilungsschluessel").delete().eq("id", key.id);
    return {
      errors: { _form: ["Verteilungsschlüssel-Version konnte nicht angelegt werden."] },
    };
  }

  revalidatePath(`/wegs/${wegId}/finanzen/verteilungsschluessel`);
  redirect(`/wegs/${wegId}/finanzen/verteilungsschluessel/${key.id}`);
}
