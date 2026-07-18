import {
  Building2,
  CalendarClock,
  ClipboardCheck,
  ListChecks,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import type { ComponentProps } from "react";
import { AttentionList, type AttentionItem } from "@/components/ui/attention-list";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { EntityList, EntityListItem } from "@/components/ui/entity-list";
import { InsightCard } from "@/components/ui/insight-card";
import { MetricStrip } from "@/components/ui/metric-strip";
import { NextStepPanel } from "@/components/ui/next-step-panel";
import { OperationalHero } from "@/components/ui/operational-hero";
import { SectionHeader } from "@/components/ui/section-header";
import { LifecycleBadge } from "@/components/ui/status-badge";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { readTenantClaims } from "@/modules/identity";

type MeetingRow = Database["public"]["Tables"]["meeting"]["Row"];

const DATE_SHORT: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
};

const STATUS_LABEL: Record<string, string> = {
  entwurf: "Entwurf",
  eingeladen: "Eingeladen",
  laufend: "Laufend",
  beendet: "Beendet",
  abgesagt: "Abgesagt",
};

const STATUS_BADGE: Record<
  string,
  ComponentProps<typeof LifecycleBadge>["status"]
> = {
  entwurf: "entwurf",
  eingeladen: "eingeladen",
  laufend: "laufend",
  beendet: "beendet",
  abgesagt: "abgesagt",
};

