"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { createClient } from "@/lib/supabase/server";
import { logPostgrestError, runFormAction } from "@/modules/action-kernel";
import { mapAktivierungsfehler } from "@/modules/finanzen/aktivierungsfehler";

export interface WirtschaftsplanEditFormState {
  errors?: {
    jahr?: string[];
    bezeichnung?: string[];
    gesamtkosten?: string[];
    wirksam_ab_monat?: string[];
    beschluss_sammlung_entry_id?: string[];
    _form?: string[];
  };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parsePositiveAmount(value: string): number | null {
  const normalized = value.replace(",", ".");
  const amount = Number.parseFloat(normalized);

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return Math.round(amount * 100) / 100;
}

function parseOptionalMonth(value: string): number | null | "invalid" {
  if (value.length === 0) {
    return null;
  }

  const month = Number.parseInt(value, 10);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return "invalid";
  }

  return month;
}

function mapLifecycleError(code?: string): string {
  if (code === "PGRST116" || code === "P0002") {
    return "Wirtschaftsplan wurde nicht gefunden.";
  }

  if (code === "42501") {
    return "Diese Aktion ist für diesen Wirtschaftsplan nicht erlaubt.";
  }

  if (code === "23505") {
    return "Für dieses Jahr ist bereits ein anderer Wirtschaftsplan aktiv.";
  }

  // Diese Funktion bedient nur noch Archivieren und Nachtrag; die Aktivierung
  // hat mit mapAktivierungsfehler eine eigene Zuordnung.
  //
  // Sie behauptet hier ausdruecklich KEINEN MEA-Fehler mehr: Die
  // MEA-Vorbedingung aus 0073 sitzt allein in activate_wirtschaftsplan, wird
  // beim Archivieren und beim Nachtrag also nie geprueft. Ein 22023 kann hier
  // nur aus der Audit-Kette kommen (0045:153,179 werfen denselben Code fuer
  // Ausfaelle der HMAC-Kette, und deren Trigger haengen an wirtschaftsplan).
  if (code === "22023") {
    return "Die Aktion ist an einer technischen Prüfung gescheitert. Bitte an die Administration wenden.";
  }

  if (code === "23514") {
    return "Der Statuswechsel ist fachlich nicht erlaubt.";
  }

  return "Aktion konnte nicht ausgeführt werden. Bitte erneut versuchen.";
}

interface WirtschaftsplanEditInput {
  jahr: number;
  bezeichnung: string;
  gesamtkosten: number;
  wirksamAbMonat: number | null;
  /** `null` bis die Versammlung beschlossen hat; Pflicht erst beim Aktivieren. */
  beschlussSammlungEntryId: string | null;
}

