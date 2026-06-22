import {
  Building2,
  IdCard,
  LogOut,
  Mail,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

import { logoutAction } from "@/modules/settings/actions";
import { TenantNameForm } from "@/modules/settings/admin-forms";
import { updateProfilePersonAction } from "@/modules/settings/profile-actions";
import { ProfileForm } from "@/modules/settings/profile-form";
import { AdminUserManagement } from "@/modules/settings/admin/user-management";
import { MfaPanel } from "@/modules/settings/mfa-panel";
import { PasswordForm, PasswordResetForm } from "@/modules/settings/security-forms";
import { formatRole } from "@/modules/settings/shared";
import type { SettingsOverviewData } from "@/modules/settings/data";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricStrip } from "@/components/ui/metric-strip";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";

const DATE_TIME_FORMAT: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

function formatDateTime(value: string | null): string {
  if (!value) return "Nicht verfügbar";
  return new Date(value).toLocaleString("de-DE", DATE_TIME_FORMAT);
}

function displayValue(value: string | null | undefined): string {
  return value && value.trim() ? value : "Nicht hinterlegt";
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="grid gap-1 border-t border-[color:var(--color-border)] py-3 first:border-t-0 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-xs font-medium uppercase text-[color:var(--color-muted-foreground)]">
        {label}
      </dt>
      <dd className="min-w-0 break-words text-sm text-[color:var(--color-foreground)]">
        {value}
      </dd>
    </div>
  );
}

function SettingsCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function SettingsOverview({ data }: { data: SettingsOverviewData }) {
  const { account, person, tenant, tenantMembers, isTenantAdmin, loadIssues } =
    data;

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
            <span>{displayValue(account.email)}</span>
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

      <div className="grid gap-4 lg:grid-cols-2">
        <SettingsCard
          title="Konto"
          description="Accountdaten und Rolle der aktuellen Anmeldung."
        >
          <dl>
            <DetailRow label="E-Mail" value={displayValue(account.email)} />
            <DetailRow label="JWT-E-Mail" value={displayValue(account.jwtEmail)} />
            <DetailRow label="Telefon" value={displayValue(account.phone)} />
            <DetailRow label="Benutzer-ID" value={account.id} />
            <DetailRow label="Rolle" value={formatRole(account.role)} />
            <DetailRow label="Mandant-ID" value={displayValue(account.tenantId)} />
            <DetailRow
              label="Erstellt"
              value={formatDateTime(account.createdAt)}
            />
          </dl>
        </SettingsCard>

        <SettingsCard
          title="Person"
          description="Verknüpfte natürliche Person mit Kontakt- und Adressdaten."
        >
          {person ? (
            <ProfileForm action={updateProfilePersonAction} person={person} />
          ) : (
            <EmptyState
              icon={<IdCard />}
              title="Keine Person verknüpft"
              description="Für diesen Login ist aktuell keine Person hinterlegt. Profildaten können deshalb nicht bearbeitet werden."
            />
          )}
        </SettingsCard>

        <SettingsCard
          title="Mandant"
          description="Kanzlei- bzw. Mandantenkontext der aktuellen Anmeldung."
        >
          {tenant ? (
            <div className="space-y-5">
              <dl>
                <DetailRow label="Name" value={tenant.name} />
                <DetailRow label="Mandant-ID" value={tenant.id} />
                <DetailRow
                  label="Erstellt"
                  value={formatDateTime(tenant.created_at)}
                />
                <DetailRow
                  label="Aktualisiert"
                  value={formatDateTime(tenant.updated_at)}
                />
              </dl>
              {isTenantAdmin ? <TenantNameForm name={tenant.name} /> : null}
            </div>
          ) : (
            <EmptyState
              icon={<Building2 />}
              title="Mandant nicht verfügbar"
              description="Der aktuelle JWT-Claim verweist auf keinen lesbaren Mandanten."
            />
          )}
        </SettingsCard>

        <SettingsCard
          title="Sicherheit"
          description="Aktive Sitzung und Abmeldung."
        >
          <div className="space-y-5">
            <dl>
              <DetailRow
                label="Letzter Login"
                value={formatDateTime(account.lastSignInAt)}
              />
              <DetailRow
                label="Sitzung"
                value="Aktiv"
              />
            </dl>
            <PasswordForm />
            <PasswordResetForm />
            <MfaPanel />
          </div>
          <form action={logoutAction} className="mt-5">
            <Button type="submit" variant="destructive">
              <LogOut aria-hidden="true" />
              Sitzung beenden
            </Button>
          </form>
        </SettingsCard>
      </div>

      <section className="space-y-4">
        <SectionHeader
          title="Benutzer und Rollen"
          description={
            isTenantAdmin
              ? "Mandanten-Mitglieder mit Rollen und verknüpften Personendaten."
              : "Die vollständige Rollenliste ist nur für Mandanten-Admins lesbar."
          }
          meta={
            <StatusBadge variant={isTenantAdmin ? "success" : "neutral"}>
              {isTenantAdmin ? "Admin-Sicht" : "Eingeschränkte Sicht"}
            </StatusBadge>
          }
        />

        <AdminUserManagement data={data} />
      </section>
    </div>
  );
}
