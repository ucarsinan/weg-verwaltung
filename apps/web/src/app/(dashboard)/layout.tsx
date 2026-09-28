import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantClaims } from "@/modules/identity";
import AppShell from "@/components/shell/app-shell";

// Defence-in-depth: middleware already gates this route group, but a missing
// session here still redirects. Cheap, removes a class of "what if matcher
// regex changes" footguns.
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Ohne Mandanten ist hier nichts zu holen: Jede Server Action laeuft durch
  // requireTenantContext() und antwortet mit "Kein Mandant im aktuellen
  // JWT-Claim." — einem Entwicklersatz, aus dem der Nutzer nicht herausfindet.
  // Spiegelbildlich zu onboarding/page.tsx, das die Gegenrichtung schon macht.
  //
  // Ein fehlgeschlagenes getClaims() ist NICHT dasselbe wie "kein Mandant":
  // Bei einer JWKS- oder Netzstoerung kommt tenantId ebenfalls null zurueck.
  // Wer daraufhin umleitet, wirft gueltige Nutzer ins Onboarding — und wenn
  // der Custom Access Token Hook in einer Umgebung gar nicht registriert ist,
  // trifft es jeden. Deshalb: bei Fehler durchlassen und laut loggen. Das
  // Dashboard zeigt dann wie bisher "nicht verfuegbar", was diagnostizierbar
  // ist.
  const { claims, error: claimsError } = await getTenantClaims(supabase);
  if (claimsError) {
    console.error(
      "[dashboard/layout] getClaims failed — Mandantenpruefung uebersprungen:",
      claimsError,
    );
  } else if (!claims.tenantId) {
    redirect("/onboarding");
  }

  return <AppShell userEmail={user.email ?? ""}>{children}</AppShell>;
}
