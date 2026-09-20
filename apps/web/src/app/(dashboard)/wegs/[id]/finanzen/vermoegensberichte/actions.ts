"use server";

import { logPostgrestError, runFormAction } from "@/modules/action-kernel";
import type { VermoegensberichtAbschnitt } from "@/lib/supabase/database.types";

export interface VermoegensberichtFormState {
  errors?: {
    jahr?: string[];
    _form?: string[];
  };
}

export interface PositionFormState {
  errors?: {
    abschnitt?: string[];
    bezeichnung?: string[];
    betrag?: string[];
    betrag_anfang?: string[];
    _form?: string[];
  };
  ok?: boolean;
}

export interface FertigstellenFormState {
  errors?: {
    erstellt_am?: string[];
    _form?: string[];
  };
  ok?: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const ABSCHNITTE: VermoegensberichtAbschnitt[] = [
  "konto",
  "ruecklage",
  "forderung",
  "verbindlichkeit",
  "sachwert",
];

/** Abschnitte, in denen ein Anfangsbestand ueberhaupt einen Sinn ergibt. */
const BESTANDS_ABSCHNITTE: VermoegensberichtAbschnitt[] = ["konto", "ruecklage"];

/**
 * Leeres Feld heisst „kein Betrag", nicht „null Euro".
 *
 * `Number("")` ist 0 und besteht jede `isFinite`-Pruefung — in 0060 hat genau
 * das eine fehlende Eingabe in eine stille Null verwandelt. Hier waere der
 * Schaden groesser: ein unbewerteter Sachwert wuerde als 0,00 in die Summe
 * eingehen.
 */
function parseOptionalerBetrag(
  raw: string,
): { ok: true; wert: number | null } | { ok: false } {
  const getrimmt = raw.trim();
  if (getrimmt === "") {
    return { ok: true, wert: null };
  }

  const wert = Number(getrimmt.replace(",", "."));
  if (!Number.isFinite(wert)) {
    return { ok: false };
  }

  return { ok: true, wert };
}

interface ErstellenInput {
  wegId: string;
  jahr: number;
}

export async function erstelleVermoegensberichtAction(
  _prev: VermoegensberichtFormState,
  formData: FormData,
): Promise<VermoegensberichtFormState> {
  return runFormAction<ErstellenInput, VermoegensberichtFormState>(
    {
      scope: "erstelleVermoegensberichtAction",
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
        const { data: berichtId, error } = await supabase.rpc(
          "erstelle_vermoegensbericht",
          { p_weg_id: input.wegId, p_jahr: input.jahr },
        );

        if (error || !berichtId) {
          logPostgrestError("erstelleVermoegensberichtAction", error ?? {});

          if (error?.code === "23505") {
            return {
              errors: {
                errors: {
                  jahr: [
                    "Für dieses Jahr existiert bereits ein Berichtsentwurf.",
                  ],
                },
              },
            };
          }

          return {
            errors: {
              errors: {
                _form: ["Der Vermögensbericht konnte nicht erstellt werden."],
              },
            },
          };
        }

        const basePath = `/wegs/${input.wegId}/finanzen/vermoegensberichte`;

        return {
          revalidate: [basePath],
          redirectTo: `${basePath}/${String(berichtId)}`,
        };
      },
    },
    formData,
  );
}

interface PositionInput {
  wegId: string;
  berichtId: string;
  abschnitt: VermoegensberichtAbschnitt;
  bezeichnung: string;
  betrag: number | null;
  betragAnfang: number | null;
}

