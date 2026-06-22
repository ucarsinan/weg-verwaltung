"use client";

import { useState, useTransition } from "react";
import {
  Bot,
  CalendarClock,
  Check,
  ClipboardList,
  FileText,
  History,
  Link2,
  MessageSquare,
  Shield,
  X,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  formatConfidence,
  formatDateTime,
  formatDueDate,
  formatPriority,
  formatTaskStatus,
  formatVisibility,
  formatVorgangStatus,
} from "@/lib/vorgangszentrale/formatters";
import type {
  TaskStatus,
  VorgangDetail,
} from "@/lib/vorgangszentrale/types";

type ActionResult = { error?: string; id?: string };
type CreateTaskAction = (vorgangId: string, formData: FormData) => Promise<ActionResult>;
type UpdateTaskAction = (
  vorgangId: string,
  taskId: string,
  status: TaskStatus,
) => Promise<ActionResult>;
type NoteAction = (vorgangId: string, formData: FormData) => Promise<ActionResult>;
type AgentSuggestionAction = (
  vorgangId: string,
  wegId: string | null,
  formData: FormData,
) => Promise<ActionResult>;
type ReviewAction = (reviewId: string) => Promise<ActionResult>;

interface VorgangDetailViewProps {
  detail: VorgangDetail | null;
  loadError: string | null;
  createTaskAction: CreateTaskAction;
  updateTaskStatusAction: UpdateTaskAction;
  addInternalNoteAction: NoteAction;
  requestVorgangAgentSuggestionAction: AgentSuggestionAction;
  acceptReviewAction: ReviewAction;
  rejectReviewAction: ReviewAction;
}

