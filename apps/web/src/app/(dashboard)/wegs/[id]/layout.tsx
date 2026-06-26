import { notFound } from "next/navigation";
import { WegWorkspaceNav } from "@/components/weg/weg-workspace-nav";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type WegRow = Pick<
  Database["public"]["Tables"]["weg"]["Row"],
  "id" | "name" | "adresse"
>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function WegWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!UUID_RE.test(id)) {
    notFound();
  }

  const supabase = await createClient();
  const { data: weg, error } = await supabase
    .from("weg")
    .select("id, name, adresse")
    .eq("id", id)
    .single<WegRow>();

  if (error || !weg) {
    if (error?.code === "PGRST116") {
      notFound();
    }
    console.error("[wegs/[id]/layout] select failed:", error);
    throw new Error("WEG-Arbeitsbereich konnte nicht geladen werden.");
  }

  return (
    <>
      <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6 lg:px-8">
        <WegWorkspaceNav
          wegId={weg.id}
          wegName={weg.name}
          wegAddress={weg.adresse}
        />
      </div>
      {children}
    </>
  );
}