export async function createPositionAction(
  _prev: PositionFormState,
  formData: FormData,
): Promise<PositionFormState> {
  return runFormAction<PositionInput, PositionFormState>(
    {
      scope: "createVermoegensberichtPositionAction",
      guardError: (message) => ({ errors: { _form: [message] } }),
      parse: (data) => {
        const wegId = String(data.get("weg_id") ?? "").trim();
        const berichtId = String(data.get("bericht_id") ?? "").trim();
        const abschnittRaw = String(data.get("abschnitt") ?? "").trim();
        const bezeichnung = String(data.get("bezeichnung") ?? "").trim();

        if (!UUID_RE.test(wegId) || !UUID_RE.test(berichtId)) {
          return {
            errors: {
              errors: { _form: ["Ungültige Route. Bitte Seite neu laden."] },
            },
          };
        }

        if (!ABSCHNITTE.includes(abschnittRaw as VermoegensberichtAbschnitt)) {
          return {
            errors: {
              errors: { abschnitt: ["Bitte einen Abschnitt wählen."] },
            },
          };
        }
        const abschnitt = abschnittRaw as VermoegensberichtAbschnitt;

        if (bezeichnung === "") {
          return {
            errors: {
              errors: { bezeichnung: ["Bitte eine Bezeichnung angeben."] },
            },
          };
        }

        const betrag = parseOptionalerBetrag(String(data.get("betrag") ?? ""));
        if (!betrag.ok) {
          return {
            errors: {
              errors: { betrag: ["Bitte einen gültigen Betrag angeben."] },
            },
          };
        }

        // Nur ein Sachwert darf ohne Zahl stehen — er wird genannt, nicht
        // bewertet. Dieselbe Regel steht als Check in Migration 0065; hier
        // dient sie der verständlichen Fehlermeldung.
        if (betrag.wert === null && abschnitt !== "sachwert") {
          return {
            errors: {
              errors: {
                betrag: [
                  "Nur ein sonstiger Vermögensgegenstand darf ohne Betrag stehen.",
                ],
              },
            },
          };
        }

        const betragAnfang = parseOptionalerBetrag(
          String(data.get("betrag_anfang") ?? ""),
        );
        if (!betragAnfang.ok) {
          return {
            errors: {
              errors: {
                betrag_anfang: ["Bitte einen gültigen Anfangsbestand angeben."],
              },
            },
          };
        }

        if (
          betragAnfang.wert !== null &&
          !BESTANDS_ABSCHNITTE.includes(abschnitt)
        ) {
          return {
            errors: {
              errors: {
                betrag_anfang: [
                  "Ein Anfangsbestand ergibt nur für Konten und Rücklagen einen Sinn.",
                ],
              },
            },
          };
        }

        return {
          input: {
            wegId,
            berichtId,
            abschnitt,
            bezeichnung,
            betrag: betrag.wert,
            betragAnfang: betragAnfang.wert,
          },
        };
      },
      execute: async ({ supabase }, input) => {
        const { error } = await supabase
          .from("vermoegensbericht_position")
          .insert({
            vermoegensbericht_id: input.berichtId,
            abschnitt: input.abschnitt,
            bezeichnung: input.bezeichnung,
            betrag: input.betrag,
            betrag_anfang: input.betragAnfang,
            quelle: "manuell",
          });

        if (error) {
          logPostgrestError("createVermoegensberichtPositionAction", error);

          if (error.code === "23514") {
            return {
              errors: {
                errors: {
                  _form: [
                    "Der fertiggestellte Bericht nimmt keine Position mehr an. Für eine Korrektur einen neuen Bericht anlegen.",
                  ],
                },
              },
            };
          }

          return {
            errors: {
              errors: {
                _form: ["Die Position konnte nicht gespeichert werden."],
              },
            },
          };
        }

        const path = `/wegs/${input.wegId}/finanzen/vermoegensberichte/${input.berichtId}`;

        return { revalidate: [path], state: { ok: true } };
      },
    },
    formData,
  );
}

interface DeletePositionInput {
  wegId: string;
  berichtId: string;
  positionId: string;
}

