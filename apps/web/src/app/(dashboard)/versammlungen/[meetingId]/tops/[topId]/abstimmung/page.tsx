import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type {
  Database,
  MehrheitsTyp,
  Stimmprinzip,
} from "@/lib/supabase/database.types";

type ResolutionRow = Database["public"]["Tables"]["resolution"]["Row"];
import { buildAbstimmungState, evaluateMajority } from "@/modules/versammlung";
import { castVote, feststellenResolution } from "./actions";
import { FeststellenForm } from "./feststellen-form";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MEHRHEITS_TYP_LABEL: Record<MehrheitsTyp, string> = {
  einfach: "Einfache Mehrheit",
  qualifiziert: "Qualifizierte Mehrheit",
  doppelt_qualifiziert: "Doppelt qualifizierte Mehrheit",
  allstimmig: "Allstimmigkeit",
  vereinbarungs_aenderung: "Vereinbarungsänderung",
};

const STIMMPRINZIP_LABEL: Record<Stimmprinzip, string> = {
  kopf: "Kopfprinzip",
  wert: "Wertprinzip (MEA)",
  objekt: "Objektprinzip",
};

const VOTE_LABEL: Record<string, string> = {
  ja: "Ja",
  nein: "Nein",
  enthaltung: "Enthalten",
};

type OwnershipWithCoOwners = {
  id: string;
  person_id: string;
  person: { vorname: string; nachname: string } | null;
  ownership_co_owner?: {
    person: { vorname: string; nachname: string } | null;
  }[] | null;
};

interface PageProps {
  params: Promise<{ meetingId: string; topId: string }>;
}

