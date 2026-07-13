import { getSettingsOverviewData } from "@/modules/settings/data";
import { MitgliederSegment } from "@/modules/settings/segments/mitglieder-segment";

export const metadata = { title: "Mitglieder & Rollen — Einstellungen" };

export default async function MitgliederPage() {
  const data = await getSettingsOverviewData();
  return <MitgliederSegment data={data} />;
}