export function VorgangDetailView({
  detail,
  loadError,
  createTaskAction,
  updateTaskStatusAction,
  addInternalNoteAction,
  requestVorgangAgentSuggestionAction,
  acceptReviewAction,
  rejectReviewAction,
}: VorgangDetailViewProps) {
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(key: string, action: () => Promise<ActionResult>) {
    setActionError(null);
    setPendingKey(key);
    startTransition(async () => {
      const result = await action();
      if (result.error) setActionError(result.error);
      setPendingKey(null);
    });
  }

  if (!detail) {
    return (
      <>
        <PageHeader
          title="Vorgang nicht verfügbar"
          description="Der Vorgang konnte nicht geladen werden."
          actions={
            <Button asChild variant="outline">
              <Link href={"/vorgaenge" as Route}>Zurück zu Vorgängen</Link>
            </Button>
          }
        />
        <EmptyState
          icon={<ClipboardList />}
          title="Keine Detaildaten"
          description={loadError ?? "Der Vorgang existiert nicht oder ist für diesen Mandanten nicht sichtbar."}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={detail.title}
        description={`${detail.wegName ?? (detail.wegId ? "WEG ohne Namen" : "Tenant-weiter Vorgang")} · ${detail.typ}`}
        meta={
          <>
            <StatusBadge variant="info">{formatVorgangStatus(detail.status)}</StatusBadge>
            <StatusBadge variant="neutral">{formatPriority(detail.priority)}</StatusBadge>
            <StatusBadge variant="neutral" icon={<Shield />}>
              {formatVisibility(detail.visibilityState)}
            </StatusBadge>
            {detail.hasKiSuggestion ? (
              <StatusBadge variant="ai" icon={<Bot />}>
                KI-Review offen
              </StatusBadge>
            ) : null}
          </>
        }
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={"/vorgaenge" as Route}>Zurück</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/audit">Audit</Link>
            </Button>
          </>
        }
      />

      {loadError || actionError ? (
        <p
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100"
        >
          {actionError ?? loadError}
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
              <CardDescription>
                Fachliche Chronik. Interne Notizen bleiben standardmäßig intern.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form
                className="space-y-3 rounded-md border border-[color:var(--color-border)] p-3"
                action={(formData) =>
                  run("note", () => addInternalNoteAction(detail.id, formData))
                }
              >
                <label className="text-sm font-medium" htmlFor="note">
                  Interne Notiz
                </label>
                <textarea
                  id="note"
                  name="note"
                  rows={3}
                  required
                  className="w-full rounded-md border border-[color:var(--color-input)] bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)]"
                />
                <Button type="submit" size="sm" disabled={isPending && pendingKey === "note"}>
                  <MessageSquare className="size-4" aria-hidden="true" />
                  Notiz speichern
                </Button>
              </form>

              {detail.timeline.length === 0 ? (
                <EmptyState
                  icon={<History />}
                  title="Noch keine Timeline-Einträge"
                  description="Statuswechsel, interne Notizen und verknüpfte Inbox-Ereignisse erscheinen hier."
                />
              ) : (
                <ol className="space-y-3">
                  {detail.timeline.map((event) => (
                    <li
                      key={event.id}
                      className="rounded-md border border-[color:var(--color-border)] p-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge variant={event.actorType === "agent" ? "ai" : "neutral"}>
                          {event.actorType}
                        </StatusBadge>
                        <StatusBadge variant="neutral">
                          {formatVisibility(event.visibility)}
                        </StatusBadge>
                        <span className="text-xs text-[color:var(--color-muted-foreground)]">
                          {formatDateTime(event.createdAt)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6">{event.summary}</p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Aufgaben</CardTitle>
              <CardDescription>Konkrete Arbeitseinheiten mit Frist und Status.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form
                className="grid gap-3 rounded-md border border-[color:var(--color-border)] p-3 md:grid-cols-[minmax(0,1fr)_12rem_auto]"
                action={(formData) =>
                  run("task-create", () => createTaskAction(detail.id, formData))
                }
              >
                <Input name="title" placeholder="Neue Aufgabe" required />
                <Input name="due_at" type="date" aria-label="Frist" />
                <Button type="submit" disabled={isPending && pendingKey === "task-create"}>
                  Aufgabe anlegen
                </Button>
              </form>

              {detail.tasks.length === 0 ? (
                <EmptyState
                  icon={<ClipboardList />}
                  title="Keine Aufgaben"
                  description="Lege eine Aufgabe an, wenn ein konkreter nächster Schritt entsteht."
                />
              ) : (
                <ul className="divide-y divide-[color:var(--color-border)] rounded-md border border-[color:var(--color-border)]">
                  {detail.tasks.map((task) => (
                    <li key={task.id} className="flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{task.title}</p>
                          <StatusBadge variant={task.status === "done" ? "success" : "neutral"}>
                            {formatTaskStatus(task.status)}
                          </StatusBadge>
                        </div>
                        <p className="mt-1 text-xs text-[color:var(--color-muted-foreground)]">
                          {formatDueDate(task.dueAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isPending || task.status === "in_progress"}
                          onClick={() =>
                            run(`task-${task.id}-progress`, () =>
                              updateTaskStatusAction(detail.id, task.id, "in_progress"),
                            )
                          }
                        >
                          In Arbeit
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={isPending || task.status === "done"}
                          onClick={() =>
                            run(`task-${task.id}-done`, () =>
                              updateTaskStatusAction(detail.id, task.id, "done"),
                            )
                          }
                        >
                          <Check className="size-4" aria-hidden="true" />
                          Erledigt
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>KI-Reviews</CardTitle>
              <CardDescription>Vorschläge brauchen eine menschliche Entscheidung.</CardDescription>
            </CardHeader>
            <CardContent>
              {detail.reviews.length === 0 ? (
                <EmptyState
                  icon={<Bot />}
                  title="Keine KI-Reviews"
                  description="Offene Vorschläge erscheinen hier, sobald der Agent Kontext zu diesem Vorgang liefert."
                />
              ) : (
                <ul className="space-y-3">
                  {detail.reviews.map((review) => (
                    <li
                      key={review.id}
                      className="rounded-md border border-[color:var(--color-border)] p-3"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap gap-1.5">
                            <StatusBadge variant="ai" icon={<Bot />}>
                              {review.suggestionType}
                            </StatusBadge>
                            <StatusBadge variant="neutral">
                              {formatConfidence(review.confidence)}
                            </StatusBadge>
                          </div>
                          <p className="font-medium">{review.title}</p>
                          <p className="text-sm leading-6 text-[color:var(--color-muted-foreground)]">
                            {review.summary}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            disabled={isPending || review.status !== "vorschlag"}
                            onClick={() =>
                              run(`review-${review.id}-accept`, () =>
                                acceptReviewAction(review.id),
                              )
                            }
                          >
                            <Check className="size-4" aria-hidden="true" />
                            Übernehmen
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isPending || review.status !== "vorschlag"}
                            onClick={() =>
                              run(`review-${review.id}-reject`, () =>
                                rejectReviewAction(review.id),
                              )
                            }
                          >
                            <X className="size-4" aria-hidden="true" />
                            Verwerfen
                          </Button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Vorgang-Agent</CardTitle>
              <CardDescription>
                Fordert einen prüfpflichtigen Vorschlag für diesen Vorgang an.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-3"
                action={(formData) =>
                  run("agent-vorgang", () =>
                    requestVorgangAgentSuggestionAction(
                      detail.id,
                      detail.wegId,
                      formData,
                    ),
                  )
                }
              >
                <label className="text-sm font-medium" htmlFor="suggestion_type">
                  Vorschlagsart
                </label>
                <select
                  id="suggestion_type"
                  name="suggestion_type"
                  className="w-full rounded-md border border-[color:var(--color-input)] bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)]"
                  defaultValue=""
                >
                  <option value="">Agent entscheidet</option>
                  <option value="vorgang_triage">Vorgang triagieren</option>
                  <option value="antwort_entwurf">Antwort entwerfen</option>
                  <option value="frist_vorschlag">Frist vorschlagen</option>
                  <option value="dokument_metadaten_vorschlag">
                    Dokument-Metadaten
                  </option>
                  <option value="rag_answer">Quellenfrage beantworten</option>
                </select>

                <label className="text-sm font-medium" htmlFor="user_request">
                  Auftrag an den Agent
                </label>
                <textarea
                  id="user_request"
                  name="user_request"
                  rows={4}
                  placeholder="Bitte prüfe diesen Vorgang konservativ anhand der verfügbaren Quellen und erstelle nur einen menschlich zu prüfenden Vorschlag."
                  className="w-full rounded-md border border-[color:var(--color-input)] bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)]"
                />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isPending && pendingKey === "agent-vorgang"}
                >
                  <Bot className="size-4" aria-hidden="true" />
                  Vorschlag anfordern
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Kontext</CardTitle>
              <CardDescription>Frist, Sichtbarkeit und Audit-Anker.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                <div className="flex items-start gap-2">
                  <CalendarClock className="mt-0.5 size-4 text-[color:var(--color-muted-foreground)]" aria-hidden="true" />
                  <div>
                    <dt className="text-xs text-[color:var(--color-muted-foreground)]">Frist</dt>
                    <dd className="font-medium">{formatDueDate(detail.dueAt)}</dd>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Shield className="mt-0.5 size-4 text-[color:var(--color-muted-foreground)]" aria-hidden="true" />
                  <div>
                    <dt className="text-xs text-[color:var(--color-muted-foreground)]">Sichtbarkeit</dt>
                    <dd className="font-medium">{formatVisibility(detail.visibilityState)}</dd>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <History className="mt-0.5 size-4 text-[color:var(--color-muted-foreground)]" aria-hidden="true" />
                  <div>
                    <dt className="text-xs text-[color:var(--color-muted-foreground)]">Aktualisiert</dt>
                    <dd className="font-medium">{formatDateTime(detail.updatedAt)}</dd>
                  </div>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Verknüpfungen</CardTitle>
              <CardDescription>Referenzen auf führende Domainobjekte.</CardDescription>
            </CardHeader>
            <CardContent>
              {detail.relations.length === 0 ? (
                <p className="text-sm text-[color:var(--color-muted-foreground)]">
                  Noch keine Relationen verknüpft.
                </p>
              ) : (
                <ul className="space-y-2">
                  {detail.relations.map((relation) => (
                    <li
                      key={relation.id}
                      className="rounded-md border border-[color:var(--color-border)] p-3 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <Link2 className="size-4 text-[color:var(--color-muted-foreground)]" aria-hidden="true" />
                        <span className="font-medium">{relation.label ?? relation.relationType}</span>
                      </div>
                      <p className="mt-1 truncate font-mono text-xs text-[color:var(--color-muted-foreground)]">
                        {relation.relationId}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dokumente</CardTitle>
              <CardDescription>Dokumentlinks mit Hash/Version folgen über Relationen.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="flex gap-2 text-sm leading-6 text-[color:var(--color-muted-foreground)]">
                <FileText className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                Keine Dokumente in dieser Foundation-Ansicht geladen.
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}
