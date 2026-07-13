import { Building2, LogOut, Mail, ShieldCheck, UsersRound } from "lucide-react";

import { logoutAction } from "@/modules/settings/actions";
import { getSettingsOverviewData } from "@/modules/settings/data";
import { formatRole } from "@/modules/settings/shared";
import { formatDateTime } from "@/modules/settings/segments/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { MetricStrip } from "@/components/ui/metric-strip";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";

export default async function EinstellungenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const data = await getSettingsOverviewData();
  const { account, tenant, tenantMembers, isTenantAdmin, loadIssues } = data;

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Einstellungen"
        description="Konto, Personenverknüpfung, Mandant und Rollen im aktuellen Arbeitskontext."
        eyebrow="Mandanten- und Kontoeinstellungen"
        meta={
          <>
            <StatusBadge variant={isTenantAdmin ? "success" : "neutral"}>
              {formatRole(account.role)}
            </StatusBadge>
            <span>{account.email ?? "Login aktiv"}</span>
          </>
        }
        actions={
          <form action={logoutAction}>
            <Button type="submit" variant="outline">
              <LogOut aria-hidden="true" />
              Abmelden
            </Button>
          </form>
        }
      />

      {loadIssues.length > 0 ? (
        <Card className="border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
          <CardHeader>
            <CardTitle>Daten teilweise nicht verfügbar</CardTitle>
            <CardDescription className="text-amber-900/80 dark:text-amber-100/80">
              Die Seite bleibt lesbar, einzelne Bereiche sind aber unvollständig.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm leading-6">
              {loadIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <MetricStrip
        items={[
          {
            label: "Konto",
            value: account.email ?? "Login aktiv",
            hint: `Letzter Login: ${formatDateTime(account.lastSignInAt)}`,
            icon: <Mail />,
          },
          {
            label: "Rolle",
            value: formatRole(account.role),
            hint: "Aus den verifizierten JWT-Claims.",
            icon: <ShieldCheck />,
          },
          {
            label: "Mandant",
            value: tenant?.name ?? "Nicht verfügbar",
            hint: account.tenantId ?? "Kein tenant_id Claim vorhanden.",
            icon: <Building2 />,
          },
          {
            label: "Rollenliste",
            value: isTenantAdmin ? tenantMembers.length : "Nur Admins",
            hint: isTenantAdmin
              ? "Sichtbar über Tenant-Admin-Rechte."
              : "Tenant-Mitgliederliste ist Admins vorbehalten.",
            icon: <UsersRound />,
          },
        ]}
      />

      {children}
    </div>
  );
}
