import { notFound } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import type { ComponentProps } from "react";
import { Bot, CalendarClock, ClipboardList, Plus } from "lucide-react";
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
import { InsightCard } from "@/components/ui/insight-card";
import { NextStepPanel } from "@/components/ui/next-step-panel";
import { OperationalHero } from "@/components/ui/operational-hero";
import { ProcessRail } from "@/components/ui/process-rail";
import { SectionHeader } from "@/components/ui/section-header";
import { LifecycleBadge, StatusBadge } from "@/components/ui/status-badge";
import { type WorkflowStep } from "@/components/ui/workflow-timeline";
import { endMeeting, sendInvitation, startMeeting } from "./actions";
import { InvitationForm } from "./invitation-form";
import { MeetingStatusForm } from "./meeting-status-form";
import AgendaReviewPanel from "./agenda-review-panel";
import type { Database, MeetingModus, MeetingStatus } from "@/lib/supabase/database.types";

type MeetingRow = Database["public"]["Tables"]["meeting"]["Row"];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DATE_LONG: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

function formatDateLongDE(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", DATE_LONG);
}

const MODUS_LABEL: Record<MeetingModus, string> = {
  praesenz: "Präsenz",
  hybrid: "Hybrid",
  virtuell: "Virtuell",
  umlauf: "Umlauf",
};

const STATUS_LABEL: Record<MeetingStatus, string> = {
  entwurf: "Entwurf",
  eingeladen: "Eingeladen",
  laufend: "Laufend",
  beendet: "Beendet",
  abgesagt: "Abgesagt",
};

const STATUS_BADGE: Record<
  MeetingStatus,
  ComponentProps<typeof LifecycleBadge>["status"]
> = {
  entwurf: "entwurf",
  eingeladen: "eingeladen",
  laufend: "laufend",
  beendet: "beendet",
  abgesagt: "abgesagt",
};

function getWorkflowSteps(status: MeetingStatus): WorkflowStep[] {
  if (status === "abgesagt") {
    return [
      { label: "Entwurf", status: "complete" },
      { label: "Einladung", status: "blocked", description: "Abgesagt" },
      { label: "Durchführung", status: "pending" },
      { label: "Protokoll", status: "pending" },
    ];
  }

  const order: MeetingStatus[] = ["entwurf", "eingeladen", "laufend", "beendet"];
  const currentIndex = order.indexOf(status);

  return [
    {
      label: "Entwurf",
      status: currentIndex === 0 ? "current" : "complete",
    },
    {
      label: "Einladung",
      status:
        currentIndex < 1
          ? "pending"
          : currentIndex === 1
            ? "current"
            : "complete",
    },
    {
      label: "Durchführung",
      status:
        currentIndex < 2
          ? "pending"
          : currentIndex === 2
            ? "current"
            : "complete",
    },
    {
      label: "Protokoll",
      status: currentIndex >= 3 ? "current" : "pending",
    },
  ];
}

