import { notFound } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import type { ComponentProps } from "react";
import {
  CalendarClock,
  FileText,
  Home,
  Pencil,
  Plus,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardHeader,
  CardContent,
} from "@/components/ui/card";
import { ActionBar } from "@/components/ui/action-bar";
import { AttentionList, type AttentionItem } from "@/components/ui/attention-list";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { EntityList, EntityListItem } from "@/components/ui/entity-list";
import { InsightCard } from "@/components/ui/insight-card";
import { Label } from "@/components/ui/label";
import { MetricStrip } from "@/components/ui/metric-strip";
import { NextStepPanel } from "@/components/ui/next-step-panel";
import { OperationalHero } from "@/components/ui/operational-hero";
import { SectionHeader } from "@/components/ui/section-header";
import { LifecycleBadge } from "@/components/ui/status-badge";
import type { Database } from "@/lib/supabase/database.types";
import { DeletePersonButton } from "./personen/delete-person-button";

// Server Component — RLS scopes all SELECTs to the user's tenant automatically.
// The middleware (apps/web/src/middleware.ts) refreshes the session and passes
// the user JWT into PostgREST via the supabase-ssr cookies adapter, so the
// policy `tenant_id = (auth.jwt() ->> 'tenant_id')::uuid` runs server-side on
// every row — no client-side tenant filter, no service-role key in this path.

type WegRow = Database["public"]["Tables"]["weg"]["Row"];
type MeetingRow = Database["public"]["Tables"]["meeting"]["Row"];
type UnitRow = Database["public"]["Tables"]["unit"]["Row"];
type PersonRow = Database["public"]["Tables"]["person"]["Row"];

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

const STATUS_BADGE: Record<
  MeetingRow["status"],
  ComponentProps<typeof LifecycleBadge>["status"]
