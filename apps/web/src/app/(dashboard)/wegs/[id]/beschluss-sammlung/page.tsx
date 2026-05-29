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
import { Button } from "@/components/ui/button";
import type {
  Database,
  BeschlussSammlungTyp,
  AnfechtungsStatus,
} from "@/lib/supabase/database.types";

type WegRow = Database["public"]["Tables"]["weg"]["Row"];
type BseRow =
  Database["public"]["Tables"]["beschluss_sammlung_entry"]["Row"];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DATE_SHORT: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
};

function formatDateDE(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", DATE_SHORT);
}

const TYP_LABEL: Record<BeschlussSammlungTyp, string> = {
  positiv_beschluss: "Positiv",
  negativ_beschluss: "Negativ",
  umlaufbeschluss: "Umlauf",
};

const ANFECHTUNG_LABEL: Record<AnfechtungsStatus, string> = {
  keine: "",
  angefochten: "Angefochten",
  unwirksam_erklaert: "Unwirksam",
};

export default async function BeschlussSammlungPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!UUID_RE.test(id)) {
    notFound();
  }

  const supabase = await createClient();

  const { data: weg, error: wegError } = await supabase
    .from("weg")
    .select("id, name")
    .eq("id", id)
    .single<Pick<WegRow, "id" | "name">>();

  if (wegError || !weg) {
    if (wegError?.code === "PGRST116") notFound();
    console.error("[beschluss-sammlung] weg select failed:", wegError);
    throw new Error("WEG konnte nicht geladen werden.");
  }

  const { data: entries, error: entriesError } = await supabase
    .from("beschluss_sammlung_entry")
    .select("*")
    .eq("weg_id", id)
    .order("lfd_nr", { ascending: true })
    .returns<BseRow[]>();

  if (entriesError) {
    console.error("[beschluss-sammlung] entries select failed:", entriesError);
  }

  const rows: BseRow[] = entries ?? [];

  return (
    <section className="mx-auto max-w-3xl space-y-6 px-6 py-12">
      <header className="flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-2 text-sm text-[color:var(--color-muted-foreground)]">
            <Link
              href={`/wegs/${id}`}
              className="underline underline-offset-4 hover:text-[color:var(--color-foreground)]"
            >
              ← {weg.name}
            </Link>
          </p>
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            Beschluss-Sammlung
          </h1>
          <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
            Amtliches Register gem. § 24 Abs. 7 WEG — unveränderlich.
          </p>
        </div>
        <Button asChild className="shrink-0">
          <Link href={`/wegs/${id}/beschluss-sammlung/new`}>
            Neuer Eintrag
          </Link>
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Einträge ({rows.length})</CardTitle>
          <CardDescription>
            Fortlaufend nummeriert. Kein Eintrag kann gelöscht oder geändert
            werden.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p
              role="status"
              className="rounded-md border border-dashed border-[color:var(--color-border)] p-6 text-center text-sm text-[color:var(--color-muted-foreground)]"
            >
              Noch keine Einträge vorhanden.{" "}
              <Link
                href={`/wegs/${id}/beschluss-sammlung/new`}
                className="underline underline-offset-4 hover:text-[color:var(--color-accent)]"
              >
                Ersten Eintrag anlegen
              </Link>
              .
            </p>
          ) : (
            <ul
              aria-label="Beschluss-Sammlung Einträge"
              className="divide-y divide-[color:var(--color-border)]"
            >
              {rows.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-start justify-between gap-4 py-4"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-[color:var(--color-muted-foreground)]">
                        #{entry.lfd_nr}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-[color:var(--color-border)] px-2 py-0.5 text-xs">
                        {TYP_LABEL[entry.typ] ?? entry.typ}
                      </span>
                      {entry.anfechtungsstatus !== "keine" ? (
                        <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">
                          {ANFECHTUNG_LABEL[entry.anfechtungsstatus]}
                        </span>
                      ) : null}
                      <span className="text-xs text-[color:var(--color-muted-foreground)]">
                        {formatDateDE(entry.datum)}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-sm text-[color:var(--color-foreground)]">
                      {entry.beschluss_text}
                    </p>
                  </div>
                  <Link
                    href={`/wegs/${id}/beschluss-sammlung/${entry.id}`}
                    className="shrink-0 text-sm underline underline-offset-4 hover:text-[color:var(--color-accent)]"
                    aria-label={`Beschluss Nr. ${entry.lfd_nr} öffnen`}
                  >
                    Detail →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
