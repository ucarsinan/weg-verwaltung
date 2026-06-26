import { getSettingsOverviewData } from "@/modules/settings/data";
import { SettingsOverview } from "@/modules/settings/settings-overview";

export default async function SettingsPage() {
  const data = await getSettingsOverviewData();

  return <SettingsOverview data={data} />;
}