> = {
  entwurf: "entwurf",
  eingeladen: "eingeladen",
  laufend: "laufend",
  beendet: "beendet",
  abgesagt: "abgesagt",
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

  const { data: persons, error: personsError } = await supabase
    .from("person")
    .select("*")
    .order("nachname", { ascending: true })
    .order("vorname", { ascending: true })
    .returns<PersonRow[]>();

  if (personsError) {
    console.error("[wegs/[id]] persons select failed:", personsError);
  }

  const meetingRows: MeetingRow[] = meetings ?? [];
  const unitRows: UnitRow[] = units ?? [];
  const personRows: PersonRow[] = persons ?? [];
  const missingAddress = !weg.adresse;
  const hasUnits = unitRows.length > 0;
  const hasPersons = personRows.length > 0;
  const hasMeetings = meetingRows.length > 0;
  const openMeetings = meetingRows.filter(
    (meeting) => meeting.status !== "beendet" && meeting.status !== "abgesagt",
  );
  const attentionItems: AttentionItem[] = [
    missingAddress
      ? {
          title: "Adresse fehlt",
          description:
            "Die Adresse hilft bei Dokumenten, Einladungen und eindeutiger Zuordnung.",
          action: (
            <Button asChild variant="outline" size="sm">
              <Link href={`/wegs/${id}/edit` as Route}>Adresse ergänzen</Link>
            </Button>
          ),
        }
      : {
          title: "Stammdaten mit Adresse",
          description: "Die WEG ist eindeutig beschreibbar.",
          tone: "done",
        },
    !hasUnits
      ? {
          title: "Keine Wohneinheiten erfasst",
          description:
            "Eigentümerschaften und Stimmrechte brauchen zuerst Einheiten.",
          action: (
            <Button asChild variant="outline" size="sm">
              <Link href={`/wegs/${id}/einheiten/new`}>
                Einheit anlegen
              </Link>
            </Button>
          ),
        }
      : {
          title: "Wohneinheiten vorhanden",
          description: `${unitRows.length} Einheit${unitRows.length === 1 ? "" : "en"} erfasst.`,
          tone: "done",
        },
    !hasPersons
      ? {
          title: "Keine Personen erfasst",
          description:
            "Einladungen, Eigentümerlisten und Stimmrechte benötigen Personen.",
          action: (
            <Button asChild variant="outline" size="sm">
              <Link href={`/wegs/${id}/personen/new` as Route}>
                Person anlegen
              </Link>
            </Button>
          ),
        }
      : {
          title: "Personen vorhanden",
          description: `${personRows.length} Kontakt${personRows.length === 1 ? "" : "e"} im Mandanten.`,
          tone: "done",
        },
  ];
  const nextStep = !hasUnits
    ? {
        title: "Wohneinheiten anlegen",
        description:
          "Damit Eigentümerschaften und Stimmrechte historisch korrekt abgebildet werden können.",
        href: `/wegs/${id}/einheiten/new`,
        label: "Einheit anlegen",
        tone: "warning" as const,
      }
    : !hasPersons
      ? {
          title: "Personen erfassen",
          description:
            "Für Einladungen, Eigentümerschaften und Abstimmungen fehlen noch Kontakte.",
          href: `/wegs/${id}/personen/new` as Route,
          label: "Person anlegen",
          tone: "warning" as const,
        }
      : !hasMeetings
        ? {
            title: "Erste Versammlung vorbereiten",
            description:
              "Die Grundlagen sind angelegt. Jetzt kann der erste Versammlungsprozess starten.",
            href: `/wegs/${id}/versammlungen/new`,
            label: "Versammlung anlegen",
            tone: "default" as const,
          }
        : {
            title: openMeetings.length > 0
              ? "Offene Versammlung fortführen"
              : "Nächste Versammlung planen",
            description:
              openMeetings.length > 0
                ? "Es gibt einen laufenden oder vorbereiteten Versammlungsprozess."
                : "Die WEG-Grundlagen stehen. Planen Sie den nächsten Verwaltungstermin.",
            href: openMeetings[0]
              ? `/versammlungen/${openMeetings[0].id}`
              : `/wegs/${id}/versammlungen/new`,
            label: openMeetings[0] ? "Versammlung öffnen" : "Versammlung anlegen",
            tone: openMeetings.length > 0 ? ("default" as const) : ("success" as const),
          };

  return (
    <section className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <OperationalHero
        eyebrow={
          <Link
            href="/wegs"
            className="underline underline-offset-4 hover:text-[color:var(--color-foreground)]"
          >
            Zurück zur WEG-Liste
          </Link>
        }
        title={weg.name}
        description={
          weg.adresse ?? (
            <span className="italic text-[color:var(--color-muted-foreground)]">
              Adresse nicht hinterlegt
            </span>
          )
        }
        status={
          <LifecycleBadge
            status={
              missingAddress || !hasUnits || !hasPersons ? "offen" : "erledigt"
            }
          >
            {missingAddress || !hasUnits || !hasPersons
              ? "Grundlagen offen"
              : "Arbeitsbereit"}
          </LifecycleBadge>
        }
        insight={
          missingAddress || !hasUnits || !hasPersons
            ? "Diese WEG ist angelegt, aber noch nicht vollständig arbeitsfähig."
            : "Die wichtigsten Grundlagen sind vorhanden. Der nächste Schritt liegt im Versammlungs- oder Finanzprozess."
        }
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/wegs/${id}/edit` as Route}>
                <Pencil className="size-4" aria-hidden="true" />
                WEG bearbeiten
              </Link>
            </Button>
            <Button asChild>
              <Link href={`/wegs/${id}/versammlungen/new`}>
                <Plus className="size-4" aria-hidden="true" />
                Neue Versammlung
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <NextStepPanel
          title={nextStep.title}
          description={nextStep.description}
          reason="Priorisiert aus Stammdaten, Einheiten, Personen und offenen Versammlungen."
          tone={nextStep.tone}
          action={
            <Button asChild>
              <Link href={nextStep.href as Route}>{nextStep.label}</Link>
            </Button>
          }
        />
        <InsightCard
          title="WEG-Lage"
          description={
            openMeetings.length > 0
              ? `${openMeetings.length} Versammlung${openMeetings.length === 1 ? "" : "en"} sind noch offen.`
              : "Aktuell ist kein offener Versammlungsprozess sichtbar."
          }
          icon={<CalendarClock />}
        />
      </div>

      <MetricStrip
        items={[
          {
            label: "Wohneinheiten",
            value: unitRows.length,
            hint: "Einheiten dieser Gemeinschaft.",
            icon: <Home />,
          },
          {
            label: "Personen",
            value: personRows.length,
            hint: "Im Mandanten erfasste Kontakte.",
            icon: <Users />,
          },
          {
            label: "Versammlungen",
            value: meetingRows.length,
            hint: "Zuletzt geladene Termine.",
            icon: <CalendarClock />,
          },
          {
            label: "Beschlüsse",
            value: "Register",
            hint: "Beschluss-Sammlung separat öffnen.",
            icon: <FileText />,
          },
        ]}
      />

      <AttentionList items={attentionItems} />

      <Card id="stammdaten">
        <CardHeader>
          <SectionHeader
            title="Stammdaten"
            description="Basis-Informationen dieser WEG."
          />
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
            <p className="whitespace-pre-line text-sm">
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

      <Card id="wohneinheiten">
        <CardHeader>
          <SectionHeader
            title="Wohneinheiten"
            description="Alle Einheiten dieser WEG mit Miteigentumsanteilen."
            meta={<span>{unitRows.length}</span>}
            actions={
              <Button asChild variant="outline" size="sm">
                <Link href={`/wegs/${id}/einheiten/new`}>
                  <Plus className="size-4" aria-hidden="true" />
                  Einheit anlegen
                </Link>
              </Button>
            }
          />
        </CardHeader>
        <CardContent>
          {unitRows.length === 0 ? (
            <EmptyState
              title="Noch keine Wohneinheit angelegt"
              description="Erfassen Sie Einheiten, damit Eigentümerschaften und Stimmrechte sauber zugeordnet werden."
              icon={<Home />}
              action={
                <Button asChild size="sm">
                  <Link href={`/wegs/${id}/einheiten/new`}>
                    Erste Einheit anlegen
                  </Link>
                </Button>
              }
            />
          ) : (
            <EntityList
              aria-label="Wohneinheiten der WEG"
              className="rounded-none border-0 shadow-none"
            >
              {unitRows.map((unit) => (
                <EntityListItem
                  key={unit.id}
                  leading={<Home className="size-4" aria-hidden="true" />}
                  title={unit.bezeichnung}
                  description={`MEA: ${unit.mea_zaehler}/${unit.mea_nenner}`}
                  actions={
                    <>
                      <Button asChild variant="outline" size="sm">
                        <Link
                          href={
                            `/wegs/${id}/einheiten/${unit.id}/edit` as Route
                          }
                          aria-label={`${unit.bezeichnung} bearbeiten`}
                        >
                          Bearbeiten
                        </Link>
                      </Button>
                      <Button asChild variant="ghost" size="sm">
                        <Link
                          href={`/wegs/${id}/einheiten/${unit.id}/eigentuemerschaft`}
                          aria-label={`Eigentümer von ${unit.bezeichnung} anzeigen`}
                        >
                          Eigentümer
                        </Link>
                      </Button>
                    </>
                  }
                />
              ))}
            </EntityList>
          )}
        </CardContent>
      </Card>

      <Card id="personen">
        <CardHeader>
          <SectionHeader
            title="Personen"
            description="Alle Personen in Ihrem Mandanten."
            meta={<span>{personRows.length}</span>}
            actions={
              <Button asChild variant="outline" size="sm">
                <Link href={`/wegs/${id}/personen/new` as Route}>
                  <Plus className="size-4" aria-hidden="true" />
                  Person anlegen
                </Link>
              </Button>
            }
          />
        </CardHeader>
        <CardContent>
          {personRows.length === 0 ? (
            <EmptyState
              title="Noch keine Personen angelegt"
              description="Erfassen Sie Eigentümer, Bevollmächtigte oder weitere Kontakte im Mandanten."
              icon={<Users />}
              action={
                <Button asChild size="sm">
                  <Link href={`/wegs/${id}/personen/new` as Route}>
                    Erste Person anlegen
                  </Link>
                </Button>
              }
            />
          ) : (
            <EntityList
              aria-label="Personen der WEG"
              className="rounded-none border-0 shadow-none"
            >
              {personRows.map((person) => (
                <EntityListItem
                  key={person.id}
                  leading={<Users className="size-4" aria-hidden="true" />}
                  title={`${person.nachname}, ${person.vorname}`}
                  description={
                    <span className="space-y-0.5">
                      <span className="block">
                        Anschrift:{" "}
                        {person.anschrift ?? (
                          <span className="italic">nicht hinterlegt</span>
                        )}
                      </span>
                      <span className="block">
                        E-Mail:{" "}
                        {person.email ?? (
                          <span className="italic">nicht hinterlegt</span>
                        )}
                      </span>
                      <span className="block">
                        Telefon:{" "}
                        {person.telefon ?? (
                          <span className="italic">nicht hinterlegt</span>
                        )}
                      </span>
                    </span>
                  }
                  actions={
                    <>
                      <Button asChild variant="outline" size="sm">
                        <Link
                          href={`/wegs/${id}/personen/${person.id}/edit` as Route}
                          aria-label={`${person.vorname} ${person.nachname} bearbeiten`}
                        >
                          Bearbeiten
                        </Link>
                      </Button>
                      <DeletePersonButton wegId={id} personId={person.id} />
                    </>
                  }
                />
              ))}
            </EntityList>
          )}
        </CardContent>
      </Card>

      <Card id="versammlungen">
        <CardHeader>
          <SectionHeader
            title="Versammlungen"
            description="Die letzten zehn Versammlungen dieser WEG."
            meta={<span>{meetingRows.length}</span>}
            actions={
              <Button asChild variant="outline" size="sm">
                <Link href={`/wegs/${id}/versammlungen/new`}>
                  <Plus className="size-4" aria-hidden="true" />
                  Versammlung anlegen
                </Link>
              </Button>
            }
          />
        </CardHeader>
        <CardContent>
          {meetingRows.length === 0 ? (
            <EmptyState
              title="Noch keine Versammlung angelegt"
              description="Starten Sie eine Versammlung, sobald Tagesordnung, Einladung oder Beschlüsse vorbereitet werden sollen."
              icon={<CalendarClock />}
              action={
                <Button asChild size="sm">
                  <Link href={`/wegs/${id}/versammlungen/new`}>
                    Erste Versammlung anlegen
                  </Link>
                </Button>
              }
            />
          ) : (
            <EntityList
              aria-label="Versammlungen der WEG"
              className="rounded-none border-0 shadow-none"
            >
              {meetingRows.map((m) => (
                <EntityListItem
                  key={m.id}
                  leading={
                    <CalendarClock className="size-4" aria-hidden="true" />
                  }
                  title={m.titel}
                  description={
                    m.termin_von ? (
                      formatDateLongDE(m.termin_von)
                    ) : (
                      <span className="italic">Termin offen</span>
                    )
                  }
                  meta={<span>Modus: {MODUS_LABEL[m.modus] ?? m.modus}</span>}
                  badges={
                    <LifecycleBadge status={STATUS_BADGE[m.status]}>
                      {STATUS_LABEL[m.status] ?? m.status}
                    </LifecycleBadge>
                  }
                  actions={
                    <Button asChild variant="outline" size="sm">
                      <Link
                        href={`/versammlungen/${m.id}`}
                        aria-label={`Versammlung ${
                          m.titel
                        } öffnen`}
                      >
                        Öffnen
                      </Link>
                    </Button>
                  }
                />
              ))}
            </EntityList>
          )}
        </CardContent>
      </Card>

      <Card id="beschluesse">
        <CardHeader>
          <SectionHeader
            title="Beschluss-Sammlung"
            description="Amtliches Register gem. § 24 Abs. 7 WEG."
            actions={
              <Button asChild variant="outline" size="sm">
                <Link
                  href={`/wegs/${id}/beschluss-sammlung`}
                  aria-label="Beschluss-Sammlung dieser WEG öffnen"
                >
                  Öffnen
                </Link>
              </Button>
            }
          />
        </CardHeader>
      </Card>

      <ActionBar
        secondary={
          <>
            <Button asChild variant="outline">
              <Link href={`/wegs/${id}/finanzen` as Route}>Finanzen</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/wegs/${id}/beschluss-sammlung`}>
                Beschluss-Sammlung
              </Link>
            </Button>
          </>
        }
        primary={
          <Button asChild>
            <Link href={`/wegs/${id}/versammlungen/new`}>
              Neue Versammlung anlegen
            </Link>
          </Button>
        }
      />
    </section>
  );
}
