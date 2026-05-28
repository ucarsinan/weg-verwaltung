import { WegForm } from "./weg-form";

// Server Component — renders the Anlage-Form. No client interactivity lives
// here; the form island is the sibling client component. The root layout
// already provides <main>, so this section is a plain landmark-free wrapper
// (docs/05 §5.10 — no nested landmarks).

export default function NewWegPage() {
  return (
    <section className="mx-auto max-w-2xl px-6 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Neue WEG anlegen
        </h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Stammdaten der Wohnungseigentümergemeinschaft. Die Anlage erfolgt
          in Ihrem aktuellen Mandanten — die WEG ist nur für Ihre Kanzlei
          sichtbar.
        </p>
      </header>
      <WegForm />
    </section>
  );
}
