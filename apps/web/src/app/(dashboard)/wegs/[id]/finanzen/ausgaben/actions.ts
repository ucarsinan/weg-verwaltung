"use server";

import { logPostgrestError, runFormAction } from "@/modules/action-kernel";
import type { AusgabenArt, RuecklagenRichtung } from "@/lib/supabase/database.types";

export interface AusgabeFormState {
  errors?: {
    betrag?: string[];
    wert_datum?: string[];
    empfaenger?: string[];
    kostenart?: string[];
    verteilungsschluessel_version_id?: string[];
    _form?: string[];
  };
}

export interface RuecklageFormState {
  errors?: {
    betrag?: string[];
    datum?: string[];
    richtung?: string[];
    _form?: string[];
  };
  ok?: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const AUSGABEN_ARTEN: AusgabenArt[] = ["kosten", "ruecklage_zufuehrung"];
const RICHTUNGEN: RuecklagenRichtung[] = [
  "anfangsbestand",
  "zufuehrung",
  "entnahme",
];

function parseBetrag(raw: string): number {
  return Number(raw.trim().replace(",", "."));
}

interface AusgabeInput {
  wegId: string;
  betrag: number;
  wertDatum: string;
  empfaenger: string;
  kostenart: string;
  art: AusgabenArt;
  versionId: string;
  notiz: string | null;
}

export async function createAusgabeAction(
  _prev: AusgabeFormState,
  formData: FormData,
): Promise<AusgabeFormState> {
  return runFormAction<AusgabeInput, AusgabeFormState>(
    {
      scope: "createAusgabeAction",
      guardError: (message) => ({ errors: { _form: [message] } }),
      parse: (data) => {
        const wegId = String(data.get("weg_id") ?? "").trim();
        const betragRaw = String(data.get("betrag") ?? "").trim();
        const wertDatum = String(data.get("wert_datum") ?? "").trim();
        const empfaenger = String(data.get("empfaenger") ?? "").trim();
        const kostenart = String(data.get("kostenart") ?? "").trim();
        const artRaw = String(data.get("art") ?? "kosten").trim();
        const versionId = String(
          data.get("verteilungsschluessel_version_id") ?? "",
        ).trim();
        const notizRaw = String(data.get("notiz") ?? "").trim();

        if (!UUID_RE.test(wegId)) {
          return {
            errors: {
              errors: { _form: ["Ungültige WEG-ID. Bitte Seite neu laden."] },
            },
          };
        }

        const errors: AusgabeFormState["errors"] = {};

        const betrag = parseBetrag(betragRaw);
        if (betragRaw.length === 0 || !Number.isFinite(betrag) || betrag <= 0) {
          errors.betrag = ["Der Betrag muss größer als 0 sein."];
        }

        if (!ISO_DATE_RE.test(wertDatum)) {
          errors.wert_datum = [
            "Bitte ein gültiges Wertstellungsdatum angeben — es bestimmt das Abrechnungsjahr.",
          ];
        }

        if (empfaenger.length === 0) {
          errors.empfaenger = ["Bitte den Empfänger angeben."];
        }

        if (kostenart.length === 0) {
          errors.kostenart = ["Bitte eine Kostenart angeben."];
        }

        if (!UUID_RE.test(versionId)) {
          errors.verteilungsschluessel_version_id = [
            "Bitte einen Verteilungsschlüssel wählen.",
          ];
        }

        if (!(AUSGABEN_ARTEN as string[]).includes(artRaw)) {
          return {
            errors: {
              errors: { _form: ["Ungültige Ausgabenart. Bitte Seite neu laden."] },
            },
          };
        }

        if (Object.keys(errors).length > 0) {
          return { errors: { errors } };
        }

        return {
          input: {
            wegId,
            betrag,
            wertDatum,
            empfaenger,
            kostenart,
            art: artRaw as AusgabenArt,
            versionId,
            notiz: notizRaw.length > 0 ? notizRaw : null,
          },
        };
      },
      execute: async ({ supabase }, input) => {
        const { error } = await supabase.from("ausgabe").insert({
          weg_id: input.wegId,
          betrag: input.betrag,
          wert_datum: input.wertDatum,
          empfaenger: input.empfaenger,
          kostenart: input.kostenart,
          art: input.art,
          verteilungsschluessel_version_id: input.versionId,
          notiz: input.notiz,
          quelle: "manuell",
        });

        if (error) {
          logPostgrestError("createAusgabeAction", error);

          if (error.code === "23514") {
            return {
              errors: {
                errors: {
                  verteilungsschluessel_version_id: [
                    "Der Verteilungsschlüssel gehört zu einer anderen WEG.",
                  ],
                },
              },
            };
          }

          return {
            errors: {
              errors: { _form: ["Die Ausgabe konnte nicht gespeichert werden."] },
            },
          };
        }

        const path = `/wegs/${input.wegId}/finanzen/ausgaben`;

        return { revalidate: [path], state: {} };
      },
    },
    formData,
  );
}

interface RuecklageInput {
  wegId: string;
  datum: string;
  betrag: number;
  richtung: RuecklagenRichtung;
  notiz: string | null;
}

export async function createRuecklagenBewegungAction(
  _prev: RuecklageFormState,
  formData: FormData,
): Promise<RuecklageFormState> {
  return runFormAction<RuecklageInput, RuecklageFormState>(
    {
      scope: "createRuecklagenBewegungAction",
      guardError: (message) => ({ errors: { _form: [message] } }),
      parse: (data) => {
        const wegId = String(data.get("weg_id") ?? "").trim();
        const datum = String(data.get("datum") ?? "").trim();
        const betragRaw = String(data.get("betrag") ?? "").trim();
        const richtungRaw = String(data.get("richtung") ?? "").trim();
        const notizRaw = String(data.get("notiz") ?? "").trim();

        if (!UUID_RE.test(wegId)) {
          return {
            errors: {
              errors: { _form: ["Ungültige WEG-ID. Bitte Seite neu laden."] },
            },
          };
        }

        const errors: RuecklageFormState["errors"] = {};

        const betrag = parseBetrag(betragRaw);
        if (betragRaw.length === 0 || !Number.isFinite(betrag) || betrag <= 0) {
          errors.betrag = ["Der Betrag muss größer als 0 sein."];
        }

        if (!ISO_DATE_RE.test(datum)) {
          errors.datum = ["Bitte ein gültiges Datum angeben."];
        }

        if (!(RICHTUNGEN as string[]).includes(richtungRaw)) {
          errors.richtung = ["Bitte eine gültige Bewegungsart wählen."];
        }

        if (Object.keys(errors).length > 0) {
          return { errors: { errors } };
        }

        return {
          input: {
            wegId,
            datum,
            betrag,
            richtung: richtungRaw as RuecklagenRichtung,
            notiz: notizRaw.length > 0 ? notizRaw : null,
          },
        };
      },
      execute: async ({ supabase }, input) => {
        const { error } = await supabase.from("ruecklage_bewegung").insert({
          weg_id: input.wegId,
          datum: input.datum,
          betrag: input.betrag,
          richtung: input.richtung,
          notiz: input.notiz,
        });

        if (error) {
          logPostgrestError("createRuecklagenBewegungAction", error);

          if (error.code === "23514") {
            return {
              errors: {
                errors: {
                  betrag: [
                    "Die Entnahme übersteigt den Rücklagenbestand zu diesem Datum. Geld, das erst später zugeführt wurde, zählt nicht.",
                  ],
                },
              },
            };
          }

          if (error.code === "23505") {
            return {
              errors: {
                errors: {
                  richtung: [
                    "Für diese WEG ist bereits ein Anfangsbestand hinterlegt.",
                  ],
                },
              },
            };
          }

          return {
            errors: {
              errors: { _form: ["Die Bewegung konnte nicht gespeichert werden."] },
            },
          };
        }

        return {
          revalidate: [`/wegs/${input.wegId}/finanzen/ruecklage`],
          state: { ok: true },
        };
      },
    },
    formData,
  );
}
