"use server";

import { logPostgrestError, runFormAction } from "@/modules/action-kernel";

export interface PositionFormState {
  errors?: {
    kostenart?: string[];
    jahresbetrag?: string[];
    verteilungsschluessel_version_id?: string[];
    _form?: string[];
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PositionInput {
  wegId: string;
  planId: string;
  kostenart: string;
  beschreibung: string | null;
  jahresbetrag: number;
  versionId: string;
}

export async function createPositionAction(
  _prev: PositionFormState,
  formData: FormData,
): Promise<PositionFormState> {
  return runFormAction<PositionInput, PositionFormState>(
    {
      scope: "createPositionAction",
      guardError: (message) => ({ errors: { _form: [message] } }),
      parse: (data) => {
        const wegId = String(data.get("weg_id") ?? "").trim();
        const planId = String(data.get("plan_id") ?? "").trim();
        const kostenart = String(data.get("kostenart") ?? "").trim();
        const beschreibungRaw = String(data.get("beschreibung") ?? "").trim();
        const jahresbetragRaw = String(data.get("jahresbetrag") ?? "").trim();
        const versionId = String(
          data.get("verteilungsschluessel_version_id") ?? "",
        ).trim();

        if (!UUID_RE.test(wegId) || !UUID_RE.test(planId)) {
          return {
            errors: {
              errors: { _form: ["Ungültige Route. Bitte Seite neu laden."] },
            },
          };
        }

        const errors: PositionFormState["errors"] = {};

        if (kostenart.length === 0) {
          errors.kostenart = ["Bitte eine Kostenart angeben."];
        }

        const jahresbetrag = Number(jahresbetragRaw.replace(",", "."));
        if (
          jahresbetragRaw.length === 0 ||
          !Number.isFinite(jahresbetrag) ||
          jahresbetrag < 0
        ) {
          errors.jahresbetrag = ["Der Jahresbetrag muss 0 oder größer sein."];
        }

        if (!UUID_RE.test(versionId)) {
          errors.verteilungsschluessel_version_id = [
            "Bitte einen Verteilungsschlüssel wählen.",
          ];
        }

        if (Object.keys(errors).length > 0) {
          return { errors: { errors } };
        }

        return {
          input: {
            wegId,
            planId,
            kostenart,
            beschreibung: beschreibungRaw.length > 0 ? beschreibungRaw : null,
            jahresbetrag,
            versionId,
          },
        };
      },
      execute: async ({ supabase }, input) => {
        // Positionsnummer fortlaufend je Plan vergeben. Kein Transaktionsschutz
        // in PostgREST: bei zwei gleichzeitigen Anlagen greift stattdessen der
        // unique(tenant_id, wirtschaftsplan_id, position)-Index (23505).
        const { data: letzte, error: readError } = await supabase
          .from("wirtschaftsplan_position")
          .select("position")
          .eq("wirtschaftsplan_id", input.planId)
          .order("position", { ascending: false })
          .limit(1);

        if (readError) {
          logPostgrestError("createPositionAction", readError);
          return {
            errors: {
              errors: { _form: ["Die Positionen konnten nicht gelesen werden."] },
            },
          };
        }

        const naechstePosition = (letzte?.[0]?.position ?? 0) + 1;

        const { error } = await supabase
          .from("wirtschaftsplan_position")
          .insert({
            wirtschaftsplan_id: input.planId,
            position: naechstePosition,
            kostenart: input.kostenart,
            beschreibung: input.beschreibung,
            jahresbetrag: input.jahresbetrag,
            verteilungsschluessel_version_id: input.versionId,
          });

        if (error) {
          logPostgrestError("createPositionAction", error);

          if (error.code === "23505") {
            return {
              errors: {
                errors: {
                  _form: [
                    "Die Position wurde zwischenzeitlich vergeben. Bitte erneut speichern.",
                  ],
                },
              },
            };
          }

          if (error.code === "23514") {
            return {
              errors: {
                errors: {
                  _form: [
                    "Positionen lassen sich nur ändern, solange der Wirtschaftsplan im Entwurf ist.",
                  ],
                },
              },
            };
          }

          return {
            errors: {
              errors: { _form: ["Die Position konnte nicht angelegt werden."] },
            },
          };
        }

        const path = `/wegs/${input.wegId}/finanzen/${input.planId}/positionen`;

        return {
          revalidate: [path, `/wegs/${input.wegId}/finanzen`],
          state: {},
        };
      },
    },
    formData,
  );
}

interface DeletePositionInput {
  wegId: string;
  planId: string;
  positionId: string;
}

export async function deletePositionAction(
  _prev: PositionFormState,
  formData: FormData,
): Promise<PositionFormState> {
  return runFormAction<DeletePositionInput, PositionFormState>(
    {
      scope: "deletePositionAction",
      guardError: (message) => ({ errors: { _form: [message] } }),
      parse: (data) => {
        const wegId = String(data.get("weg_id") ?? "").trim();
        const planId = String(data.get("plan_id") ?? "").trim();
        const positionId = String(data.get("position_id") ?? "").trim();

        if (
          !UUID_RE.test(wegId) ||
          !UUID_RE.test(planId) ||
          !UUID_RE.test(positionId)
        ) {
          return {
            errors: {
              errors: { _form: ["Ungültige Route. Bitte Seite neu laden."] },
            },
          };
        }

        return { input: { wegId, planId, positionId } };
      },
      execute: async ({ supabase }, input) => {
        const { error } = await supabase
          .from("wirtschaftsplan_position")
          .delete()
          .eq("id", input.positionId)
          .eq("wirtschaftsplan_id", input.planId);

        if (error) {
          logPostgrestError("deletePositionAction", error);

          if (error.code === "23514") {
            return {
              errors: {
                errors: {
                  _form: [
                    "Positionen lassen sich nur ändern, solange der Wirtschaftsplan im Entwurf ist.",
                  ],
                },
              },
            };
          }

          return {
            errors: {
              errors: { _form: ["Die Position konnte nicht gelöscht werden."] },
            },
          };
        }

        const path = `/wegs/${input.wegId}/finanzen/${input.planId}/positionen`;

        return {
          revalidate: [path, `/wegs/${input.wegId}/finanzen`],
          state: {},
        };
      },
    },
    formData,
  );
}
