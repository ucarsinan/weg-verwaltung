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
import { Label } from "@/components/ui/label";
import type { Database } from "@/lib/supabase/database.types";

// Server Component — RLS scopes all SELECTs to the user's tenant automatically.
// The middleware (apps/web/src/middleware.ts) refreshes the session and passes
// the user JWT into PostgREST via the supabase-ssr cookies adapter, so the
// policy `tenant_id = (auth.jwt() ->> 'tenant_id')::uuid` runs server-side on
// every row — no client-side tenant filter, no service-role key in this path.

type WegRow = Database["public"]["Tables"]["weg"]["Row"];
type MeetingRow = Database["public"]["Tables"]["meeting"]["Row"];
type UnitRow = Database["public"]["Tables"]["unit"]["Row"];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DATE_LONG: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "long",
  year: "numeric",
};

// § 5.6 — DIN-5008-style date in DE locale. Pure helper, no Intl re-allocation
// in the hot loop below.
function formatDateLongDE(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", DATE_LONG);
}

// § 5.1 satz 1 / § 5.2 — sichtbare Sprache statt rohen Enum-Codes.
// The DB stores `modus` / `status` as CHECK-constrained strings (0004), so
// we translate at the render edge instead of leaking column-internals into
// the UI. Unknown values fall back to the raw code so a future migration
// (e.g. adding a status) is degraded-but-safe rather than crashing.
const MODUS_LABEL: Record<MeetingRow["modus"], string> = {
  praesenz: "Präsenz",
  hybrid: "Hybrid",
  virtuell: "Virtuell",
  umlauf: "Umlauf",
};

const STATUS_LABEL: Record<MeetingRow["status"], string> = {
  entwurf: "Entwurf",
  eingeladen: "Eingeladen",
  laufend: "Laufend",
  beendet: "Beendet",
  abgesagt: "Abgesagt",
};

