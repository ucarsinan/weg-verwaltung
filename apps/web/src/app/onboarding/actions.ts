"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { planForUnitCount } from "@/modules/saas/subscription";

export interface OnboardingState {
  message?: string;
  fieldErrors?: Record<string, string>;
}

interface SelfManagedWegRpcClient {
  rpc(
    name: "create_self_managed_weg_trial",
    args: {
      p_tenant_name: string;
      p_weg_name: string;
      p_address: Record<string, string>;
      p_unit_count: number;
      p_plan: "start" | "gemeinschaft";
    },
  ): Promise<{ error: { message: string } | null }>;
}

function textValue(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

export async function createSelfManagedWegAction(
  _previous: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const tenantName = textValue(formData, "tenantName");
  const wegName = textValue(formData, "wegName");
  const strasse = textValue(formData, "strasse");
  const plz = textValue(formData, "plz");
  const ort = textValue(formData, "ort");
  const unitCount = Number(textValue(formData, "unitCount"));
  const plan = planForUnitCount(unitCount);
  const fieldErrors: Record<string, string> = {};

  if (!tenantName || tenantName.length > 120) fieldErrors.tenantName = "Bitte geben Sie einen Namen für Ihre Gemeinschaft ein.";
  if (!wegName || wegName.length > 120) fieldErrors.wegName = "Bitte geben Sie den Namen der WEG ein.";
  if (!strasse || strasse.length > 200) fieldErrors.strasse = "Bitte geben Sie Straße und Hausnummer ein.";
  if (!/^\d{5}$/.test(plz)) fieldErrors.plz = "Bitte geben Sie eine fünfstellige Postleitzahl ein.";
  if (!ort || ort.length > 100) fieldErrors.ort = "Bitte geben Sie den Ort ein.";
  if (!plan) fieldErrors.unitCount = "Das Angebot gilt für WEGs mit 3 bis 20 Einheiten.";

  if (Object.keys(fieldErrors).length > 0 || !plan) {
    return { message: "Bitte prüfen Sie die markierten Angaben.", fieldErrors };
  }
  const selectedPlan = plan;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { message: "Bitte melden Sie sich erneut an." };

  const saasClient = supabase as unknown as SelfManagedWegRpcClient;
  const { error } = await saasClient.rpc("create_self_managed_weg_trial", {
    p_tenant_name: tenantName,
    p_weg_name: wegName,
    p_address: { strasse, plz, ort },
    p_unit_count: unitCount,
    p_plan: selectedPlan,
  });

  if (error) {
    return {
      message:
        "Ihre WEG konnte nicht eingerichtet werden. Bitte prüfen Sie Ihre Angaben oder versuchen Sie es später erneut.",
    };
  }

  await supabase.auth.refreshSession();
  redirect("/dashboard");
}
