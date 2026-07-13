import { getSettingsOverviewData } from "@/modules/settings/data";
import { PersonSegment } from "@/modules/settings/segments/person-segment";

export const metadata = { title: "Person — Einstellungen" };

export default async function PersonPage() {
  const data = await getSettingsOverviewData();
  return <PersonSegment data={data} />;
}
