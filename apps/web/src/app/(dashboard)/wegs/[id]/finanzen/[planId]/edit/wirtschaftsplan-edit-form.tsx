"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import {
  activateWirtschaftsplan,
  archiveWirtschaftsplan,
  createNachtragsplan,
  deleteWirtschaftsplanAction,
  updateWirtschaftsplanAction,
  type WirtschaftsplanEditFormState,
} from "./actions";
import type { WirtschaftsplanStatus } from "@/lib/supabase/database.types";

interface Unit {
  id: string;
  bezeichnung: string;
  mea_zaehler: number;
  mea_nenner: number;
}

/** Ein zustimmender Eintrag der Beschluss-Sammlung, fertig beschriftet. */
export interface BeschlussOption {
  id: string;
  label: string;
}

interface WirtschaftsplanEditFormProps {
  wegId: string;
  planId: string;
  initialData: {
    jahr: number;
    bezeichnung: string;
    gesamtkosten: number;
    status: WirtschaftsplanStatus;
    version_nr: number;
    wirksam_ab_monat: number | null;
    aktiviert_am: string | null;
    abgeloest_am: string | null;
    archiviert_am: string | null;
    beschluss_sammlung_entry_id: string | null;
  };
  units: Unit[];
  beschluesse: BeschlussOption[];
}

const initialState: WirtschaftsplanEditFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
    >
      {pending ? "Speichern ..." : "Speichern"}
    </button>
  );
}