function formatDateShortDE(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", DATE_SHORT);
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const claimsPromise = supabase.auth.getClaims();
  const wegCountPromise = supabase
    .from("weg")
    .select("id", { count: "exact", head: true });
  const openMeetingsCountPromise = supabase
    .from("meeting")
    .select("id", { count: "exact", head: true })
    .not("status", "in", "(beendet,abgesagt)");
  const recentMeetingsPromise = supabase
    .from("meeting")
    .select("*")
    .order("termin_von", { ascending: true, nullsFirst: false })
    .limit(4)
    .returns<MeetingRow[]>();

  const [
    { data },
    wegCountResult,
    openMeetingsCountResult,
    recentMeetingsResult,
  ] = await Promise.all([
    claimsPromise,
    wegCountPromise,
    openMeetingsCountPromise,
    recentMeetingsPromise,
  ]);

  if (wegCountResult.error) {
    console.error("[dashboard] weg count failed:", wegCountResult.error);
  }
  if (openMeetingsCountResult.error) {
    console.error(
      "[dashboard] open meeting count failed:",
      openMeetingsCountResult.error,
    );
  }
  if (recentMeetingsResult.error) {
    console.error(
      "[dashboard] recent meetings select failed:",
      recentMeetingsResult.error,
    );
  }

  const claims = readTenantClaims(data?.claims);
  const email = claims.email ?? "nicht verfügbar";
  const tenantId = claims.tenantId ?? "nicht verfügbar";
  const role = claims.role ?? "nicht verfügbar";
  const recentMeetings = recentMeetingsResult.data ?? [];
  const wegCount = wegCountResult.count ?? 0;
  const openMeetingCount = openMeetingsCountResult.count ?? 0;
  const hasWegs = wegCount > 0;
  const hasOpenMeetings = openMeetingCount > 0;

  const nextStep = !hasWegs
    ? {
        title: "Erste WEG anlegen",
        description:
          "Ohne WEG gibt es noch keinen Arbeitskontext für Einheiten, Eigentümer und Versammlungen.",
        href: "/wegs/new",
        label: "WEG anlegen",
        tone: "warning" as const,
      }
    : hasOpenMeetings
      ? {
          title: "Offene Versammlungen prüfen",
          description:
            "Es gibt laufende oder vorbereitete Versammlungen, die den nächsten Arbeitsschritt bestimmen.",
          href: "/wegs",
          label: "WEGs öffnen",
          tone: "default" as const,
        }
      : {
          title: "Nächste Versammlung vorbereiten",
          description:
            "Die Grundlagen sind sichtbar, aktuell gibt es aber keine offenen Versammlungen.",
          href: "/wegs",
          label: "WEG auswählen",
          tone: "success" as const,
        };

  const attentionItems: AttentionItem[] = [
    !hasWegs
      ? {
          title: "Noch kein Verwaltungsbestand",
          description:
            "Legen Sie zuerst eine WEG an, damit die operative Arbeit starten kann.",
          action: (
            <Button asChild variant="outline" size="sm">
              <Link href="/wegs/new">WEG anlegen</Link>
            </Button>
          ),
        }
      : {
          title: "WEG-Bestand vorhanden",
          description: `${wegCount} Gemeinschaft${wegCount === 1 ? "" : "en"} im aktuellen Mandanten.`,
          tone: "done",
        },
    hasOpenMeetings
      ? {
          title: "Versammlungen brauchen Aufmerksamkeit",
          description: `${openMeetingCount} Versammlung${openMeetingCount === 1 ? "" : "en"} sind noch nicht abgeschlossen.`,
          action: (
            <Button asChild variant="outline" size="sm">
              <Link href="/wegs">Arbeitskontext öffnen</Link>
            </Button>
          ),
        }
      : {
          title: "Keine offenen Versammlungen",
          description:
            "Aktuell ist kein laufender Versammlungsprozess offen.",
          tone: "done",
        },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <OperationalHero
        title="Operativer Überblick"
        description="Alle relevanten Einstiegspunkte für Bestand, Versammlungen und Mandantenkontext an einem Ort."
        status={
          <LifecycleBadge status={hasOpenMeetings ? "offen" : "erledigt"}>
            {hasOpenMeetings ? "Handlungsbedarf" : "Ruhige Lage"}
          </LifecycleBadge>
        }
        insight={
          hasOpenMeetings
            ? `${openMeetingCount} offene Versammlung${openMeetingCount === 1 ? "" : "en"} sollten vor neuen Verwaltungsschritten geprüft werden.`
            : "Keine offenen Versammlungen. Der nächste sinnvolle Schritt beginnt über eine konkrete WEG."
        }
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/wegs">WEGs öffnen</Link>
            </Button>
            <Button asChild>
              <Link href="/wegs/new">Neue WEG</Link>
            </Button>
          </>
        }
        eyebrow={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>Dashboard</span>
            <span aria-hidden="true">·</span>
            <span>{email}</span>
            <span aria-hidden="true">·</span>
            <span>Rolle: {role}</span>
          </span>
        }
      />

      <MetricStrip
        items={[
          {
            label: "WEGs",
            value: wegCountResult.count ?? "—",
            hint: "Verwaltete Gemeinschaften im aktuellen Mandanten.",
            icon: <Building2 />,
          },
          {
            label: "Offene Versammlungen",
            value: openMeetingsCountResult.count ?? "—",
            hint: "Nicht beendet oder abgesagt.",
            icon: <CalendarClock />,
          },
          {
            label: "Arbeitspriorität",
            value: hasOpenMeetings ? "Prüfen" : "Planen",
            hint: hasOpenMeetings
              ? "Offene Versammlungen zuerst bearbeiten."
              : "Nächsten Arbeitskontext auswählen.",
            icon: <ListChecks />,
          },
          {
            label: "Protokolle",
            value: recentMeetings.length,
            hint: "Aktuelle Arbeitsfläche über Versammlungen.",
            icon: <ClipboardCheck />,
          },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <NextStepPanel
          title={nextStep.title}
          description={nextStep.description}
          reason="Automatisch abgeleitet aus Bestand, offenen Versammlungen und verfügbarem Arbeitskontext."
          tone={nextStep.tone}
          action={
            <Button asChild>
              <Link href={nextStep.href as Route}>{nextStep.label}</Link>
            </Button>
          }
        />
        <InsightCard
          title="RLS-Kontext aktiv"
          description="Dashboard-Werte werden serverseitig im Mandantenkontext gelesen; der Zugriff bleibt sichtbar, aber nicht direkt editierbar."
          icon={<ShieldCheck />}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <section className="space-y-4">
          <SectionHeader
            title="Heute wichtig"
            description="Kompakte Arbeitslage aus Bestand und offenen Prozessen."
          />
          <AttentionList items={attentionItems} />
        </section>
        <aside className="space-y-4">
          <SectionHeader
            title="Zugriff"
            description="JWT-Kontext der aktuellen Sitzung."
          />
          <dl className="space-y-3 rounded-lg border border-[color:var(--color-border)] bg-[linear-gradient(180deg,color-mix(in_oklch,var(--color-card)_96%,white),var(--color-card))] p-4 text-sm shadow-[var(--shadow-card)]">
            <div className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-background)]/72 p-3">
              <dt className="text-xs font-semibold uppercase text-[color:var(--color-muted-foreground)]">
                Rolle
              </dt>
              <dd className="mt-1 break-words font-mono text-[color:var(--color-foreground)]">
                {role}
              </dd>
            </div>
            <div className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-background)]/72 p-3">
              <dt className="text-xs font-semibold uppercase text-[color:var(--color-muted-foreground)]">
                tenant_id
              </dt>
              <dd className="mt-1 break-all font-mono text-xs text-[color:var(--color-foreground)]">
                {tenantId}
              </dd>
            </div>
          </dl>
        </aside>
      </div>

      <section className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <SectionHeader
            title="Aktuelle Versammlungen"
            description="Die nächsten oder zuletzt geplanten Termine für einen klaren Arbeitseinstieg."
          />
          <Button asChild variant="outline" size="sm">
            <Link href="/wegs">WEGs öffnen</Link>
          </Button>
        </div>
        {recentMeetings.length === 0 ? (
          <EmptyState
            title="Keine Versammlungen gefunden"
            description="Legen Sie zuerst eine WEG an und starten Sie dort die erste Versammlung."
            icon={<CalendarClock />}
            action={
              <Button asChild size="sm">
                <Link href="/wegs/new">Erste WEG anlegen</Link>
              </Button>
            }
          />
        ) : (
          <EntityList aria-label="Aktuelle Versammlungen">
            {recentMeetings.map((meeting) => (
              <EntityListItem
                key={meeting.id}
                title={
                  <Link
                    href={`/versammlungen/${meeting.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {meeting.titel}
                  </Link>
                }
                description={
                  meeting.termin_von
                    ? formatDateShortDE(meeting.termin_von)
                    : "Termin noch offen"
                }
                badges={
                  <LifecycleBadge
                    status={STATUS_BADGE[meeting.status] ?? "offen"}
                  >
                    {STATUS_LABEL[meeting.status] ?? meeting.status}
                  </LifecycleBadge>
                }
                actions={
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/versammlungen/${meeting.id}`}>Öffnen</Link>
                  </Button>
                }
              />
            ))}
          </EntityList>
        )}
      </section>
    </div>
  );
}
