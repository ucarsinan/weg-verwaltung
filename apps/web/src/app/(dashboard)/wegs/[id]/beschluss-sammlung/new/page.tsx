import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import BeschlussSammlungForm from "./beschluss-form";
import { createBeschlussSammlungEntry } from "./actions";
import type { Database } from "@/lib/supabase/database.types";

type WegRow = Database["public"]["Tables"]["weg"]["Row"];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function BeschlussSammlungNewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!UUID_RE.test(id)) {
    notFound();
  }

  const supabase = await createClient();
  const { data: weg, error } = await supabase
    .from("weg")
    .select("id, name")
    .eq("id", id)
    .single<Pick<WegRow, "id" | "name">>();

  if (error || !weg) {
    if (error?.code === "PGRST116") notFound();
    console.error("[beschluss-sammlung/new] weg select failed:", error);
    throw new Error("WEG konnte nicht geladen werden.");
  }

  const boundAction = createBeschlussSammlungEntry.bind(null, id);

  return (
    <section className="mx-auto max-w-2xl space-y-6 px-6 py-12">
      <header>
        <p className="mb-2 text-sm text-[color:var(--color-muted-foreground)]">
          <Link
            href={`/wegs/${id}/beschluss-sammlung`}
            className="underline underline-offset-4 hover:text-[color:var(--color-foreground)]"
          >
            ← Beschluss-Sammlung
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Neuer Eintrag — {weg.name}
        </h1>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Beschluss erfassen</CardTitle>
          <CardDescription>
            Einträge sind unveränderlich (§ 24 Abs. 7 WEG). Bitte den
            vollständigen Beschlusstext eintragen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BeschlussSammlungForm action={boundAction} />
        </CardContent>
      </Card>
    </section>
  );
}