function formatAmountForInput(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

function getStatusLabel(status: WirtschaftsplanStatus): string {
  const labels: Record<WirtschaftsplanStatus, string> = {
    entwurf: "Entwurf",
    aktiv: "Aktiv",
    abgeloest: "Abgelöst",
    archiviert: "Archiviert",
  };

  return labels[status];
}

function formatDateTime(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function WirtschaftsplanEditForm({
  wegId,
  planId,
  initialData,
  units,
  beschluesse,
}: WirtschaftsplanEditFormProps) {
  const updateWithIds = updateWirtschaftsplanAction.bind(null, wegId, planId);
  const [state, formAction] = useActionState(updateWithIds, initialState);
  const [gesamtkosten, setGesamtkosten] = useState(
    formatAmountForInput(initialData.gesamtkosten),
  );
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLifecycleActionPending, setIsLifecycleActionPending] =
    useState(false);
  const [beschlussId, setBeschlussId] = useState(
    initialData.beschluss_sammlung_entry_id ?? "",
  );
  const isDraft = initialData.status === "entwurf";
  const canArchive =
    initialData.status === "entwurf" || initialData.status === "abgeloest";
  const canCreateNachtrag = initialData.status === "aktiv";

  // 0074 verlangt die Beschlussgrundlage am GESPEICHERTEN Plan. Der
  // Aktivieren-Knopf steht ausserhalb des Formulars, eine bloss ausgewaehlte,
  // aber nicht gespeicherte Zuordnung zaehlt also nicht — sonst liefe der Nutzer
  // in "kein Beschluss zugeordnet", obwohl er gerade einen gewaehlt hat.
  const beschlussGespeichert = initialData.beschluss_sammlung_entry_id !== null;
  const beschlussUngespeichert =
    (beschlussId || null) !== initialData.beschluss_sammlung_entry_id;
  const kannAktivieren = isDraft && beschlussGespeichert;

  const numCosts = useMemo(() => {
    const normalized = gesamtkosten.replace(",", ".");
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }, [gesamtkosten]);

  const handleDelete = async () => {
    const confirmed = window.confirm(
      "Sind Sie sicher, dass Sie diesen Wirtschaftsplan unwiderruflich löschen möchten? Pläne mit historischen Sollstellungen können nicht gelöscht werden.",
    );
    if (!confirmed) return;

    setIsDeleting(true);
    setDeleteError(null);

    try {
      const result = await deleteWirtschaftsplanAction(wegId, planId);
      if (result?.error) {
        setDeleteError(result.error);
      }
    } catch {
      setDeleteError("Ein unerwarteter Fehler ist aufgetreten.");
    } finally {
      setIsDeleting(false);
    }
  };

  const runLifecycleAction = async (
    action: () => Promise<{ error?: string }>,
  ) => {
    setIsLifecycleActionPending(true);
    setActionError(null);

    try {
      const result = await action();
      if (result?.error) {
        setActionError(result.error);
      }
    } catch {
      setActionError("Ein unerwarteter Fehler ist aufgetreten.");
    } finally {
      setIsLifecycleActionPending(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="rounded-md border border-[var(--color-border)] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase text-[color:var(--color-muted-foreground)]">
              Status
            </p>
            <p className="mt-1 text-lg font-semibold">
              {getStatusLabel(initialData.status)} · Version{" "}
              {initialData.version_nr}
            </p>
            <p className="mt-1 text-xs text-[color:var(--color-muted-foreground)]">
              Wirksam ab Monat {initialData.wirksam_ab_monat ?? 1}
            </p>
          </div>
          <dl className="grid gap-1 text-xs text-[color:var(--color-muted-foreground)] sm:text-right">
            {formatDateTime(initialData.aktiviert_am) ? (
              <div>
                <dt className="inline">Aktiviert: </dt>
                <dd className="inline">
                  {formatDateTime(initialData.aktiviert_am)}
                </dd>
              </div>
            ) : null}
            {formatDateTime(initialData.abgeloest_am) ? (
              <div>
                <dt className="inline">Abgelöst: </dt>
                <dd className="inline">
                  {formatDateTime(initialData.abgeloest_am)}
                </dd>
              </div>
            ) : null}
            {formatDateTime(initialData.archiviert_am) ? (
              <div>
                <dt className="inline">Archiviert: </dt>
                <dd className="inline">
                  {formatDateTime(initialData.archiviert_am)}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>

        {actionError ? (
          <div
            role="alert"
            className="mt-3 rounded-md border border-[var(--color-border)] p-3 text-sm text-red-600 dark:text-red-400"
          >
            {actionError}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {isDraft ? (
            <button
              type="button"
              disabled={isLifecycleActionPending || !kannAktivieren}
              onClick={() =>
                runLifecycleAction(() =>
                  activateWirtschaftsplan(wegId, planId),
                )
              }
              className="rounded-md bg-[var(--color-accent)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {isLifecycleActionPending ? "Aktiviert ..." : "Aktivieren"}
            </button>
          ) : null}
          {canCreateNachtrag ? (
            <button
              type="button"
              disabled={isLifecycleActionPending}
              onClick={() =>
                runLifecycleAction(() => createNachtragsplan(wegId, planId))
              }
              className="rounded-md border border-[var(--color-border)] px-3 py-2 text-xs font-semibold disabled:opacity-50"
            >
              {isLifecycleActionPending
                ? "Nachtrag wird erstellt ..."
                : "Nachtrag erstellen"}
            </button>
          ) : null}
          {canArchive ? (
            <button
              type="button"
              disabled={isLifecycleActionPending}
              onClick={() =>
                runLifecycleAction(() =>
                  archiveWirtschaftsplan(wegId, planId),
                )
              }
              className="rounded-md border border-[var(--color-border)] px-3 py-2 text-xs font-semibold disabled:opacity-50"
            >
              {isLifecycleActionPending
                ? "Archiviert ..."
                : "Archivieren"}
            </button>
          ) : null}
        </div>

        {isDraft && !kannAktivieren ? (
          <p
            role="status"
            className="mt-3 text-sm text-[color:var(--color-muted-foreground)]"
          >
            {beschluesse.length === 0 ? (
              // Der Ausweg, der sonst fehlte — dieselbe Lehre wie bei Befund 7:
              // eine Vorbedingung zu benennen, ohne den Weg dorthin zu zeigen,
              // ist eine Sackgasse.
              <>
                Zum Aktivieren fehlt der Beschluss über die Vorschüsse. Für diese
                WEG ist noch kein zustimmender Beschluss erfasst.{" "}
                <Link
                  href={`/wegs/${wegId}/beschluss-sammlung/new`}
                  className="underline underline-offset-4 hover:text-[color:var(--color-accent)]"
                >
                  Beschluss erfassen
                </Link>
                .
              </>
            ) : beschlussUngespeichert ? (
              "Die gewählte Beschlussgrundlage ist noch nicht gespeichert. Bitte unten speichern, danach lässt sich der Plan aktivieren."
            ) : (
              "Zum Aktivieren fehlt der Beschluss über die Vorschüsse — bitte unten zuordnen und speichern."
            )}
          </p>
        ) : null}
      </div>

      <form action={formAction} className="space-y-6" noValidate>
        {state.errors?._form ? (
          <div
            id="form-error"
            role="alert"
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-sm text-red-600 dark:text-red-400"
          >
            {state.errors._form.join(" ")}
          </div>
        ) : null}

        <div className="space-y-1">
          <label htmlFor="jahr" className="block text-sm font-medium">
            Jahr <span aria-hidden="true">*</span>
          </label>
          <input
            id="jahr"
            name="jahr"
            type="number"
            required
            aria-required="true"
            aria-invalid={state.errors?.jahr ? true : undefined}
            aria-describedby={state.errors?.jahr ? "jahr-error" : undefined}
            min={1900}
            max={2100}
            step={1}
            defaultValue={initialData.jahr}
            disabled={!isDraft}
            className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
          />
          {state.errors?.jahr ? (
            <p
              id="jahr-error"
              role="alert"
              className="text-sm text-red-600 dark:text-red-400"
            >
              {state.errors.jahr.join(" ")}
            </p>
          ) : null}
        </div>

        <div className="space-y-1">
          <label htmlFor="bezeichnung" className="block text-sm font-medium">
            Bezeichnung <span aria-hidden="true">*</span>
          </label>
          <input
            id="bezeichnung"
            name="bezeichnung"
            type="text"
            required
            aria-required="true"
            aria-invalid={state.errors?.bezeichnung ? true : undefined}
            aria-describedby={
              state.errors?.bezeichnung ? "bezeichnung-error" : undefined
            }
            maxLength={200}
            defaultValue={initialData.bezeichnung}
            autoComplete="off"
            disabled={!isDraft}
            className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
          />
          {state.errors?.bezeichnung ? (
            <p
              id="bezeichnung-error"
              role="alert"
              className="text-sm text-red-600 dark:text-red-400"
            >
              {state.errors.bezeichnung.join(" ")}
            </p>
          ) : null}
        </div>

        <div className="space-y-1">
          <label htmlFor="gesamtkosten" className="block text-sm font-medium">
            Gesamtkosten (EUR) <span aria-hidden="true">*</span>
          </label>
          <input
            id="gesamtkosten"
            name="gesamtkosten"
            type="number"
            step="0.01"
            required
            aria-required="true"
            value={gesamtkosten}
            onChange={(event) => setGesamtkosten(event.target.value)}
            disabled={!isDraft}
            aria-invalid={state.errors?.gesamtkosten ? true : undefined}
            aria-describedby={
              state.errors?.gesamtkosten ? "gesamtkosten-error" : undefined
            }
            className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
          />
          {state.errors?.gesamtkosten ? (
            <p
              id="gesamtkosten-error"
              role="alert"
              className="text-sm text-red-600 dark:text-red-400"
            >
              {state.errors.gesamtkosten.join(" ")}
            </p>
          ) : null}
        </div>

        <div className="space-y-1">
          <label htmlFor="wirksam_ab_monat" className="block text-sm font-medium">
            Wirksam ab Monat
          </label>
          <input
            id="wirksam_ab_monat"
            name="wirksam_ab_monat"
            type="number"
            min={1}
            max={12}
            step={1}
            defaultValue={initialData.wirksam_ab_monat ?? ""}
            disabled={!isDraft}
            aria-invalid={state.errors?.wirksam_ab_monat ? true : undefined}
            aria-describedby={
              state.errors?.wirksam_ab_monat
                ? "wirksam-ab-monat-error"
                : undefined
            }
            className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
          />
          {state.errors?.wirksam_ab_monat ? (
            <p
              id="wirksam-ab-monat-error"
              role="alert"
              className="text-sm text-red-600 dark:text-red-400"
            >
              {state.errors.wirksam_ab_monat.join(" ")}
            </p>
          ) : null}
        </div>

        <div className="space-y-1">
          <label
            htmlFor="beschluss_sammlung_entry_id"
            className="block text-sm font-medium"
          >
            Beschlussgrundlage
          </label>
          {/*
            Bewusst KEIN `required`: Ein Entwurf entsteht, bevor die Versammlung
            beschliesst — genau das ist die Reihenfolge des § 28 Abs. 1 WEG. Die
            Pflicht greift erst beim Aktivieren, wo aus dem Plan Geld wird.
          */}
          <select
            id="beschluss_sammlung_entry_id"
            name="beschluss_sammlung_entry_id"
            value={beschlussId}
            onChange={(event) => setBeschlussId(event.target.value)}
            disabled={!isDraft || beschluesse.length === 0}
            aria-invalid={
              state.errors?.beschluss_sammlung_entry_id ? true : undefined
            }
            aria-describedby={
              state.errors?.beschluss_sammlung_entry_id
                ? "beschluss-error"
                : "beschluss-hint"
            }
            className="w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm disabled:opacity-60"
          >
            <option value="">— noch nicht zugeordnet —</option>
            {beschluesse.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          {state.errors?.beschluss_sammlung_entry_id ? (
            <p
              id="beschluss-error"
              role="alert"
              className="text-sm text-red-600 dark:text-red-400"
            >
              {state.errors.beschluss_sammlung_entry_id.join(" ")}
            </p>
          ) : (
            <p
              id="beschluss-hint"
              className="text-sm text-[color:var(--color-muted-foreground)]"
            >
              {beschluesse.length === 0 ? (
                <>
                  Für diese WEG ist noch kein zustimmender Beschluss erfasst.{" "}
                  <Link
                    href={`/wegs/${wegId}/beschluss-sammlung/new`}
                    className="underline underline-offset-4 hover:text-[color:var(--color-accent)]"
                  >
                    Beschluss erfassen
                  </Link>
                  .
                </>
              ) : (
                "Der Beschluss der Eigentümer über die Vorschüsse — er begründet die Zahlungspflicht, der Plan ist die Vorlage (§ 28 Abs. 1 WEG). Zum Aktivieren erforderlich. Umlaufbeschlüsse zählen."
              )}
            </p>
          )}
        </div>

        <div className="space-y-3 rounded-md border border-[var(--color-border)] p-4">
          <div>
            <h2 className="text-sm font-semibold text-[color:var(--color-foreground)]">
              Vorschau: monatliches Hausgeld pro Einheit
            </h2>
            <p className="mt-1 text-xs text-[color:var(--color-muted-foreground)]">
              Diese Vorschau zeigt rechnerische Werte. Bereits erzeugte
              Sollstellungen bleiben unverändert.
            </p>
          </div>

          {units.length === 0 ? (
            <p className="text-xs italic text-[color:var(--color-muted-foreground)]">
              Keine Wohneinheiten in dieser WEG vorhanden.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--color-border)] text-sm">
              {units.map((unit) => {
                const monthlyHausgeld =
                  unit.mea_nenner > 0
                    ? Math.round(
                        ((unit.mea_zaehler / unit.mea_nenner) *
                          numCosts *
                          100) /
                          12,
                      ) / 100
                    : 0;
                const formattedHausgeld = monthlyHausgeld.toLocaleString(
                  "de-DE",
                  {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  },
                );

                return (
                  <li key={unit.id} className="flex justify-between gap-4 py-2">
                    <span className="min-w-0">
                      {unit.bezeichnung}{" "}
                      <span className="text-xs text-[color:var(--color-muted-foreground)]">
                        (MEA: {unit.mea_zaehler}/{unit.mea_nenner})
                      </span>
                    </span>
                    <span className="shrink-0 font-mono font-semibold">
                      {formattedHausgeld} EUR
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center gap-4 pt-2">
          <Link
            href={`/wegs/${wegId}/finanzen`}
            className="text-sm underline underline-offset-4 hover:text-[var(--color-accent)]"
          >
            Abbrechen
          </Link>
          {isDraft ? <SubmitButton /> : null}
        </div>
      </form>

      {isDraft ? (
        <>
          <hr className="border-[var(--color-border)]" />

          <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/20">
            <h2 className="text-sm font-semibold text-red-800 dark:text-red-300">
              Gefahrenzone
            </h2>
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
              Durch das Löschen wird der Entwurf unwiderruflich entfernt.
              Aktivierte Pläne bleiben historisch geschützt.
            </p>

            {deleteError ? (
              <div
                role="alert"
                className="mt-3 rounded-md border border-red-200 bg-white p-3 text-xs text-red-600 dark:border-red-900/50 dark:bg-zinc-950 dark:text-red-400"
              >
                {deleteError}
              </div>
            ) : null}

            <button
              type="button"
              disabled={isDeleting}
              onClick={handleDelete}
              className="mt-4 rounded-md border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:bg-zinc-950 dark:text-red-400 dark:hover:bg-red-950/50"
            >
              {isDeleting
                ? "Wird gelöscht ..."
                : "Wirtschaftsplan-Entwurf unwiderruflich löschen"}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
