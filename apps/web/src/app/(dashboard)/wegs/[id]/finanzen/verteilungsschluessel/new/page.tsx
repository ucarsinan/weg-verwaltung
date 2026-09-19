import { notFound } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Database } from "@/lib/supabase/database.types";
import VerteilungsschluesselForm from "./verteilungsschluessel-form";

type WegRow = Database["public"]["Tables"]["weg"]["Row"];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NeuerVerteilungsschluesselPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: wegId } = await params;

  if (!UUID_RE.test(wegId)) {
    notFound();
  }

  const supabase = await createClient();

  const { data: weg, error: wegError } = await supabase
    .from("weg")
    .select("*")
    .eq("id", wegId)
    .single<WegRow>();

  if (wegError || !weg) {
    if (wegError?.code === "PGRST116") {
      notFound();
    }
    console.error("[verteilungsschluessel/new] WEG select failed:", wegError);
    throw new Error("WEG konnte nicht geladen werden.");
  }

  return (
    <section className="mx-auto max-w-2xl space-y-6 px-6 py-12">
      <header>
        <p className="text-sm text-[color:var(--color-muted-foreground)]">
          <Link
            href={`/wegs/${wegId}/finanzen/verteilungsschluessel` as Route}
            className="underline underline-offset-4 hover:text-[color:var(--color-foreground)]"
          >
            ← Zurück zu den Verteilungsschlüsseln
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Verteilungsschlüssel anlegen
        </h1>
        <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
          Für {weg.name}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Schlüssel und erste Version</CardTitle>
          <CardDescription>
            Der Schlüssel bleibt stabil, die Regel dahinter ist versioniert —
            eine spätere Beschlussänderung ersetzt die Version, nicht den
            Schlüssel.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VerteilungsschluesselForm wegId={wegId} />
        </CardContent>
      </Card>
    </section>
  );
}
