import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { EIGENTUEMER_ROLLE, getTenantClaims } from "@/modules/identity";
import { logoutAction } from "@/modules/settings/actions";

export const metadata = { title: "Kein Zugang — WEG-Verwaltung" };

/**
 * Landeplatz fuer die Rolle `eigentuemer`, die vom Dashboard ferngehalten wird.
 *
 * Spiegelbildlich zum Riegel in (dashboard)/layout.tsx: Wer NICHT diese Rolle
 * traegt, hat hier nichts verloren und wird ins Dashboard geschickt — sonst
 * koennte ein Verwalter diese Sackgasse versehentlich aufrufen und haette
 * ausser Abmelden keinen Weg zurueck.
 */
export default async function KeinZugangPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Bei einem Fehler NICHT weiterleiten: Wer hierher kam, wurde vom Layout
  // geschickt, und eine Stoerung darf ihn nicht zwischen beiden Seiten hin und
  // her werfen. Dieselbe Unterscheidung wie im Layout.
  const { claims, error: claimsError } = await getTenantClaims(supabase);
  if (!claimsError && claims.role !== EIGENTUEMER_ROLLE) {
    redirect("/dashboard");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl items-center px-6 py-12">
      <section className="w-full rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-6 shadow-xl sm:p-8">
        <p className="text-sm font-medium text-[color:var(--color-muted-foreground)]">
          Zugang als Eigentümer
        </p>
        <h1 className="mt-2 text-3xl font-semibold">
          Für Eigentümer gibt es noch keine eigene Ansicht.
        </h1>
        <p className="mt-3 text-sm leading-6 text-[color:var(--color-muted-foreground)]">
          Ihr Konto ist mit der Rolle {"„Eigentümer“"} angelegt. Die Verwaltungsoberfläche
          zeigt die Daten aller Einheiten einer Gemeinschaft und ist deshalb der
          Verwaltung vorbehalten. Eine Ansicht, die Ihnen Ihre eigenen Unterlagen
          zeigt, ist noch nicht gebaut.
        </p>
        <p className="mt-3 text-sm leading-6 text-[color:var(--color-muted-foreground)]">
          Wenden Sie sich an Ihre Verwaltung, wenn Sie Unterlagen brauchen. Sollte
          Ihr Konto versehentlich als Eigentümer angelegt worden sein, kann die
          Verwaltung die Rolle ändern.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-[color:var(--color-border)] pt-4 text-sm text-[color:var(--color-muted-foreground)]">
          <span>Angemeldet als {user.email}.</span>
          <form action={logoutAction}>
            <button
              type="submit"
              className="underline underline-offset-2 hover:text-[color:var(--color-foreground)]"
            >
              Abmelden
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
