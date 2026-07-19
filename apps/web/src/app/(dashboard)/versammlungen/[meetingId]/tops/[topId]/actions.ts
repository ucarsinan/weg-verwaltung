"use server";

import { logPostgrestError, runFormAction } from "@/modules/action-kernel";
import type { TopFormState } from "../new/actions";

// Server Actions for agenda_item edit + delete — über den action-kernel.
//
// Section 3 invariants:
//  - RLS scopes UPDATE/DELETE to the user's tenant; no tenant_id passed.
//  - meeting_id stays immutable on edit — the detail-page cross-meeting
//    guard enforces this on read; the edit action does not allow moving
//    a TOP between meetings.
//  - position stays immutable on edit (reordering is a separate concern).
//
// State shape is identical to create — reuse TopFormState so TopForm
// can render both flows without a generic type-param.
export type EditTopFormState = TopFormState;

const TITEL_MIN = 3;
const TITEL_MAX = 200;
const BESCHREIBUNG_MAX = 1000;

interface TopEditInput {
  titel: string;
  beschreibung: string | null;
}

export async function editAgendaItem(
  meetingId: string,
  topId: string,
  _prev: EditTopFormState,
  formData: FormData,
): Promise<EditTopFormState> {
  return runFormAction<TopEditInput, EditTopFormState>(
    {
      scope: "editAgendaItem",
      guardError: (message) => ({ errors: { _form: [message] } }),
      parse: (data) => {
        const titel = String(data.get("titel") ?? "").trim();
        const beschreibungRaw = String(data.get("beschreibung") ?? "").trim();

        const errors: EditTopFormState["errors"] = {};

        if (titel.length < TITEL_MIN) {
          errors.titel = [`Titel muss mindestens ${TITEL_MIN} Zeichen lang sein.`];
        } else if (titel.length > TITEL_MAX) {
          errors.titel = [`Titel darf höchstens ${TITEL_MAX} Zeichen lang sein.`];
        }

        if (beschreibungRaw.length > BESCHREIBUNG_MAX) {
          errors.beschreibung = [
            `Beschreibung darf höchstens ${BESCHREIBUNG_MAX} Zeichen lang sein.`,
          ];
        }

        if (Object.keys(errors).length > 0) {
          return { errors: { errors } };
        }

        return {
          input: {
            titel,
            beschreibung: beschreibungRaw === "" ? null : beschreibungRaw,
          },
        };
      },
      execute: async ({ supabase }, input) => {
        const { error } = await supabase
          .from("agenda_item")
          .update({
            titel: input.titel,
            beschreibung: input.beschreibung,
          })
          .eq("id", topId)
          .eq("meeting_id", meetingId);

        if (error) {
          logPostgrestError("editAgendaItem", error);
          return {
            errors: {
              errors: {
                _form: [
                  "TOP konnte nicht gespeichert werden. Bitte erneut versuchen.",
                ],
              },
            },
          };
        }

        return {
          revalidate: [
            `/versammlungen/${meetingId}`,
            `/versammlungen/${meetingId}/tops/${topId}`,
          ],
          redirectTo: `/versammlungen/${meetingId}/tops/${topId}`,
        };
      },
    },
    formData,
  );
}

export async function deleteAgendaItem(
  meetingId: string,
  topId: string,
): Promise<void> {
  await runFormAction<Record<string, never>, void>(
    {
      scope: "deleteAgendaItem",
      guardError: (message) => {
        throw new Error(message);
      },
      parse: () => ({ input: {} }),
      execute: async ({ supabase }) => {
        const { error } = await supabase
          .from("agenda_item")
          .delete()
          .eq("id", topId)
          .eq("meeting_id", meetingId);

        if (error) {
          logPostgrestError("deleteAgendaItem", error);
          throw new Error("TOP konnte nicht gelöscht werden.");
        }

        return {
          revalidate: [`/versammlungen/${meetingId}`],
          redirectTo: `/versammlungen/${meetingId}`,
        };
      },
    },
    new FormData(),
  );
}
