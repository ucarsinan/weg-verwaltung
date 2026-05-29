import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import type {
  Database,
  BeschlussSammlungTyp,
  AnfechtungsStatus,
  AnfechtungsEventTyp,
} from "@/lib/supabase/database.types";

type BseRow =
  Database["public"]["Tables"]["beschluss_sammlung_entry"]["Row"];
type BaeRow =
  Database["public"]["Tables"]["beschluss_anfechtung_event"]["Row"];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DATE_LONG: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "long",
  year: "numeric",
};

function formatDateDE(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", DATE_LONG);
}

const TYP_LABEL: Record<BeschlussSammlungTyp, string> = {
  positiv_beschluss: "Positiv-Beschluss (angenommen)",
  negativ_beschluss: "Negativ-Beschluss (abgelehnt)",
  umlaufbeschluss: "Umlaufbeschluss",
};

const ANFECHTUNG_STATUS_LABEL: Record<AnfechtungsStatus, string> = {
  keine: "Keine Anfechtung",
  angefochten: "Angefochten",
  unwirksam_erklaert: "Für unwirksam erklärt",
};

const EVENT_TYP_LABEL: Record<AnfechtungsEventTyp, string> = {
  angefochten: "Klage erhoben",
  zurueckgenommen: "Klage zurückgenommen",
  unwirksam_erklaert: "Für unwirksam erklärt (rechtskräftig)",
  bestaetigt: "Klage abgewiesen / Beschluss bestätigt",
};

export default async function BeschlussSammlungDetailPage({
  params,
}: {
  params: Promise<{ id: string; entryId: string }>;
}) {
  const { id, entryId } = await params;

  if (!UUID_RE.test(id) || !UUID_RE.test(entryId)) {
    notFound();
  }

  const supabase = await createClient();

  const { data: entry, error } = await supabase
    .from("beschluss_sammlung_entry")
    .select("*")
    .eq("id", entryId)
    .eq("weg_id", id)
    .single<BseRow>();

  if (error || !entry) {
    if (error?.code === "PGRST116") notFound();
    console.error("[beschluss-sammlung/[entryId]] select failed:", error);
    throw new Error("Eintrag konnte nicht geladen werden.");
  }

  const { data: events, error: eventsError } = await supabase
    .from("beschluss_anfechtung_event")
    .select("*")
    .eq("bse_id", entryId)
    .order("datum", { ascending: true })
    .returns<BaeRow[]>();

  if (eventsError) {
    console.error("[beschluss-sammlung/[entryId]] events select failed:", eventsError);
  }

  const anfechtungEvents: BaeRow[] = events ?? [];

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
          Beschluss Nr. {entry.lfd_nr}
        </h1>
        <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
          {formatDateDE(entry.datum)} · {TYP_LABEL[entry.typ] ?? entry.typ}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Beschlusstext</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {entry.beschluss_text}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Metadaten</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Lfd. Nr.</Label>
            <p className="font-mono text-sm">#{entry.lfd_nr}</p>
          </div>
          <div className="space-y-1.5">
            <Label>Datum</Label>
            <p className="text-sm">{formatDateDE(entry.datum)}</p>
          </div>
          <div className="space-y-1.5">
            <Label>Typ</Label>
            <p className="text-sm">{TYP_LABEL[entry.typ] ?? entry.typ}</p>
          </div>
          <div className="space-y-1.5">
            <Label>Anfechtungsstatus</Label>
            <p className="text-sm">
              {ANFECHTUNG_STATUS_LABEL[entry.anfechtungsstatus] ??
                entry.anfechtungsstatus}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Erfasst am</Label>
            <p className="text-sm">{formatDateDE(entry.created_at)}</p>
          </div>
        </CardContent>
      </Card>

      {anfechtungEvents.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Anfechtungshistorie</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-[color:var(--color-border)]">
              {anfechtungEvents.map((ev) => (
                <li key={ev.id} className="space-y-1 py-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full border border-[color:var(--color-border)] px-2 py-0.5 text-xs">
                      {EVENT_TYP_LABEL[ev.event_typ] ?? ev.event_typ}
                    </span>
                    <span className="text-xs text-[color:var(--color-muted-foreground)]">
                      {formatDateDE(ev.datum)}
                    </span>
                    {ev.aktenzeichen ? (
                      <span className="font-mono text-xs text-[color:var(--color-muted-foreground)]">
                        Az. {ev.aktenzeichen}
                      </span>
                    ) : null}
                  </div>
                  {ev.bemerkung ? (
                    <p className="text-sm text-[color:var(--color-muted-foreground)]">
                      {ev.bemerkung}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}