export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ meetingId: string }>;
}) {
  const { meetingId } = await params;

  if (!UUID_RE.test(meetingId)) {
    notFound();
  }

  const supabase = await createClient();
  const { data: meeting, error: meetingError } = await supabase
    .from("meeting")
    .select("*")
    .eq("id", meetingId)
    .single<MeetingRow>();

  if (meetingError || !meeting) {
    // PGRST116: 0 rows — indistinguishable from foreign-tenant row under RLS.
    // Correct security posture: always 404, never leak existence of foreign resources.
    if (meetingError?.code === "PGRST116") {
      notFound();
    }
    console.error("[versammlungen/[meetingId]] select failed:", meetingError);
    throw new Error("Versammlung konnte nicht geladen werden.");
  }

  // Secondary aggregate: TOPs for this meeting. RLS scopes via JWT, no
  // explicit tenant_id filter needed. A query error degrades to an empty
  // list — the detail page must not 500 if the sub-query fails.
  type AgendaItemRow = Pick<
    Database["public"]["Tables"]["agenda_item"]["Row"],
    "id" | "position" | "titel" | "beschreibung"
  >;

  const { data: agendaItemsRaw, error: agendaItemsError } = await supabase
    .from("agenda_item")
    .select("id, position, titel, beschreibung")
    .eq("meeting_id", meetingId)
    .order("position", { ascending: true });

  if (agendaItemsError) {
    console.error(
      "[versammlungen/[meetingId]] agenda_item select failed:",
      agendaItemsError,
    );
  }

  const agendaItems: AgendaItemRow[] = agendaItemsRaw ?? [];

  const workflowSteps = getWorkflowSteps(meeting.status);
  const hasAgendaItems = agendaItems.length > 0;
  const nextStep = !hasAgendaItems
    ? {
        title: "Tagesordnung vervollständigen",
        description:
          "Ohne TOPs ist die Versammlung fachlich noch nicht arbeitsbereit.",
        href: `/versammlungen/${meetingId}/tops/new`,
        label: "TOP anlegen",
        tone: "warning" as const,
      }
    : meeting.status === "entwurf"
      ? {
          title: "Einladung versenden",
          description:
            "Die Tagesordnung ist vorbereitet. Als nächstes folgt der rechtlich relevante Einladungsversand.",
          href: "#einladung",
          label: "Einladung prüfen",
          tone: "default" as const,
        }
      : meeting.status === "eingeladen"
        ? {
            title: "Versammlung starten",
            description:
              "Die Einladung ist erfolgt. Starten Sie die Durchführung, sobald die Versammlung beginnt.",
            href: "#aktionen",
            label: "Aktionen prüfen",
            tone: "default" as const,
          }
        : meeting.status === "laufend"
          ? {
              title: "Versammlung beenden",
              description:
                "Nach Abschluss der TOPs kann die Versammlung beendet und der Protokollprozess vorbereitet werden.",
              href: "#aktionen",
              label: "Aktionen prüfen",
              tone: "default" as const,
            }
          : meeting.status === "beendet"
            ? {
                title: "Protokoll-Review starten",
                description:
                  "Die Versammlung ist beendet. Das Protokoll ist jetzt der nächste verbindliche Arbeitsschritt.",
                href: `/versammlungen/${meetingId}/protokoll` as Route,
                label: "Protokoll öffnen",
                tone: "success" as const,
              }
            : {
                title: "Keine Aktion erforderlich",
                description:
                  "Die Versammlung ist abgesagt. Prüfen Sie nur noch Dokumentation oder Historie.",
                href: `/versammlungen/${meetingId}/vorschlaege`,
                label: "KI-Vorschläge ansehen",
                tone: "success" as const,
              };
  const attentionItems: AttentionItem[] = [
    hasAgendaItems
      ? {
          title: "Tagesordnung vorhanden",
          description: `${agendaItems.length} TOP${agendaItems.length === 1 ? "" : "s"} sind angelegt.`,
          tone: "done",
        }
      : {
          title: "Keine Tagesordnungspunkte",
          description:
            "Vor Einladung oder Durchführung sollte mindestens ein TOP angelegt sein.",
          action: (
            <Button asChild variant="outline" size="sm">
              <Link href={`/versammlungen/${meetingId}/tops/new`}>
                TOP anlegen
              </Link>
            </Button>
          ),
        },
    meeting.status !== "entwurf" && meeting.frist_einladung_ok
      ? {
          title: "Einladungsfrist eingehalten",
          description: "Der Status ist für die weitere Durchführung unauffällig.",
          tone: "done",
        }
      : meeting.status !== "entwurf"
        ? {
            title: "Einladungsfrist nicht erfüllt",
            description:
              "Bitte prüfen, ob der Vorgang dokumentiert oder korrigiert werden muss.",
          }
        : {
            title: "Einladung noch offen",
            description:
              "Im Entwurf ist der Einladungsversand noch nicht erfolgt.",
          },
  ];

  return (
    <section className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <OperationalHero
        eyebrow={
          <Link
            href={`/wegs/${meeting.weg_id}`}
            className="underline underline-offset-4 hover:text-[color:var(--color-foreground)]"
          >
            Zurück zur WEG
          </Link>
        }
        title={meeting.titel}
        description={
          meeting.termin_von
            ? formatDateLongDE(meeting.termin_von)
            : "Termin noch offen"
        }
        status={
          <>
            <LifecycleBadge status={STATUS_BADGE[meeting.status]}>
              {STATUS_LABEL[meeting.status] ?? meeting.status}
            </LifecycleBadge>
            <StatusBadge variant="neutral">
              {MODUS_LABEL[meeting.modus] ?? meeting.modus}
            </StatusBadge>
          </>
        }
        insight={
          meeting.status === "beendet"
            ? "Die Versammlung ist abgeschlossen. Der nächste verbindliche Schritt ist der Protokoll-Review."
            : !hasAgendaItems
              ? "Die Versammlung ist angelegt, aber ohne TOPs noch nicht einladungsreif."
              : "Die Versammlung hat eine Tagesordnung. Der nächste Schritt ergibt sich aus dem Lifecycle-Status."
        }
        actions={
          <Button asChild variant="outline">
            <Link href={`/versammlungen/${meetingId}/tops/new`}>
              <Plus className="size-4" aria-hidden="true" />
              TOP hinzufügen
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <NextStepPanel
          title={nextStep.title}
          description={nextStep.description}
          reason="Priorisiert aus Lifecycle-Status und Tagesordnung."
          tone={nextStep.tone}
          action={
            <Button asChild>
              {nextStep.href.startsWith("#") ? (
                <a href={nextStep.href}>{nextStep.label}</a>
              ) : (
                <Link href={nextStep.href as Route}>{nextStep.label}</Link>
              )}
            </Button>
          }
        />
        <InsightCard
          title="Versammlungsreife"
          description={
            hasAgendaItems
              ? "TOPs sind vorhanden. Der Prozess kann statusabhängig fortgeführt werden."
              : "Ohne TOPs bleibt der Prozess fachlich unvollständig."
          }
          icon={<CalendarClock />}
        />
      </div>

      <ProcessRail
        label="Versammlungsprozess"
        summary={STATUS_LABEL[meeting.status] ?? meeting.status}
        steps={workflowSteps}
      />

      <AttentionList items={attentionItems} />

      <Card>
        <CardHeader>
          <SectionHeader
            title="Details"
            description="Status, Modus und Fristen dieser Versammlung."
          />
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <dt className="text-xs font-medium uppercase text-[color:var(--color-muted-foreground)]">
                Status
              </dt>
              <dd>
                <LifecycleBadge status={STATUS_BADGE[meeting.status]}>
                  {STATUS_LABEL[meeting.status] ?? meeting.status}
                </LifecycleBadge>
              </dd>
            </div>
            <div className="space-y-1">
              <dt className="text-xs font-medium uppercase text-[color:var(--color-muted-foreground)]">
                Modus
              </dt>
              <dd className="text-sm">
                {MODUS_LABEL[meeting.modus] ?? meeting.modus}
              </dd>
            </div>
            <div className="space-y-1">
              <dt className="text-xs font-medium uppercase text-[color:var(--color-muted-foreground)]">
                Termin
              </dt>
              <dd>
                {meeting.termin_von ? (
                  <span className="text-sm">
                    {formatDateLongDE(meeting.termin_von)}
                  </span>
                ) : (
                  <span className="text-sm italic text-[color:var(--color-muted-foreground)]">
                    Termin noch offen
                  </span>
                )}
              </dd>
            </div>
            {meeting.status !== "entwurf" ? (
              <div className="space-y-1">
                <dt className="text-xs font-medium uppercase text-[color:var(--color-muted-foreground)]">
                  Einladungsfrist
                </dt>
                <dd>
                  {meeting.frist_einladung_ok ? (
                    <span className="text-sm text-emerald-700 dark:text-emerald-300">
                      Einladungsfrist eingehalten
                    </span>
                  ) : (
                    <span className="text-sm text-[color:var(--color-muted-foreground)]">
                      Einladungsfrist nicht erfüllt
                    </span>
                  )}
                </dd>
              </div>
            ) : null}
          </dl>
        </CardContent>
      </Card>

      {meeting.status === "entwurf" ? (
        <Card id="einladung">
          <CardHeader>
            <SectionHeader
              title="Einladung versenden"
              description="§ 24 Abs. 4 WEG: drei Wochen Frist zwischen Versand und Termin."
            />
          </CardHeader>
          <CardContent>
            <InvitationForm action={sendInvitation.bind(null, meetingId)} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <SectionHeader
            title="KI-Tagesordnungsvorschlag"
            description="Der Agent schlägt TOPs auf Basis vorhandener Unterlagen vor. Der Verwalter entscheidet."
            meta={
              <StatusBadge variant="ai" icon={<Bot />}>
                KI-Vorschlag
              </StatusBadge>
            }
          />
        </CardHeader>
        <CardContent>
          <AgendaReviewPanel wegId={meeting.weg_id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <SectionHeader
            title="Tagesordnungspunkte"
            description="Sortiert nach Position in der Versammlung."
            meta={<span>{agendaItems.length}</span>}
            actions={
              <Button asChild variant="outline" size="sm">
                <Link
                  href={`/versammlungen/${meetingId}/tops/new`}
                  aria-label="Neuen Tagesordnungspunkt hinzufügen"
                >
                  <Plus className="size-4" aria-hidden="true" />
                  TOP hinzufügen
                </Link>
              </Button>
            }
          />
        </CardHeader>
        <CardContent>
          {agendaItems.length === 0 ? (
            <EmptyState
              title="Noch keine TOPs angelegt"
              description="Legen Sie den ersten Tagesordnungspunkt an oder prüfen Sie den KI-Vorschlag."
              icon={<ClipboardList />}
              action={
                <Button asChild size="sm">
                  <Link href={`/versammlungen/${meetingId}/tops/new`}>
                    Ersten TOP anlegen
                  </Link>
                </Button>
              }
            />
          ) : (
            <ol className="divide-y divide-[color:var(--color-border)] rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-card)] shadow-sm">
              {agendaItems.map((top) => (
                <li key={top.id} className="flex gap-3 p-4">
                  <span
                    className="mt-0.5 shrink-0 text-sm font-medium tabular-nums text-[color:var(--color-muted-foreground)]"
                    aria-label={`Position ${top.position}`}
                  >
                    {top.position}.
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/versammlungen/${meetingId}/tops/${top.id}`}
                      className="break-words text-sm font-medium underline-offset-4 hover:underline"
                    >
                      {top.titel}
                    </Link>
                    {top.beschreibung ? (
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-[color:var(--color-muted-foreground)]">
                        {top.beschreibung}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <ActionBar
        id="aktionen"
        secondary={
          <>
            <Button asChild variant="outline">
              <Link href={`/versammlungen/${meetingId}/tops/new`}>
                Neuen TOP anlegen
              </Link>
            </Button>
            {meeting.status === "beendet" ? (
              <Button asChild variant="outline">
                <Link
                  href={
                    `/versammlungen/${meetingId}/protokoll` as Route
                  }
                >
                  Protokoll
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="ghost">
              <Link href={`/versammlungen/${meetingId}/vorschlaege`}>
                KI-Vorschläge
              </Link>
            </Button>
          </>
        }
        primary={
          <>
            {meeting.status === "eingeladen" ? (
              <MeetingStatusForm
                action={startMeeting.bind(null, meetingId)}
                label="Versammlung starten"
                pendingLabel="Starten ..."
              />
            ) : null}
            {meeting.status === "laufend" ? (
              <MeetingStatusForm
                action={endMeeting.bind(null, meetingId)}
                label="Versammlung beenden"
                pendingLabel="Beenden ..."
              />
            ) : null}
            {meeting.status !== "eingeladen" && meeting.status !== "laufend" ? (
              <span className="text-sm text-[color:var(--color-muted-foreground)]">
                {meeting.status === "beendet"
                  ? "Protokoll-Review ist verfügbar."
                  : "Nächster Schritt ergibt sich aus Einladung und Status."}
              </span>
            ) : null}
          </>
        }
      />
    </section>
  );
}