export default async function AbstimmungPage({ params }: PageProps) {
  const { meetingId, topId } = await params;

  if (!UUID_RE.test(meetingId) || !UUID_RE.test(topId)) {
    notFound();
  }

  const supabase = await createClient();

  const { data: agendaItem, error: agendaError } = await supabase
    .from("agenda_item")
    .select("id, meeting_id, position, titel")
    .eq("id", topId)
    .single();

  if (agendaError?.code === "PGRST116" || !agendaItem) {
    notFound();
  }

  if (agendaItem.meeting_id !== meetingId) {
    notFound();
  }

  const { data: resolution } = await supabase
    .from("resolution")
    .select("*")
    .eq("agenda_item_id", topId)
    .maybeSingle<ResolutionRow>();

  if (!resolution) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        <div>
          <Link
            href={`/versammlungen/${meetingId}/tops/${topId}`}
            className="text-sm underline underline-offset-4 hover:text-[var(--color-accent)]"
          >
            ← Zurück zum TOP
          </Link>
        </div>

        <div>
          <h1 className="text-2xl font-semibold">Abstimmung</h1>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            TOP {agendaItem.position}: {agendaItem.titel}
          </p>
        </div>

        <div className="rounded-lg border border-[var(--color-border)] p-6 space-y-3">
          <p
            role="status"
            className="text-sm text-[var(--color-muted-foreground)]"
          >
            Noch keine Beschlussvorlage für diesen TOP angelegt.
          </p>
          <Link
            href={`/versammlungen/${meetingId}/tops/${topId}/beschluss/new`}
            className="text-sm underline underline-offset-4 hover:text-[var(--color-accent)]"
          >
            Beschlussvorlage anlegen →
          </Link>
        </div>
      </div>
    );
  }

  const { data: meeting } = await supabase
    .from("meeting")
    .select("weg_id, termin_von")
    .eq("id", meetingId)
    .single();

  const stichtag = meeting?.termin_von
    ? new Date(meeting.termin_von).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const { data: ownerships } = await supabase
    .from("ownership")
    .select(`
      id,
      person_id,
      person(vorname, nachname),
      ownership_co_owner(
        person(vorname, nachname)
      )
    `)
    .eq("weg_id", meeting?.weg_id ?? "")
    .lte("von", stichtag)
    .or(`bis.is.null,bis.gte.${stichtag}`)
    .order("person_id")
    .returns<OwnershipWithCoOwners[]>();

  const { data: votes } = await supabase
    .from("vote")
    .select("ownership_id, wert")
    .eq("resolution_id", resolution.id);

  const { data: beschlussSammlungEntry } = await supabase
    .from("beschluss_sammlung_entry")
    .select("id, lfd_nr")
    .eq("resolution_id", resolution.id)
    .maybeSingle();

  const ownershipList = ownerships ?? [];
  const isFestgestellt = resolution.festgestellt_am !== null;

  // Tally + Anzeige-Map kommen aus dem Versammlungs-Modul; die konstitutive
  // Feststellung bleibt der RPC `feststellen_resolution` in `feststellenResolution`.
  const { voteByOwnership: voteMap, tally } = buildAbstimmungState(votes ?? [], {
    totalEligible: ownershipList.length,
  });
  const majorityPreview =
    voteMap.size > 0 ? evaluateMajority(tally, resolution.mehrheits_typ) : null;

  const boundCastVote = castVote.bind(null, resolution.id, meetingId, topId);

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <div>
        <Link
          href={`/versammlungen/${meetingId}/tops/${topId}`}
          className="text-sm underline underline-offset-4 hover:text-[var(--color-accent)]"
        >
          ← Zurück zum TOP
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-semibold">Abstimmung</h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          TOP {agendaItem.position}: {agendaItem.titel}
        </p>
      </div>

      {/* Resolution summary */}
      <div className="rounded-lg border border-[var(--color-border)] p-5 space-y-3">
        <blockquote className="text-sm border-l-2 border-[var(--color-accent)] pl-4 text-[var(--color-fg)]">
          {resolution.text}
        </blockquote>
        <div className="flex flex-wrap gap-4 text-xs text-[var(--color-muted-foreground)]">
          <span>
            <span className="font-medium">Mehrheit:</span>{" "}
            {MEHRHEITS_TYP_LABEL[resolution.mehrheits_typ]}
          </span>
          <span>
            <span className="font-medium">Stimmprinzip:</span>{" "}
            {STIMMPRINZIP_LABEL[resolution.stimmprinzip]}
          </span>
        </div>
        <div className="flex gap-4 text-xs">
          <span className="text-green-600 dark:text-green-400">
            Ja: {tally.ja}
          </span>
          <span className="text-red-600 dark:text-red-400">
            Nein: {tally.nein}
          </span>
          <span className="text-[var(--color-muted-foreground)]">
            Enthalten: {tally.enthaltung}
          </span>
        </div>
        {!isFestgestellt && majorityPreview && (
          <p className="text-xs text-[var(--color-muted-foreground)]">
            Vorschau (unverbindlich): {majorityPreview.reasoning}
            {majorityPreview.fallback_applied
              ? " Datenlage unvollständig — bitte vor der Feststellung manuell prüfen."
              : ""}
          </p>
        )}
      </div>

      {/* Vote progress */}
      <p className="text-sm text-[var(--color-muted-foreground)]">
        {voteMap.size} von {ownershipList.length} Stimmen abgegeben
      </p>

      {/* Feststellung — konstitutiv per st. Rspr. (BGH V ZR 113/12 ff.).
          Sichtbar erst wenn mind. eine Stimme abgegeben; ausgegraut wenn
          bereits festgestellt (Status statt Button). */}
      <div className="rounded-lg border border-[var(--color-border)] p-4 space-y-3">
        {isFestgestellt ? (
          <div role="status" className="space-y-2 text-sm">
            <p className="text-green-700 dark:text-green-400">
              Beschluss festgestellt am{" "}
              {new Date(resolution.festgestellt_am!).toLocaleString("de-DE", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
              .
            </p>
            {beschlussSammlungEntry ? (
              <p className="text-[var(--color-muted-foreground)]">
                In der Beschluss-Sammlung eingetragen als Nr.{" "}
                {beschlussSammlungEntry.lfd_nr}.
              </p>
            ) : (
              <p className="text-red-700 dark:text-red-400">
                Kein Beschluss-Sammlung-Eintrag gefunden.
              </p>
            )}
          </div>
        ) : voteMap.size > 0 ? (
          <FeststellenForm
            action={feststellenResolution.bind(
              null,
              resolution.id,
              meetingId,
              topId,
            )}
          />
        ) : (
          <p
            role="status"
            className="text-sm text-[var(--color-muted-foreground)]"
          >
            Feststellung möglich, sobald mindestens eine Stimme abgegeben wurde.
          </p>
        )}
      </div>

      {/* Per-ownership vote forms */}
      <div className="rounded-lg border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
        {ownershipList.length === 0 ? (
          <p
            role="status"
            className="p-4 text-sm text-[var(--color-muted-foreground)]"
          >
            Keine aktiven Eigentümer für diese WEG gefunden.
          </p>
        ) : (
          ownershipList.map((ownership) => {
            const primaryName = ownership.person ? `${ownership.person.vorname} ${ownership.person.nachname}` : "";
            const coNames = ownership.ownership_co_owner?.map(co => co.person ? `${co.person.vorname} ${co.person.nachname}` : "").filter(Boolean) ?? [];
            const displayName = [primaryName, ...coNames].filter(Boolean).join(", ") || "—";
            return (
              <form
                key={ownership.id}
                action={boundCastVote}
                className="flex items-center gap-3 px-4 py-2"
              >
                <input
                  type="hidden"
                  name="ownership_id"
                  value={ownership.id}
                />
                <span className="flex-1 text-sm">
                  {displayName}
                </span>
                {voteMap.has(ownership.id) && (
                  <span className="text-xs px-2 py-0.5 rounded-full border border-[var(--color-border)]">
                    {VOTE_LABEL[voteMap.get(ownership.id)!]}
                  </span>
                )}
                <div className="flex gap-2">
                  {(["ja", "nein", "enthaltung"] as const).map((wert) => (
                    <label
                      key={wert}
                      className="flex items-center gap-1 text-xs cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="wert"
                        value={wert}
                        defaultChecked={voteMap.get(ownership.id) === wert}
                        disabled={isFestgestellt}
                      />
                      {VOTE_LABEL[wert]}
                    </label>
                  ))}
                </div>
                {isFestgestellt ? (
                  <span className="text-xs text-[var(--color-muted-foreground)]">
                    Gesperrt
                  </span>
                ) : (
                  <button
                    type="submit"
                    className="text-xs px-2 py-1 rounded border border-[var(--color-border)] hover:bg-[var(--color-border)]"
                  >
                    Speichern
                  </button>
                )}
              </form>
            );
          })
        )}
      </div>
    </div>
  );
}
