"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

interface MfaFactor {
  id: string;
  friendly_name?: string | null;
  factor_type?: string;
  status?: string;
}

interface Enrollment {
  factorId: string;
  qrCode: string | null;
  secret: string | null;
}

function getErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "MFA-Aktion fehlgeschlagen.";
}

export function MfaPanel() {
  const [factors, setFactors] = useState<MfaFactor[]>([]);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const supabase = useMemo(() => createClient(), []);

  const refreshFactors = useCallback(() => {
    startTransition(async () => {
      setError(null);
      const { data, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) {
        setError(getErrorMessage(listError));
        return;
      }
      setFactors((data?.totp ?? []) as MfaFactor[]);
    });
  }, [supabase]);

  useEffect(() => {
    refreshFactors();
  }, [refreshFactors]);

  function enroll() {
    startTransition(async () => {
      setError(null);
      setMessage(null);
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "WEG-Verwaltung",
      });
      if (enrollError || !data) {
        setError(getErrorMessage(enrollError));
        return;
      }
      setEnrollment({
        factorId: data.id,
        qrCode: data.totp?.qr_code ?? null,
        secret: data.totp?.secret ?? null,
      });
    });
  }

  function verify() {
    if (!enrollment) return;
    startTransition(async () => {
      setError(null);
      setMessage(null);
      const { data: challengeData, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId: enrollment.factorId });
      if (challengeError || !challengeData) {
        setError(getErrorMessage(challengeError));
        return;
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: enrollment.factorId,
        challengeId: challengeData.id,
        code,
      });
      if (verifyError) {
        setError(getErrorMessage(verifyError));
        return;
      }

      setEnrollment(null);
      setCode("");
      setMessage("MFA-Faktor aktiviert.");
      refreshFactors();
    });
  }

  function unenroll(factorId: string) {
    startTransition(async () => {
      setError(null);
      setMessage(null);
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({
        factorId,
      });
      if (unenrollError) {
        setError(getErrorMessage(unenrollError));
        return;
      }
      setMessage("MFA-Faktor entfernt.");
      refreshFactors();
    });
  }

  return (
    <div className="space-y-4 rounded-md border border-[color:var(--color-border)] p-4">
      <div className="space-y-1">
        <p className="text-sm font-medium text-[color:var(--color-foreground)]">
          Multi-Faktor-Authentifizierung
        </p>
        <p className="text-sm leading-6 text-[color:var(--color-muted-foreground)]">
          TOTP-Faktoren für Authenticator-Apps verwalten.
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">
          {message}
        </p>
      ) : null}

      {factors.length > 0 ? (
        <ul className="space-y-2">
          {factors.map((factor) => (
            <li
              key={factor.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-[color:var(--color-secondary)]/40 p-3 text-sm"
            >
              <span>
                {factor.friendly_name ?? "TOTP"} · {factor.status ?? "unbekannt"}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() => unenroll(factor.id)}
              >
                Entfernen
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[color:var(--color-muted-foreground)]">
          Kein TOTP-Faktor eingerichtet.
        </p>
      )}

      {enrollment ? (
        <div className="space-y-3 rounded-md bg-[color:var(--color-secondary)]/40 p-3">
          {enrollment.qrCode ? (
            // Supabase returns a data URL for TOTP QR enrollment.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={enrollment.qrCode}
              alt="MFA QR-Code"
              className="size-40 rounded-md bg-white p-2"
            />
          ) : null}
          {enrollment.secret ? (
            <p className="break-all font-mono text-xs text-[color:var(--color-muted-foreground)]">
              {enrollment.secret}
            </p>
          ) : null}
          <div className="space-y-1">
            <label htmlFor="mfa-code" className="block text-sm font-medium">
              Code aus der Authenticator-App
            </label>
            <input
              id="mfa-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              className="w-full rounded-md border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
            />
          </div>
          <Button type="button" disabled={isPending || code.length < 6} onClick={verify}>
            MFA aktivieren
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" disabled={isPending} onClick={enroll}>
          TOTP-Faktor hinzufügen
        </Button>
      )}
    </div>
  );
}
