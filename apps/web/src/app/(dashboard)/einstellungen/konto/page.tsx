import { getSettingsOverviewData } from "@/modules/settings/data";
import { KontoSegment } from "@/modules/settings/segments/konto-segment";

export const metadata = { title: "Konto — Einstellungen" };

export default async function KontoPage() {
  const data = await getSettingsOverviewData();
  return <KontoSegment data={data} />;
}