export async function deletePositionAction(
  _prev: PositionFormState,
  formData: FormData,
): Promise<PositionFormState> {
  return runFormAction<DeletePositionInput, PositionFormState>(
    {
      scope: "deleteVermoegensberichtPositionAction",
      guardError: (message) => ({ errors: { _form: [message] } }),
      parse: (data) => {
        const wegId = String(data.get("weg_id") ?? "").trim();
        const berichtId = String(data.get("bericht_id") ?? "").trim();
        const positionId = String(data.get("position_id") ?? "").trim();

        if (
          !UUID_RE.test(wegId) ||
          !UUID_RE.test(berichtId) ||
          !UUID_RE.test(positionId)
        ) {
          return {
            errors: {
              errors: { _form: ["Ungültige Route. Bitte Seite neu laden."] },
            },
          };
        }

        return { input: { wegId, berichtId, positionId } };
      },
      execute: async ({ supabase }, input) => {
        // Nur selbst erfasste Positionen. Eine abgeleitete Zeile gehoert zum
        // Snapshot; wer sie von Hand entfernt, faelscht den Bericht still.
        const { error } = await supabase
          .from("vermoegensbericht_position")
          .delete()
          .eq("id", input.positionId)
          .eq("quelle", "manuell");

        if (error) {
          logPostgrestError("deleteVermoegensberichtPositionAction", error);

          if (error.code === "23514") {
            return {
              errors: {
                errors: {
                  _form: [
                    "Ein fertiggestellter Bericht kann nicht mehr geändert werden.",
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

        const path = `/wegs/${input.wegId}/finanzen/vermoegensberichte/${input.berichtId}`;

        return { revalidate: [path], state: { ok: true } };
      },
    },
    formData,
  );
}

interface FertigstellenInput {
  wegId: string;
  berichtId: string;
  erstelltAm: string;
}

export async function stelleFertigAction(
  _prev: FertigstellenFormState,
  formData: FormData,
): Promise<FertigstellenFormState> {
  return runFormAction<FertigstellenInput, FertigstellenFormState>(
    {
      scope: "stelleVermoegensberichtFertigAction",
      guardError: (message) => ({ errors: { _form: [message] } }),
      parse: (data) => {
        const wegId = String(data.get("weg_id") ?? "").trim();
        const berichtId = String(data.get("bericht_id") ?? "").trim();
        const erstelltAm = String(data.get("erstellt_am") ?? "").trim();

        if (!UUID_RE.test(wegId) || !UUID_RE.test(berichtId)) {
          return {
            errors: {
              errors: { _form: ["Ungültige Route. Bitte Seite neu laden."] },
            },
          };
        }

        if (!ISO_DATE_RE.test(erstelltAm)) {
          return {
            errors: {
              errors: {
                erstellt_am: [
                  "Bitte das Datum angeben, an dem der Bericht den Eigentümern zur Verfügung gestellt wird.",
                ],
              },
            },
          };
        }

        return { input: { wegId, berichtId, erstelltAm } };
      },
      execute: async ({ supabase }, input) => {
        const { error } = await supabase.rpc(
          "stelle_vermoegensbericht_fertig",
          {
            p_vermoegensbericht_id: input.berichtId,
            p_erstellt_am: input.erstelltAm,
          },
        );

        if (error) {
          logPostgrestError("stelleVermoegensberichtFertigAction", error);

          if (error.code === "23514") {
            return {
              errors: {
                errors: {
                  _form: [
                    "Nur ein Entwurf kann fertiggestellt werden. Für eine Berichtigung einen neuen Bericht anlegen.",
                  ],
                },
              },
            };
          }

          return {
            errors: {
              errors: {
                _form: ["Der Bericht konnte nicht fertiggestellt werden."],
              },
            },
          };
        }

        const basePath = `/wegs/${input.wegId}/finanzen/vermoegensberichte`;

        return {
          revalidate: [basePath, `${basePath}/${input.berichtId}`],
          state: { ok: true },
        };
      },
    },
    formData,
  );
}
