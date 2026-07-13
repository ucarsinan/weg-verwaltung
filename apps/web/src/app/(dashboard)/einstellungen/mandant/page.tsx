import { getSettingsOverviewData } from "@/modules/settings/data";
import { MandantSegment } from "@/modules/settings/segments/mandant-segment";

export const metadata = { title: "Mandant — Einstellungen" };

export default async function MandantPage() {
  const data = await getSettingsOverviewData();
  return <MandantSegment data={data} />;
}
