import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AuditActorType, Database } from "@/lib/supabase/database.types";

type AuditEventRow = Database["public"]["Tables"]["audit_event"]["Row"];

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

function formatDateTimeDE(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", DATE_FORMAT);
}

const ACTOR_LABEL: Record<AuditActorType, string> = {
  user: "Verwalter",
  agent: "KI-Agent",
  system: "System",
};

function formatActorUserId(id: string | null): string {
  if (!id) return "–";
  return id.slice(0, 8);
}

export default async function AuditPage() {
  const supabase = await createClient();

  const { data: events, error } = await supabase
    .from("audit_event")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<AuditEventRow[]>();

  if (error) {
    console.error("[audit] audit_event select failed:", error);
    throw new Error("Audit-Log konnte nicht geladen werden.");
  }

  const rows: AuditEventRow[] = events ?? [];

  return (
    <section className="mx-auto max-w-5xl space-y-6 px-6 py-12">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Audit-Log</h1>
        <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
          Unveränderliche Systemereignisse — kein Eintrag kann gelöscht oder
          geändert werden.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Ereignisse ({rows.length})</CardTitle>
          <CardDescription>
            Letzte 100 Einträge, absteigend nach Zeitstempel.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p
              role="status"
              className="rounded-md border border-dashed border-[color:var(--color-border)] p-6 text-center text-sm text-[color:var(--color-muted-foreground)]"
            >
              Noch keine Ereignisse erfasst.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--color-border)] text-left text-xs text-[color:var(--color-muted-foreground)]">
                    <th className="pb-2 pr-4 font-medium">#</th>
                    <th className="pb-2 pr-4 font-medium">Zeitstempel</th>
                    <th className="pb-2 pr-4 font-medium">Akteur</th>
                    <th className="pb-2 pr-4 font-medium">Entität</th>
                    <th className="pb-2 pr-4 font-medium">Aktion</th>
                    <th className="pb-2 font-medium">Benutzer-ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--color-border)]">
                  {rows.map((event) => (
                    <tr key={event.id} className="align-top">
                      <td className="py-3 pr-4 font-mono text-xs text-[color:var(--color-muted-foreground)]">
                        {event.seq}
                      </td>
                      <td className="py-3 pr-4 tabular-nums text-[color:var(--color-foreground)]">
                        {formatDateTimeDE(event.created_at)}
                      </td>
                      <td className="py-3 pr-4">
                        <span className="inline-flex items-center rounded-full border border-[color:var(--color-border)] px-2 py-0.5 text-xs">
                          {ACTOR_LABEL[event.actor_type] ?? event.actor_type}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-[color:var(--color-foreground)]">
                        {event.entity_typ}
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-[color:var(--color-foreground)]">
                        {event.action}
                      </td>
                      <td className="py-3 font-mono text-xs text-[color:var(--color-muted-foreground)]">
                        {formatActorUserId(event.actor_user_id)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
