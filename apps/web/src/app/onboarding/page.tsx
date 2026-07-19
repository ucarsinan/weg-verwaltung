import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getTenantClaims } from "@/modules/identity";

import { OnboardingWizard } from "./onboarding-wizard";

export const metadata = { title: "WEG einrichten — WEG-Verwaltung" };

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/onboarding");

  const { claims } = await getTenantClaims(supabase);
  if (claims.tenantId) redirect("/dashboard");

  return <main className="mx-auto flex min-h-screen max-w-2xl items-center px-6 py-12"><section className="w-full rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-6 shadow-xl sm:p-8"><p className="text-sm font-medium text-[color:var(--color-muted-foreground)]">30 Tage kostenlos starten</p><h1 className="mt-2 text-3xl font-semibold">Richten Sie Ihre WEG ein.</h1><p className="mt-3 text-sm leading-6 text-[color:var(--color-muted-foreground)]">Sie brauchen keine technischen Kenntnisse. Die Einrichtung dauert nur wenige Minuten.</p><div className="mt-8"><OnboardingWizard /></div></section></main>;
}