export default async function WegDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // UUID guard — if `id` is malformed, don't even ask Postgres. Saves a
  // round-trip and avoids a PGRST22P02-style error path leaking into logs.
  if (!UUID_RE.test(id)) {
    notFound();
  }

  const supabase = await createClient();

  const { data: weg, error: wegError } = await supabase
    .from("weg")
    .select("*")
    .eq("id", id)
    .single<WegRow>();

  if (wegError || !weg) {
    // PGRST116 = "single() returned 0 rows". Because the SELECT is RLS-scoped
    // to the user's tenant, "0 rows" is indistinguishable from "exists in
    // another tenant" — that's the correct security posture: we MUST NOT
    // leak whether a foreign-tenant resource exists. See § 3 isolation model.
    if (wegError?.code === "PGRST116") {
      notFound();
    }
    // Server-side log only — never expose raw PostgREST/PG errors to the user.
    console.error("[wegs/[id]] select failed:", wegError);
    throw new Error("WEG konnte nicht geladen werden.");
  }

  const { data: meetings, error: meetingsError } = await supabase
    .from("meeting")
    .select("*")
    .eq("weg_id", id)
    // termin_von is nullable in the schema (0004) — order it with nulls last
    // so unscheduled drafts don't dominate the top of the list.
    .order("termin_von", { ascending: false, nullsFirst: false })
    .limit(10)
    .returns<MeetingRow[]>();

  if (meetingsError) {
    // Non-fatal: the page still renders Stammdaten + Einheiten + Aktionen.
    console.error("[wegs/[id]] meetings select failed:", meetingsError);
  }

  const { data: units, error: unitsError } = await supabase
    .from("unit")
    .select("*")
    .eq("weg_id", id)
    .order("bezeichnung", { ascending: true })
    .returns<UnitRow[]>();

  if (unitsError) {
    // Non-fatal: page still renders, units card degrades to empty state.
    console.error("[wegs/[id]] units select failed:", unitsError);
  }

  const meetingRows: MeetingRow[] = meetings ?? [];
  const unitRows: UnitRow[] = units ?? [];

  return (
    <section className="mx-auto max-w-3xl space-y-6 px-6 py-12">
      <header className="flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {weg.name}
          </h1>
          <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
            <Link
              href="/wegs"
              className="underline underline-offset-4 hover:text-[color:var(--color-foreground)]"
            >
              ← Zurück zur WEG-Liste
            </Link>
          </p>
        </div>
      </header>

      {/* ────────────────────────── Stammdaten ────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Stammdaten</CardTitle>
          <CardDescription>Basis-Informationen dieser WEG.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <p className="text-sm">{weg.name}</p>
          </div>
          <div className="space-y-1.5">
            <Label>Adresse</Label>
            {/* § 5.6 — sichere Defaults: leere optionale Felder werden
                explizit als "nicht hinterlegt" gerendert, nicht als leerer
                String. Italic + muted, damit der Zustand erkennbar ist,
                ohne als Fehler zu schreien. */}
            <p className="text-sm">
              {weg.adresse ?? (
                <span className="italic text-[color:var(--color-muted-foreground)]">
                  nicht hinterlegt
                </span>
              )}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Angelegt am</Label>
            <p className="text-sm">{formatDateLongDE(weg.created_at)}</p>
          </div>
        </CardContent>
      </Card>

      {/* ─────────────────────────── Wohneinheiten ────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Wohneinheiten</CardTitle>
              <CardDescription className="mt-1.5">
                Alle Einheiten dieser WEG mit Miteigentumsanteilen.
              </CardDescription>
            </div>
            <Link
              href={`/wegs/${id}/einheiten/new`}
              className="shrink-0 text-sm underline underline-offset-4 hover:text-[var(--color-accent)]"
            >
              Wohneinheit anlegen
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {unitRows.length === 0 ? (
            <p
              role="status"
              className="rounded-md border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-muted)]"
            >
              Noch keine Wohneinheit angelegt.{" "}
              <Link
                href={`/wegs/${id}/einheiten/new`}
                className="underline underline-offset-4 hover:text-[var(--color-accent)]"
              >
                Jetzt erste Einheit anlegen
              </Link>
              .
            </p>
          ) : (
            <ul
              aria-label="Wohneinheiten der WEG"
              className="divide-y divide-[var(--color-border)]"
            >
              {unitRows.map((unit) => (
                <li
                  key={unit.id}
                  className="flex items-center justify-between gap-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {unit.bezeichnung}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                      MEA: {unit.mea_zaehler}/{unit.mea_nenner}
                    </p>
                  </div>
                  <Link
                    href={`/wegs/${id}/einheiten/${unit.id}/eigentuemerschaft`}
                    className="shrink-0 text-sm underline underline-offset-4 hover:text-[var(--color-accent)]"
                    aria-label={`Eigentümer von ${unit.bezeichnung} anzeigen`}
                  >
                    Eigentümer →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ───────────────────────── Versammlungen ──────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Versammlungen</CardTitle>
          <CardDescription>
            Die letzten zehn Versammlungen dieser WEG.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {meetingRows.length === 0 ? (
            // § 5.10 SR-pattern #2 — empty/loading states get role="status"
            // so screen readers announce the absence instead of silent UI.
            <p
              role="status"
              className="rounded-md border border-dashed border-[color:var(--color-border)] p-6 text-center text-sm text-[color:var(--color-muted-foreground)]"
            >
              Noch keine Versammlung für diese WEG angelegt.
            </p>
          ) : (
            <ul
              aria-label="Versammlungen der WEG"
              className="divide-y divide-[color:var(--color-border)]"
            >
              {meetingRows.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {m.termin_von ? (
                        formatDateLongDE(m.termin_von)
                      ) : (
                        <span className="italic text-[color:var(--color-muted-foreground)]">
                          Termin offen
                        </span>
                      )}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[color:var(--color-muted-foreground)]">
                      <span className="inline-flex items-center rounded-full border border-[color:var(--color-border)] px-2 py-0.5">
                        Modus: {MODUS_LABEL[m.modus] ?? m.modus}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-[color:var(--color-border)] px-2 py-0.5">
                        Status: {STATUS_LABEL[m.status] ?? m.status}
                      </span>
                    </p>
                  </div>
                  <Link
                    href={`/versammlungen/${m.id}`}
                    className="shrink-0 text-sm underline underline-offset-4 hover:text-[color:var(--color-foreground)]"
                    aria-label={`Versammlung vom ${
                      m.termin_von
                        ? formatDateLongDE(m.termin_von)
                        : "offenem Termin"
                    } öffnen`}
                  >
                    Detail ansehen →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ───────────────────────── Beschluss-Sammlung ───────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Beschluss-Sammlung</CardTitle>
              <CardDescription>
                Amtliches Register gem. § 24 Abs. 7 WEG.
              </CardDescription>
            </div>
            <Link
              href={`/wegs/${id}/beschluss-sammlung`}
              className="shrink-0 text-sm underline underline-offset-4 hover:text-[var(--color-accent)]"
              aria-label="Beschluss-Sammlung dieser WEG öffnen"
            >
              Öffnen →
            </Link>
          </div>
        </CardHeader>
      </Card>

      {/* ─────────────────────────── Aktionen ─────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Aktionen</CardTitle>
          <CardDescription>
            Ohne Verzögerung handlungsfähig — § 5.1 Tastatur-First.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {/* Forward refs — these routes 404 today and land in later
              iterations (Versammlung-Anlage / WEG-Edit). Linked here so
              the navigation surface is discoverable from day one. */}
          <Button asChild>
            <Link href={`/wegs/${id}/versammlungen/new`}>
              Neue Versammlung anlegen
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/wegs/${id}/edit`}>WEG bearbeiten</Link>
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}
