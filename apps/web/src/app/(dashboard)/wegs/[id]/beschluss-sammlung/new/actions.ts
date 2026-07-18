"use server";

import { logPostgrestError, runFormAction } from "@/modules/action-kernel";
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

interface BeschlussSammlungInput {
  beschluss_text: string;
  datum: string;
  typ: BeschlussSammlungTyp;
  meeting_id: string | null;
}

export async function createBeschlussSammlungEntry(
  wegId: string,
  _prev: BeschlussSammlungFormState,
  formData: FormData,
): Promise<BeschlussSammlungFormState> {
  return runFormAction<BeschlussSammlungInput, BeschlussSammlungFormState>(
    {
      scope: "createBeschlussSammlungEntry",
      guardError: (message) => ({ errors: { _form: [message] } }),
      parse: (data) => {
        const beschluss_text = String(data.get("beschluss_text") ?? "").trim();
        const datum = String(data.get("datum") ?? "").trim();
        const typ_raw = String(data.get("typ") ?? "").trim();
        const meeting_id = String(data.get("meeting_id") ?? "").trim() || null;
        const resolution_id =
          String(data.get("resolution_id") ?? "").trim() || null;

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
          errors.datum = [
            "Bitte ein gültiges Datum im Format JJJJ-MM-TT angeben.",
          ];
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
          return { errors: { errors } };
        }

        return {
          input: {
            beschluss_text,
            datum,
            typ: typ_raw as BeschlussSammlungTyp,
            meeting_id,
          },
        };
      },
      execute: async ({ supabase, userId }, input) => {
        const { error } = await supabase.from("beschluss_sammlung_entry").insert({
          weg_id: wegId,
          beschluss_text: input.beschluss_text,
          datum: input.datum,
          typ: input.typ,
          erstellt_durch: userId,
          ...(input.meeting_id ? { meeting_id: input.meeting_id } : {}),
        });

        if (error) {
          logPostgrestError("createBeschlussSammlungEntry", error);
          return {
            errors: {
              errors: {
                _form: [
                  "Eintrag konnte nicht gespeichert werden. Bitte erneut versuchen.",
                ],
              },
            },
          };
        }

        return {
          revalidate: [`/wegs/${wegId}/beschluss-sammlung`],
          redirectTo: `/wegs/${wegId}/beschluss-sammlung`,
        };
      },
    },
    formData,
  );
}