export async function updateWirtschaftsplanAction(
  wegId: string,
  planId: string,
  _prev: WirtschaftsplanEditFormState,
  formData: FormData,
): Promise<WirtschaftsplanEditFormState> {
  if (!UUID_RE.test(wegId) || !UUID_RE.test(planId)) {
    return {
      errors: { _form: ["Ungültige ID. Bitte Seite neu laden."] },
    };
  }

  return runFormAction<WirtschaftsplanEditInput, WirtschaftsplanEditFormState>(
    {
      scope: "updateWirtschaftsplanAction",
      guardError: (message) => ({ errors: { _form: [message] } }),
      parse: (data) => {
        const jahrRaw = String(data.get("jahr") ?? "").trim();
        const bezeichnung = String(data.get("bezeichnung") ?? "").trim();
        const gesamtkostenRaw = String(data.get("gesamtkosten") ?? "").trim();
        const wirksamAbMonatRaw = String(
          data.get("wirksam_ab_monat") ?? "",
        ).trim();
        const beschlussRaw = String(
          data.get("beschluss_sammlung_entry_id") ?? "",
        ).trim();

        const errors: WirtschaftsplanEditFormState["errors"] = {};

        const jahr = Number.parseInt(jahrRaw, 10);
        if (!jahrRaw || !Number.isInteger(jahr) || jahr < 1900 || jahr > 2100) {
          errors.jahr = ["Bitte ein gültiges Jahr zwischen 1900 und 2100 angeben."];
        }

        if (bezeichnung.length === 0) {
          errors.bezeichnung = ["Bitte eine Bezeichnung angeben."];
        } else if (bezeichnung.length > 200) {
          errors.bezeichnung = [
            "Bezeichnung darf höchstens 200 Zeichen lang sein.",
          ];
        }

        const gesamtkosten = parsePositiveAmount(gesamtkostenRaw);
        if (gesamtkosten === null) {
          errors.gesamtkosten = ["Die Gesamtkosten müssen größer als 0 sein."];
        }

        const wirksamAbMonat = parseOptionalMonth(wirksamAbMonatRaw);
        if (wirksamAbMonat === "invalid") {
          errors.wirksam_ab_monat = [
            "Der Wirksamkeitsmonat muss zwischen 1 und 12 liegen.",
          ];
        }

        // Leer ist gueltig: der Entwurf entsteht, bevor die Versammlung
        // beschliesst. Die Pflicht sitzt in activate_wirtschaftsplan (0074).
        // Geprueft wird nur die Form — ob der Beschluss zur WEG gehoert und
        // zustimmend ist, prueft die Datenbank, nicht die Oberflaeche.
        if (beschlussRaw.length > 0 && !UUID_RE.test(beschlussRaw)) {
          errors.beschluss_sammlung_entry_id = [
            "Bitte einen Beschluss aus der Liste wählen.",
          ];
        }

        if (Object.keys(errors).length > 0) {
          return { errors: { errors } };
        }

        return {
          input: {
            jahr,
            bezeichnung,
            gesamtkosten: gesamtkosten ?? 0,
            wirksamAbMonat: wirksamAbMonat === "invalid" ? null : wirksamAbMonat,
            beschlussSammlungEntryId: beschlussRaw.length > 0 ? beschlussRaw : null,
          },
        };
      },
      execute: async ({ supabase }, input) => {
        const { error } = await supabase
          .from("wirtschaftsplan")
          .update({
            jahr: input.jahr,
            bezeichnung: input.bezeichnung,
            gesamtkosten: input.gesamtkosten,
            wirksam_ab_monat: input.wirksamAbMonat,
            beschluss_sammlung_entry_id: input.beschlussSammlungEntryId,
          })
          .eq("id", planId)
          .eq("weg_id", wegId)
          .select("id")
          .single();

        if (error) {
          logPostgrestError("updateWirtschaftsplanAction", error);

          if (error.code === "23505") {
            return {
              errors: {
                errors: {
                  jahr: [
                    "Für dieses Jahr ist bereits ein anderer Wirtschaftsplan aktiv.",
                  ],
                },
              },
            };
          }

          if (error.code === "PGRST116") {
            return {
              errors: {
                errors: { _form: ["Wirtschaftsplan wurde nicht gefunden."] },
              },
            };
          }

          if (error.code === "23514") {
            return {
              errors: {
                errors: {
                  _form: [
                    "Bestehende Sollstellungen sind historische Forderungen. Bitte legen Sie für Änderungen einen Nachtrag oder eine Korrektur an.",
                  ],
                },
              },
            };
          }

          return {
            errors: {
              errors: {
                _form: [
                  "Wirtschaftsplan konnte nicht aktualisiert werden. Bitte erneut versuchen.",
                ],
              },
            },
          };
        }

        return {
          revalidate: [`/wegs/${wegId}/finanzen`],
          redirectTo: `/wegs/${wegId}/finanzen`,
        };
      },
    },
    formData,
  );
}

