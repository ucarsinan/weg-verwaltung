import { IdCard } from "lucide-react";

import type { SettingsOverviewData } from "@/modules/settings/data";
import { updateProfilePersonAction } from "@/modules/settings/profile-actions";
import { ProfileForm } from "@/modules/settings/profile-form";
import { SettingsCard } from "@/modules/settings/segments/shared";
import { EmptyState } from "@/components/ui/empty-state";

export function PersonSegment({ data }: { data: SettingsOverviewData }) {
  const { person } = data;

  return (
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
  );
}
