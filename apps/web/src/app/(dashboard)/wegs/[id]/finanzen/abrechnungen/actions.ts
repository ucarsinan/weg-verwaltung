"use server";

import { logPostgrestError, runFormAction } from "@/modules/action-kernel";

export interface AbrechnungFormState {
  errors?: {
    jahr?: string[];
    _form?: string[];
  };
}

export interface BeschlussFormState {
  errors?: {
    beschlossen_am?: string[];
    _form?: string[];
  };
  ok?: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface ErstellenInput {
  wegId: string;
  jahr: number;
}

export async function erstelleAbrechnungAction(
  _prev: AbrechnungFormState,
  formData: FormData,
): Promise<AbrechnungFormState> {
  return runFormAction<ErstellenInput, AbrechnungFormState>(
    {
      scope: "erstelleAbrechnungAction",
      guardError: (message) => ({ errors: { _form: [message] } }),
      parse: (data) => {
        const wegId = String(data.get("weg_id") ?? "").trim();
        const jahrRaw = String(data.get("jahr") ?? "").trim();

        if (!UUID_RE.test(wegId)) {
          return {
            errors: {
              errors: { _form: ["Ungültige WEG-ID. Bitte Seite neu laden."] },
            },
          };
        }

        const jahr = parseInt(jahrRaw, 10);
        if (!Number.isInteger(jahr) || jahr < 1900 || jahr > 2100) {
          return {
            errors: {
              errors: {
                jahr: ["Bitte ein Jahr zwischen 1900 und 2100 angeben."],
              },
            },
          };
        }

        return { input: { wegId, jahr } };
      },
      execute: async ({ supabase }, input) => {
        const { data: abrechnungId, error } = await supabase.rpc(
          "erstelle_abrechnung",
          { p_weg_id: input.wegId, p_jahr: input.jahr },
        );

        if (error || !abrechnungId) {
          logPostgrestError("erstelleAbrechnungAction", error ?? {});

          if (error?.code === "23505") {
            return {
              errors: {
                errors: {
                  jahr: [
                    "Für dieses Jahr existiert bereits ein Abrechnungsentwurf.",
                  ],
                },
              },
            };
          }

          if (error?.code === "0A000") {
            return {
              errors: {
                errors: {
                  _form: [
                    "Eine Ausgabe verwendet einen Verteilungsschlüssel, dessen Typ die Abrechnung nicht auflösen kann.",
                  ],
                },
              },
            };
          }

          if (error?.code === "23514") {
            return {
              errors: {
                errors: {
                  _form: [
                    // Seit 0067 gibt es zwei Ursachen fuer 23514: fehlende
                    // Basiswerte und eine gemischte Regel ohne Teile.
                    "Ein Verteilungsschlüssel ist unvollständig — entweder fehlen einer Einheit Basiswerte zum Stichtag, oder eine gemischte Regel hat keine Teile.",
                  ],
                },
              },
            };
          }

          return {
            errors: {
              errors: { _form: ["Die Abrechnung konnte nicht erstellt werden."] },
            },
          };
        }

        const basePath = `/wegs/${input.wegId}/finanzen/abrechnungen`;

        return {
          revalidate: [basePath],
          redirectTo: `${basePath}/${String(abrechnungId)}`,
        };
      },
    },
    formData,
  );
}

interface BeschlussInput {
  wegId: string;
  abrechnungId: string;
  beschlossenAm: string;
}

export async function beschliesseAbrechnungAction(
  _prev: BeschlussFormState,
  formData: FormData,
): Promise<BeschlussFormState> {
  return runFormAction<BeschlussInput, BeschlussFormState>(
    {
      scope: "beschliesseAbrechnungAction",
      guardError: (message) => ({ errors: { _form: [message] } }),
      parse: (data) => {
        const wegId = String(data.get("weg_id") ?? "").trim();
        const abrechnungId = String(data.get("abrechnung_id") ?? "").trim();
        const beschlossenAm = String(data.get("beschlossen_am") ?? "").trim();

        if (!UUID_RE.test(wegId) || !UUID_RE.test(abrechnungId)) {
          return {
            errors: {
              errors: { _form: ["Ungültige Route. Bitte Seite neu laden."] },
            },
          };
        }

        if (!ISO_DATE_RE.test(beschlossenAm)) {
          return {
            errors: {
              errors: {
                beschlossen_am: [
                  "Bitte das Datum der Beschlussfassung angeben — es bestimmt, wer die Spitze schuldet.",
                ],
              },
            },
          };
        }

        return { input: { wegId, abrechnungId, beschlossenAm } };
      },
      execute: async ({ supabase }, input) => {
        const { error } = await supabase.rpc("beschliesse_abrechnung", {
          p_abrechnung_id: input.abrechnungId,
          p_beschlossen_am: input.beschlossenAm,
        });

        if (error) {
          logPostgrestError("beschliesseAbrechnungAction", error);

          if (error.code === "23514") {
            return {
              errors: {
                errors: {
                  _form: [
                    "Nur ein Entwurf kann beschlossen werden. Für eine Korrektur einen neuen Entwurf anlegen (Zweitbeschluss).",
                  ],
                },
              },
            };
          }

          return {
            errors: {
              errors: { _form: ["Der Beschluss konnte nicht gespeichert werden."] },
            },
          };
        }

        const basePath = `/wegs/${input.wegId}/finanzen/abrechnungen`;

        return {
          revalidate: [basePath, `${basePath}/${input.abrechnungId}`],
          state: { ok: true },
        };
      },
    },
    formData,
  );
}
