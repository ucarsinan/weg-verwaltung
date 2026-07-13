import { getSettingsOverviewData } from "@/modules/settings/data";
import { SicherheitSegment } from "@/modules/settings/segments/sicherheit-segment";

export const metadata = { title: "Sicherheit — Einstellungen" };

export default async function SicherheitPage() {
  const data = await getSettingsOverviewData();
  return <SicherheitSegment data={data} />;
}
