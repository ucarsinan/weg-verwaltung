"use server";

import { logPostgrestError, runFormAction } from "@/modules/action-kernel";
import {
  brauchtBasiswerte,
  brauchtTeile,
  isVerteilungsschluesselQuelle,
  isVerteilungsschluesselRegelwerk,
  isVerteilungsschluesselTyp,
  pruefeTeile,
} from "@/modules/finanzen";
import type { TeilEingabe } from "@/modules/finanzen";
import type {
  VerteilungsschluesselQuelle,
  VerteilungsschluesselRegelwerk,
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

export interface TeileFormState {
  errors?: {
    teile?: string[];
    _form?: string[];
  };
  ok?: boolean;
}

export interface BasiswerteFormState {
  errors?: {
    einheit?: string[];
    gueltig_ab?: string[];
    werte?: string[];
    _form?: string[];
  };
  ok?: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface VerteilungsschluesselInput {
  wegId: string;
  name: string;
  typ: VerteilungsschluesselTyp;
  quelle: VerteilungsschluesselQuelle;
  gueltigAb: string;
  /** Nur bei `gemischt` gesetzt — bestimmt, ob der HeizKV-Korridor greift. */
  regelwerk: VerteilungsschluesselRegelwerk | null;
}

/**
 * Legt den Schluessel und seine erste Version an.
 *
 * PostgREST kennt keine tabellenuebergreifende Transaktion. Schlaegt die
 * Version fehl, bleibt der Schluessel ohne Version bestehen — das ist ein
 * gueltiger Zwischenzustand, die Detailseite laesst eine Version nachtragen.
 */
export async function createVerteilungsschluesselAction(
  _prev: VerteilungsschluesselFormState,
  formData: FormData,
): Promise<VerteilungsschluesselFormState> {
  return runFormAction<VerteilungsschluesselInput, VerteilungsschluesselFormState>(
    {
      scope: "createVerteilungsschluesselAction",
      guardError: (message) => ({ errors: { _form: [message] } }),
      parse: (data) => {
        const wegId = String(data.get("weg_id") ?? "").trim();
        const name = String(data.get("name") ?? "").trim();
        const typRaw = String(data.get("typ") ?? "").trim();
        const regelwerkRaw = String(data.get("regelwerk") ?? "").trim();
        const quelleRaw = String(data.get("quelle") ?? "").trim();
        const gueltigAb = String(data.get("gueltig_ab") ?? "").trim();

        if (!UUID_RE.test(wegId)) {
          return {
            errors: {
              errors: { _form: ["Ungültige WEG-ID. Bitte Seite neu laden."] },
            },
          };
        }

        const errors: VerteilungsschluesselFormState["errors"] = {};

        if (name.length === 0) {
          errors.name = ["Bitte einen Namen angeben."];
        }

        if (!isVerteilungsschluesselTyp(typRaw)) {
          errors.typ = ["Bitte einen gültigen Verteilungsschlüssel-Typ wählen."];
        }

        if (!isVerteilungsschluesselQuelle(quelleRaw)) {
          errors.quelle = ["Bitte eine gültige Rechtsgrundlage wählen."];
        }

        if (!ISO_DATE_RE.test(gueltigAb)) {
          errors.gueltig_ab = ["Bitte ein gültiges Datum angeben."];
        }

        if (Object.keys(errors).length > 0) {
          return { errors: { errors } };
        }

        return {
          input: {
            wegId,
            name,
            typ: typRaw as VerteilungsschluesselTyp,
            quelle: quelleRaw as VerteilungsschluesselQuelle,
            gueltigAb,
            regelwerk:
              typRaw === "gemischt" && isVerteilungsschluesselRegelwerk(regelwerkRaw)
                ? regelwerkRaw
                : null,
          },
        };
      },
      execute: async ({ supabase }, input) => {
        const { data: key, error: keyError } = await supabase
          .from("verteilungsschluessel")
          .insert({ weg_id: input.wegId, name: input.name })
          .select("id")
          .single();

        if (keyError || !key) {
          logPostgrestError("createVerteilungsschluesselAction", keyError ?? {});

          if (keyError?.code === "23505") {
            return {
              errors: {
                errors: {
                  name: ["Ein Verteilungsschlüssel mit diesem Namen existiert bereits."],
                },
              },
            };
          }

          return {
            errors: {
              errors: { _form: ["Der Verteilungsschlüssel konnte nicht angelegt werden."] },
            },
          };
        }

        const { error: versionError } = await supabase
          .from("verteilungsschluessel_version")
          .insert({
            verteilungsschluessel_id: key.id,
            typ: input.typ,
            quelle: input.quelle,
            gueltig_ab: input.gueltigAb,
            parameter:
              input.regelwerk === null ? {} : { regelwerk: input.regelwerk },
          });

        if (versionError) {
          logPostgrestError("createVerteilungsschluesselAction", versionError);
          return {
            errors: {
              errors: {
                _form: [
                  "Der Schlüssel wurde angelegt, die erste Version aber nicht. Bitte die Version auf der Detailseite nachtragen.",
                ],
              },
            },
          };
        }

        const basePath = `/wegs/${input.wegId}/finanzen/verteilungsschluessel`;

        return {
          revalidate: [basePath, `/wegs/${input.wegId}/finanzen`],
          // Eine gemischte Regel ist ohne ihre Teile unbrauchbar, genau wie ein
          // Flaechenschluessel ohne Basiswerte: in beiden Faellen direkt auf die
          // Detailseite, wo sie gefuellt wird.
          redirectTo:
            brauchtBasiswerte(input.typ) || brauchtTeile(input.typ)
              ? `${basePath}/${key.id}`
              : basePath,
        };
      },
    },
    formData,
  );
}

interface BasiswerteInput {
  wegId: string;
  keyId: string;
  versionId: string;
  einheit: string;
  gueltigAb: string;
  werte: { unitId: string; wert: number }[];
}

/**
 * Speichert die Basiswerte aller Einheiten einer Version in einem Schritt.
 *
 * Bewusst als Sammelformular: der Generator (0060) scheitert fail-closed mit
 * 23514, sobald auch nur eine Einheit der WEG keinen Basiswert zum Stichtag
 * hat. Ein zeilenweises Formular wuerde diesen unvollstaendigen Zustand
 * erlauben und den Fehler erst bei der Aktivierung sichtbar machen.
 */
export async function saveBasiswerteAction(
  _prev: BasiswerteFormState,
  formData: FormData,
): Promise<BasiswerteFormState> {
  return runFormAction<BasiswerteInput, BasiswerteFormState>(
    {
      scope: "saveBasiswerteAction",
      guardError: (message) => ({ errors: { _form: [message] } }),
      parse: (data) => {
        const wegId = String(data.get("weg_id") ?? "").trim();
        const keyId = String(data.get("key_id") ?? "").trim();
        const versionId = String(data.get("version_id") ?? "").trim();
        const einheit = String(data.get("einheit") ?? "").trim();
        const gueltigAb = String(data.get("gueltig_ab") ?? "").trim();
        const unitIds = data.getAll("unit_id").map((v) => String(v).trim());

        if (
          !UUID_RE.test(wegId) ||
          !UUID_RE.test(keyId) ||
          !UUID_RE.test(versionId)
        ) {
          return {
            errors: {
              errors: { _form: ["Ungültige Route. Bitte Seite neu laden."] },
            },
          };
        }

        const errors: BasiswerteFormState["errors"] = {};

        if (einheit.length === 0) {
          errors.einheit = ["Bitte eine Maßeinheit angeben, z. B. m² oder kWh."];
        }

        if (!ISO_DATE_RE.test(gueltigAb)) {
          errors.gueltig_ab = ["Bitte ein gültiges Datum angeben."];
        }

        if (unitIds.length === 0) {
          errors.werte = ["Die WEG hat keine Einheiten."];
        }

        const werte: { unitId: string; wert: number }[] = [];

        for (const unitId of unitIds) {
          if (!UUID_RE.test(unitId)) {
            errors.werte = ["Ungültige Einheit. Bitte Seite neu laden."];
            break;
          }

          const raw = String(data.get(`wert_${unitId}`) ?? "").trim();
          const wert = Number(raw.replace(",", "."));

          if (raw.length === 0 || !Number.isFinite(wert) || wert < 0) {
            errors.werte = [
              "Für jede Einheit muss ein Wert ≥ 0 angegeben sein — sonst kann der Plan später nicht aktiviert werden.",
            ];
            break;
          }

          werte.push({ unitId, wert });
        }

        if (errors.werte === undefined && werte.every((w) => w.wert === 0)) {
          errors.werte = ["Mindestens ein Wert muss größer als 0 sein."];
        }

        if (Object.keys(errors).length > 0) {
          return { errors: { errors } };
        }

        return {
          input: { wegId, keyId, versionId, einheit, gueltigAb, werte },
        };
      },
      execute: async ({ supabase }, input) => {
        const { error } = await supabase
          .from("verteilungsschluessel_basiswert")
          .upsert(
            input.werte.map((w) => ({
              verteilungsschluessel_version_id: input.versionId,
              unit_id: w.unitId,
              wert: w.wert,
              einheit: input.einheit,
              gueltig_ab: input.gueltigAb,
            })),
            {
              onConflict:
                "tenant_id,verteilungsschluessel_version_id,unit_id,gueltig_ab",
            },
          );

        if (error) {
          logPostgrestError("saveBasiswerteAction", error);
          return {
            errors: {
              errors: { _form: ["Die Basiswerte konnten nicht gespeichert werden."] },
            },
          };
        }

        return {
          revalidate: [
            `/wegs/${input.wegId}/finanzen/verteilungsschluessel/${input.keyId}`,
          ],
          state: { ok: true },
        };
      },
    },
    formData,
  );
}


interface TeileInput {
  wegId: string;
  keyId: string;
  versionId: string;
  teile: { versionId: string; gewicht: number }[];
}

/**
 * Ersetzt die Teile einer gemischten Regel in einem Zug.
 *
 * Bewusst „alles ersetzen" statt zeilenweise: Migration 0067 prueft die Summe
 * der Gewichte je ANWEISUNG. Nach der ersten eingefuegten Zeile ist sie nie
 * 100, ein zeilenweises Formular koennte deshalb gar nichts speichern. Erst
 * loeschen (Summe 0, ausdruecklich erlaubt), dann alle Teile in einem Insert.
 */
export async function saveTeileAction(
  _prev: TeileFormState,
  formData: FormData,
): Promise<TeileFormState> {
  return runFormAction<TeileInput, TeileFormState>(
    {
      scope: "saveTeileAction",
      guardError: (message) => ({ errors: { _form: [message] } }),
      parse: (data) => {
        const wegId = String(data.get("weg_id") ?? "").trim();
        const keyId = String(data.get("key_id") ?? "").trim();
        const versionId = String(data.get("version_id") ?? "").trim();
        const regelwerkRaw = String(data.get("regelwerk") ?? "frei").trim();

        if (
          !UUID_RE.test(wegId) ||
          !UUID_RE.test(keyId) ||
          !UUID_RE.test(versionId)
        ) {
          return {
            errors: {
              errors: { _form: ["Ungültige Route. Bitte Seite neu laden."] },
            },
          };
        }

        const regelwerk: VerteilungsschluesselRegelwerk =
          isVerteilungsschluesselRegelwerk(regelwerkRaw) ? regelwerkRaw : "frei";

        const gewaehlte = data.getAll("teil_version_id").map((v) => String(v).trim());
        const teile: { versionId: string; gewicht: number }[] = [];
        const fuerPruefung: TeilEingabe[] = [];

        for (const teilVersionId of gewaehlte) {
          if (!UUID_RE.test(teilVersionId)) {
            return {
              errors: {
                errors: { teile: ["Ungültiger Teil. Bitte Seite neu laden."] },
              },
            };
          }

          const raw = String(data.get(`gewicht_${teilVersionId}`) ?? "").trim();
          const gewicht = Number(raw.replace(",", "."));

          if (raw.length === 0 || !Number.isFinite(gewicht) || gewicht <= 0) {
            return {
              errors: {
                errors: {
                  teile: ["Jeder gewählte Teil braucht ein Gewicht größer als 0."],
                },
              },
            };
          }

          const typRaw = String(data.get(`typ_${teilVersionId}`) ?? "").trim();
          if (!isVerteilungsschluesselTyp(typRaw)) {
            return {
              errors: {
                errors: { teile: ["Unbekannter Schlüsseltyp. Bitte Seite neu laden."] },
              },
            };
          }

          teile.push({ versionId: teilVersionId, gewicht });
          fuerPruefung.push({ typ: typRaw, gewicht });
        }

        // Dieselbe Pruefung wie in der Datenbank, nur frueher und mit einem
        // Satz, den der Verwalter lesen kann.
        const pruefung = pruefeTeile(fuerPruefung, regelwerk);
        if (!pruefung.ok) {
          return { errors: { errors: { teile: [pruefung.meldung] } } };
        }

        return { input: { wegId, keyId, versionId, teile } };
      },
      execute: async ({ supabase }, input) => {
        const { error: deleteError } = await supabase
          .from("verteilungsschluessel_teil")
          .delete()
          .eq("verteilungsschluessel_version_id", input.versionId);

        if (deleteError) {
          logPostgrestError("saveTeileAction.delete", deleteError);
          return {
            errors: {
              errors: { _form: ["Die bisherigen Teile konnten nicht ersetzt werden."] },
            },
          };
        }

        const { error } = await supabase
          .from("verteilungsschluessel_teil")
          .insert(
            input.teile.map((teil) => ({
              verteilungsschluessel_version_id: input.versionId,
              teil_version_id: teil.versionId,
              gewicht: teil.gewicht,
            })),
          );

        if (error) {
          logPostgrestError("saveTeileAction", error);

          if (error.code === "23514") {
            // Die Datenbank hat das letzte Wort — etwa wenn ein Teil inzwischen
            // zu einer anderen WEG gehoert oder selbst gemischt geworden ist.
            return {
              errors: {
                errors: {
                  teile: [
                    error.message ||
                      "Die Zusammensetzung ist nach den Regeln der HeizkostenV nicht zulässig.",
                  ],
                },
              },
            };
          }

          return {
            errors: {
              errors: { _form: ["Die Teile konnten nicht gespeichert werden."] },
            },
          };
        }

        return {
          revalidate: [
            `/wegs/${input.wegId}/finanzen/verteilungsschluessel/${input.keyId}`,
          ],
          state: { ok: true },
        };
      },
    },
    formData,
  );
}
