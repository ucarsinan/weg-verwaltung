"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { BeschlussSammlungTyp } from "@/lib/supabase/database.types";

export interface BeschlussSammlungFormState {
  errors?: {
    beschluss_text?: string[];
    datum?: string[];
    typ?: string[];
    _form?: string[];
  };
}

const VALID_TYP: BeschlussSammlungTyp[] = [
  "positiv_beschluss",
  "negativ_beschluss",
  "umlaufbeschluss",
];

const TEXT_MIN = 20;
const TEXT_MAX = 10_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function createBeschlussSammlungEntry(
  wegId: string,
  _prev: BeschlussSammlungFormState,
  formData: FormData,
): Promise<BeschlussSammlungFormState> {
  const beschluss_text = String(formData.get("beschluss_text") ?? "").trim();
  const datum = String(formData.get("datum") ?? "").trim();
  const typ_raw = String(formData.get("typ") ?? "").trim();
  const meeting_id = String(formData.get("meeting_id") ?? "").trim() || null;
  const resolution_id =
    String(formData.get("resolution_id") ?? "").trim() || null;

  const errors: BeschlussSammlungFormState["errors"] = {};

  if (beschluss_text.length < TEXT_MIN) {
    errors.beschluss_text = [
      `Beschlusstext muss mindestens ${TEXT_MIN} Zeichen lang sein.`,
    ];
  } else if (beschluss_text.length > TEXT_MAX) {
    errors.beschluss_text = [
      `Beschlusstext darf höchstens ${TEXT_MAX} Zeichen lang sein.`,
    ];
  }

  if (!datum || !DATE_RE.test(datum) || isNaN(new Date(datum).getTime())) {
    errors.datum = ["Bitte ein gültiges Datum im Format JJJJ-MM-TT angeben."];
  }

  if (!VALID_TYP.includes(typ_raw as BeschlussSammlungTyp)) {
    errors.typ = ["Bitte einen gültigen Beschluss-Typ auswählen."];
  }

  if (resolution_id) {
    errors._form = [
      "Finale Einträge zu Beschlussvorlagen werden ausschließlich über die Abstimmungs-Feststellung erzeugt.",
    ];
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { errors: { _form: ["Nicht authentifiziert."] } };
  }

  const { error } = await supabase.from("beschluss_sammlung_entry").insert({
    weg_id: wegId,
    beschluss_text,
    datum,
    typ: typ_raw as BeschlussSammlungTyp,
    erstellt_durch: user.id,
    ...(meeting_id ? { meeting_id } : {}),
  });

  if (error) {
    console.error("[createBeschlussSammlungEntry] insert failed", {
      code: error.code,
      hint: error.hint,
    });
    return {
      errors: {
        _form: [
          "Eintrag konnte nicht gespeichert werden. Bitte erneut versuchen.",
        ],
      },
    };
  }

  revalidatePath(`/wegs/${wegId}/beschluss-sammlung`);
  redirect(`/wegs/${wegId}/beschluss-sammlung`);
}