export async function deleteWirtschaftsplanAction(
  wegId: string,
  planId: string,
): Promise<{ error?: string }> {
  if (!UUID_RE.test(wegId) || !UUID_RE.test(planId)) {
    return { error: "Ungültige ID. Bitte Seite neu laden." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("wirtschaftsplan")
    .delete()
    .eq("id", planId)
    .eq("weg_id", wegId)
    .select("id")
    .single();

  if (error) {
    console.error("[deleteWirtschaftsplanAction] delete failed", {
      code: error.code,
      hint: error.hint,
    });

    if (error.code === "PGRST116") {
      return { error: "Wirtschaftsplan wurde nicht gefunden." };
    }

    if (error.code === "23514" || error.code === "23503") {
      return {
        error:
          "Wirtschaftsplan hat historische Sollstellungen und kann nicht gelöscht werden.",
      };
    }

    return {
      error:
        "Wirtschaftsplan konnte nicht gelöscht werden. Bitte erneut versuchen.",
    };
  }

  revalidatePath(`/wegs/${wegId}/finanzen`);
  redirect(`/wegs/${wegId}/finanzen`);
}

export async function activateWirtschaftsplan(
  wegId: string,
  planId: string,
): Promise<{ error?: string }> {
  if (!UUID_RE.test(wegId) || !UUID_RE.test(planId)) {
    return { error: "Ungültige ID. Bitte Seite neu laden." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("activate_wirtschaftsplan", {
    p_wirtschaftsplan_id: planId,
  });

  if (error) {
    // Die Aktivierung bekommt eine eigene Zuordnung statt mapLifecycleError:
    // Sie ist die einzige der drei Lifecycle-Aktionen, die den Generator
    // ausfuehrt, und traegt damit Ursachen, die es beim Archivieren und beim
    // Nachtrag nicht gibt. `message` wird ausgewertet, weil der Code allein
    // fuenf Ursachen nicht trennt (Befund 6).
    const { text, intern } = mapAktivierungsfehler(error.code, error.message);
    console.error("[activateWirtschaftsplan] rpc failed", {
      code: error.code,
      hint: error.hint,
      // Bei internen Ursachen ist der Log die einzige Spur — der Nutzer sieht
      // absichtlich nur einen technischen Hinweis.
      ...(intern ? { message: error.message, intern: true } : {}),
    });
    return { error: text };
  }

  revalidatePath(`/wegs/${wegId}/finanzen`);
  revalidatePath(`/wegs/${wegId}/finanzen/${planId}/edit`);
  redirect(`/wegs/${wegId}/finanzen`);
}

export async function archiveWirtschaftsplan(
  wegId: string,
  planId: string,
): Promise<{ error?: string }> {
  if (!UUID_RE.test(wegId) || !UUID_RE.test(planId)) {
    return { error: "Ungültige ID. Bitte Seite neu laden." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("archive_wirtschaftsplan", {
    p_wirtschaftsplan_id: planId,
  });

  if (error) {
    console.error("[archiveWirtschaftsplan] rpc failed", {
      code: error.code,
      hint: error.hint,
    });
    return { error: mapLifecycleError(error.code) };
  }

  revalidatePath(`/wegs/${wegId}/finanzen`);
  revalidatePath(`/wegs/${wegId}/finanzen/${planId}/edit`);
  redirect(`/wegs/${wegId}/finanzen`);
}

export async function createNachtragsplan(
  wegId: string,
  planId: string,
): Promise<{ error?: string }> {
  if (!UUID_RE.test(wegId) || !UUID_RE.test(planId)) {
    return { error: "Ungültige ID. Bitte Seite neu laden." };
  }

  const supabase = await createClient();
  const { data: newPlanId, error } = await supabase.rpc("create_nachtragsplan", {
    p_wirtschaftsplan_id: planId,
  });

  if (error || !newPlanId) {
    console.error("[createNachtragsplan] rpc failed", {
      code: error?.code,
      hint: error?.hint,
    });
    return { error: mapLifecycleError(error?.code) };
  }

  revalidatePath(`/wegs/${wegId}/finanzen`);
  redirect(`/wegs/${wegId}/finanzen/${newPlanId}/edit` as Route);
}
