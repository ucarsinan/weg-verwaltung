import { Building2 } from "lucide-react";

import type { SettingsOverviewData } from "@/modules/settings/data";
import { TenantNameForm } from "@/modules/settings/admin-forms";
import {
  DetailRow,
  SettingsCard,
  formatDateTime,
} from "@/modules/settings/segments/shared";
import { EmptyState } from "@/components/ui/empty-state";

export function MandantSegment({ data }: { data: SettingsOverviewData }) {
  const { tenant, isTenantAdmin } = data;

  return (
    <SettingsCard
      title="Mandant"
      description="Kanzlei- bzw. Mandantenkontext der aktuellen Anmeldung."
    >
      {tenant ? (
        <div className="space-y-5">
          <dl>
            <DetailRow label="Name" value={tenant.name} />
            <DetailRow label="Mandant-ID" value={tenant.id} />
            <DetailRow label="Erstellt" value={formatDateTime(tenant.created_at)} />
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
  );
}
