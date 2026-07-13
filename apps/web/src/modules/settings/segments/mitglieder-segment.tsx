import type { SettingsOverviewData } from "@/modules/settings/data";
import { AdminUserManagement } from "@/modules/settings/admin/user-management";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";

export function MitgliederSegment({ data }: { data: SettingsOverviewData }) {
  const { isTenantAdmin } = data;

  return (
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
  );
}
