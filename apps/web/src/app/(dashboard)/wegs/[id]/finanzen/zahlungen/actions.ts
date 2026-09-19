"use server";

import { logPostgrestError, runFormAction } from "@/modules/action-kernel";

export interface ZahlungFormState {
  errors?: {
    betrag?: string[];
    wert_datum?: string[];
    zahler_referenz?: string[];
    _form?: string[];
  };
}

export interface ZuordnungFormState {
  errors?: {
    betraege?: string[];
    _form?: string[];
  };
  ok?: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Akzeptiert Komma wie Punkt als Dezimaltrenner. */
function parseBetrag(raw: string): number {
  return Number(raw.trim().replace(",", "."));
}

interface ZahlungInput {
  wegId: string;
  betrag: number;
  wertDatum: string;
  zahlerReferenz: string;
  notiz: string | null;
}

export async function createZahlungAction(
  _prev: ZahlungFormState,
  formData: FormData,
): Promise<ZahlungFormState> {
  return runFormAction<ZahlungInput, ZahlungFormState>(
    {
      scope: "createZahlungAction",
      guardError: (message) => ({ errors: { _form: [message] } }),
      parse: (data) => {
        const wegId = String(data.get("weg_id") ?? "").trim();
        const betragRaw = String(data.get("betrag") ?? "").trim();
        const wertDatum = String(data.get("wert_datum") ?? "").trim();
        const zahlerReferenz = String(data.get("zahler_referenz") ?? "").trim();
        const notizRaw = String(data.get("notiz") ?? "").trim();

        if (!UUID_RE.test(wegId)) {
          return {
            errors: {
              errors: { _form: ["Ungültige WEG-ID. Bitte Seite neu laden."] },
            },
          };
        }

        const errors: ZahlungFormState["errors"] = {};

        const betrag = parseBetrag(betragRaw);
        if (betragRaw.length === 0 || !Number.isFinite(betrag) || betrag <= 0) {
          errors.betrag = ["Der Betrag muss größer als 0 sein."];
        }

        if (!ISO_DATE_RE.test(wertDatum)) {
          errors.wert_datum = ["Bitte ein gültiges Wertstellungsdatum angeben."];
        }

        if (zahlerReferenz.length === 0) {
          errors.zahler_referenz = [
            "Bitte Einzahler oder Verwendungszweck angeben — daran wird die Zahlung später wiedererkannt.",
          ];
        }

        if (Object.keys(errors).length > 0) {
          return { errors: { errors } };
        }

        return {
          input: {
            wegId,
            betrag,
            wertDatum,
            zahlerReferenz,
            notiz: notizRaw.length > 0 ? notizRaw : null,
          },
        };
      },
      execute: async ({ supabase }, input) => {
        const { data: zahlung, error } = await supabase
          .from("zahlung")
          .insert({
            weg_id: input.wegId,
            betrag: input.betrag,
            wert_datum: input.wertDatum,
            zahler_referenz: input.zahlerReferenz,
            notiz: input.notiz,
            quelle: "manuell",
          })
          .select("id")
          .single();

        if (error || !zahlung) {
          logPostgrestError("createZahlungAction", error ?? {});
          return {
            errors: {
              errors: { _form: ["Die Zahlung konnte nicht gespeichert werden."] },
            },
          };
        }

        const basePath = `/wegs/${input.wegId}/finanzen/zahlungen`;

        return {
          revalidate: [basePath, `/wegs/${input.wegId}/finanzen/offene-posten`],
          // Direkt zur Zuordnung: eine erfasste, aber nicht zugeordnete Zahlung
          // senkt keinen offenen Posten und ist damit halbe Arbeit.
          redirectTo: `${basePath}/${zahlung.id}`,
        };
      },
    },
    formData,
  );
}

interface DeleteZahlungInput {
  wegId: string;
  zahlungId: string;
}

export async function deleteZahlungAction(
  _prev: ZahlungFormState,
  formData: FormData,
): Promise<ZahlungFormState> {
  return runFormAction<DeleteZahlungInput, ZahlungFormState>(
    {
      scope: "deleteZahlungAction",
      guardError: (message) => ({ errors: { _form: [message] } }),
      parse: (data) => {
        const wegId = String(data.get("weg_id") ?? "").trim();
        const zahlungId = String(data.get("zahlung_id") ?? "").trim();

        if (!UUID_RE.test(wegId) || !UUID_RE.test(zahlungId)) {
          return {
            errors: {
              errors: { _form: ["Ungültige Route. Bitte Seite neu laden."] },
            },
          };
        }

        return { input: { wegId, zahlungId } };
      },
      execute: async ({ supabase }, input) => {
        const { error } = await supabase
          .from("zahlung")
          .delete()
          .eq("id", input.zahlungId)
          .eq("weg_id", input.wegId);

        if (error) {
          logPostgrestError("deleteZahlungAction", error);

          if (error.code === "23514") {
            return {
              errors: {
                errors: {
                  _form: [
                    "Diese Zahlung ist bereits zugeordnet und kann nicht mehr gelöscht werden. Zuerst die Zuordnung auflösen.",
                  ],
                },
              },
            };
          }

          return {
            errors: {
              errors: { _form: ["Die Zahlung konnte nicht gelöscht werden."] },
            },
          };
        }

        const basePath = `/wegs/${input.wegId}/finanzen/zahlungen`;

        return {
          revalidate: [basePath, `/wegs/${input.wegId}/finanzen/offene-posten`],
          redirectTo: basePath,
        };
      },
    },
    formData,
  );
}

interface ZuordnungInput {
  wegId: string;
  zahlungId: string;
  zuordnungen: { sollstellungId: string; betrag: number }[];
}

/**
 * Speichert alle Zuordnungen einer Zahlung in einem Schritt.
 *
 * Die Datenbank prueft dieselben Grenzen noch einmal
 * (`tg_zahlungszuordnung_validate`, 0061) — hier geht es darum, dem Nutzer
 * einen 23514 zu ersparen und ihm zu sagen, welcher Posten das Problem ist.
 */
export async function saveZuordnungenAction(
  _prev: ZuordnungFormState,
  formData: FormData,
): Promise<ZuordnungFormState> {
  return runFormAction<ZuordnungInput, ZuordnungFormState>(
    {
      scope: "saveZuordnungenAction",
      guardError: (message) => ({ errors: { _form: [message] } }),
      parse: (data) => {
        const wegId = String(data.get("weg_id") ?? "").trim();
        const zahlungId = String(data.get("zahlung_id") ?? "").trim();
        const sollIds = data.getAll("sollstellung_id").map((v) => String(v).trim());

        if (!UUID_RE.test(wegId) || !UUID_RE.test(zahlungId)) {
          return {
            errors: {
              errors: { _form: ["Ungültige Route. Bitte Seite neu laden."] },
            },
          };
        }

        const zuordnungen: { sollstellungId: string; betrag: number }[] = [];

        for (const sollstellungId of sollIds) {
          if (!UUID_RE.test(sollstellungId)) {
            return {
              errors: {
                errors: {
                  betraege: ["Ungültiger offener Posten. Bitte Seite neu laden."],
                },
              },
            };
          }

          const raw = String(data.get(`betrag_${sollstellungId}`) ?? "").trim();
          if (raw.length === 0) continue;

          const betrag = parseBetrag(raw);
          if (!Number.isFinite(betrag) || betrag < 0) {
            return {
              errors: {
                errors: { betraege: ["Beträge müssen 0 oder größer sein."] },
              },
            };
          }

          if (betrag > 0) {
            zuordnungen.push({ sollstellungId, betrag });
          }
        }

        if (zuordnungen.length === 0) {
          return {
            errors: {
              errors: {
                betraege: [
                  "Bitte mindestens einen Betrag eintragen, sonst bleibt die Zahlung unzugeordnet.",
                ],
              },
            },
          };
        }

        return { input: { wegId, zahlungId, zuordnungen } };
      },
      execute: async ({ supabase }, input) => {
        const { error } = await supabase.from("zahlungszuordnung").upsert(
          input.zuordnungen.map((z) => ({
            zahlung_id: input.zahlungId,
            sollstellung_id: z.sollstellungId,
            betrag: z.betrag,
          })),
          { onConflict: "tenant_id,zahlung_id,sollstellung_id" },
        );

        if (error) {
          logPostgrestError("saveZuordnungenAction", error);

          if (error.code === "23514") {
            return {
              errors: {
                errors: {
                  betraege: [
                    "Die Zuordnung überschreitet den Zahlbetrag oder überzahlt einen Posten. Bitte Beträge prüfen.",
                  ],
                },
              },
            };
          }

          return {
            errors: {
              errors: {
                _form: ["Die Zuordnung konnte nicht gespeichert werden."],
              },
            },
          };
        }

        return {
          revalidate: [
            `/wegs/${input.wegId}/finanzen/zahlungen`,
            `/wegs/${input.wegId}/finanzen/zahlungen/${input.zahlungId}`,
            `/wegs/${input.wegId}/finanzen/offene-posten`,
          ],
          state: { ok: true },
        };
      },
    },
    formData,
  );
}
