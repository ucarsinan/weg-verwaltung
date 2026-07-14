"use client";

import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { planForUnitCount } from "@/modules/saas/subscription";

import { createSelfManagedWegAction, type OnboardingState } from "./actions";

const initialState: OnboardingState = {};
const steps = ["Ihre Gemeinschaft", "Die WEG", "Einheiten", "Prüfen"];

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "WEG wird eingerichtet..." : "WEG kostenlos anlegen"}</Button>;
}

export function OnboardingWizard() {
  const [step, setStep] = useState(0);
  const [unitCount, setUnitCount] = useState(3);
  const [state, action] = useActionState(createSelfManagedWegAction, initialState);
  const plan = planForUnitCount(unitCount);

  return (
    <form action={action} className="space-y-8" noValidate>
      <ol className="grid grid-cols-4 gap-2" aria-label="Einrichtungsschritte">
        {steps.map((label, index) => <li key={label} className={`text-center text-xs ${index <= step ? "font-semibold text-[color:var(--color-foreground)]" : "text-[color:var(--color-muted-foreground)]"}`}>{index + 1}. {label}</li>)}
      </ol>

      {/* Jeder Schritt bleibt gemountet und wird nur per `hidden` ausgeblendet.
          Conditional Rendering (`step === n ? … : null`) nimmt die Inputs aus dem
          DOM — beim Submit auf Schritt 4 wäre die FormData dann leer und die
          Action lehnt mit "Bitte prüfen Sie die markierten Angaben" ab.
          `hidden` steht bewusst auf einem klassenlosen <div>: eine Tailwind-
          Display-Utility (grid/flex) auf demselben Element würde display:none
          überschreiben. */}
      <div hidden={step !== 0}><section className="space-y-4"><div><label htmlFor="tenantName" className="block text-sm font-medium">Name Ihrer Gemeinschaft</label><Input id="tenantName" name="tenantName" required className="mt-2 h-11" placeholder="Eigentümergemeinschaft Musterstraße 12" aria-invalid={state.fieldErrors?.tenantName ? true : undefined} />{state.fieldErrors?.tenantName ? <p role="alert" className="mt-1 text-sm text-[color:var(--color-destructive)]">{state.fieldErrors.tenantName}</p> : null}</div><p className="text-sm text-[color:var(--color-muted-foreground)]">Sie werden als erster Admin eingerichtet und können weitere Admins hinzufügen.</p></section></div>

      <div hidden={step !== 1}><section className="grid gap-4"><div><label htmlFor="wegName" className="block text-sm font-medium">Name der WEG</label><Input id="wegName" name="wegName" required className="mt-2 h-11" placeholder="WEG Musterstraße 12" aria-invalid={state.fieldErrors?.wegName ? true : undefined} /></div><div><label htmlFor="strasse" className="block text-sm font-medium">Straße und Hausnummer</label><Input id="strasse" name="strasse" required className="mt-2 h-11" /></div><div className="grid grid-cols-[9rem_1fr] gap-3"><div><label htmlFor="plz" className="block text-sm font-medium">PLZ</label><Input id="plz" name="plz" inputMode="numeric" required className="mt-2 h-11" /></div><div><label htmlFor="ort" className="block text-sm font-medium">Ort</label><Input id="ort" name="ort" required className="mt-2 h-11" /></div></div></section></div>

      <div hidden={step !== 2}><section className="space-y-4"><div><label htmlFor="unitCount" className="block text-sm font-medium">Wie viele Einheiten hat Ihre WEG?</label><Input id="unitCount" name="unitCount" type="number" min="3" max="20" value={unitCount} onChange={(event) => setUnitCount(Number(event.target.value))} required className="mt-2 h-11" aria-invalid={state.fieldErrors?.unitCount ? true : undefined} /></div>{plan ? <p className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-secondary)] p-3 text-sm">Ihr Tarif: <strong>{plan === "start" ? "Start — 12,90 € / Monat" : "Gemeinschaft — 24,90 € / Monat"}</strong>. Die ersten 30 Tage sind kostenlos.</p> : <p role="alert" className="text-sm text-[color:var(--color-destructive)]">Das Angebot gilt für 3 bis 20 Einheiten.</p>}</section></div>

      <div hidden={step !== 3}><section className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-secondary)] p-5"><CheckCircle2 className="size-5 text-emerald-700" aria-hidden="true" /><h2 className="mt-3 text-lg font-semibold">Bereit für Ihre gemeinsame WEG</h2><p className="mt-2 text-sm leading-6 text-[color:var(--color-muted-foreground)]">Nach dem Anlegen können Sie Einheiten und weitere Eigentümer hinzufügen. Die Testphase endet nach 30 Tagen; bis dahin sind keine Zahlungsdaten nötig.</p></section></div>

      {state.message ? <p role="alert" className="rounded-md border border-[color:var(--color-destructive)]/30 p-3 text-sm text-[color:var(--color-destructive)]">{state.message}</p> : null}
      <div className="flex items-center justify-between gap-3">{step > 0 ? <Button type="button" variant="outline" onClick={() => setStep(step - 1)}><ArrowLeft /> Zurück</Button> : <span />}{step < steps.length - 1 ? <Button type="button" onClick={() => setStep(step + 1)}>Weiter <ArrowRight /></Button> : <SubmitButton />}</div>
    </form>
  );
}

