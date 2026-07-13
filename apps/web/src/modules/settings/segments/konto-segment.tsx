import type { SettingsOverviewData } from "@/modules/settings/data";
import { formatRole } from "@/modules/settings/shared";
import {
  DetailRow,
  SettingsCard,
  displayValue,
  formatDateTime,
} from "@/modules/settings/segments/shared";

export function KontoSegment({ data }: { data: SettingsOverviewData }) {
  const { account } = data;

  return (
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
        <DetailRow label="Erstellt" value={formatDateTime(account.createdAt)} />
      </dl>
    </SettingsCard>
  );
}
