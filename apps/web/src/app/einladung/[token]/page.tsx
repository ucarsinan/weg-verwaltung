import Link from "next/link";

import { createClient } from "@/lib/supabase/server";

import { acceptInvitationAction, signUpForInvitationAction } from "./actions";
import { AcceptInvitationForm, InvitationSignUpForm } from "./invitation-forms";

export const metadata = { title: "Einladung annehmen — WEG-Verwaltung" };

interface EinladungPageProps {
  params: Promise<{ token: string }>;
}

function AlreadyMemberNotice() {
  return (
    <div className="space-y-3">
      <p
        role="alert"
        className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
      >
        Ihr Konto gehört bereits einer WEG an. In dieser Version kann ein Konto nur einer
        einzigen WEG angehören, daher kann diese Einladung nicht angenommen werden.
      </p>
      <Link
        href="/dashboard"
        className="text-sm font-medium text-[color:var(--color-ai-violet)] underline-offset-4 hover:underline"
      >
        Zum Dashboard
      </Link>
    </div>
  );
}

export default async function EinladungPage({ params }: EinladungPageProps) {
  const { token } = await params;
  // Bind token server-side so the form action carries it without client exposure.
  const signUpAction = signUpForInvitationAction.bind(null, token);
  const acceptAction = acceptInvitationAction.bind(null, token);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl items-center px-6 py-12">
        <section className="w-full rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-6 shadow-xl sm:p-8">
          <p className="text-sm font-medium text-[color:var(--color-muted-foreground)]">
            Einladung zu einer WEG
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Konto erstellen, um beizutreten.</h1>
          <p className="mt-3 text-sm leading-6 text-[color:var(--color-muted-foreground)]">
            Nutzen Sie die E-Mail-Adresse, an die die Einladung geschickt wurde.
          </p>
          <div className="mt-8">
            <InvitationSignUpForm action={signUpAction} token={token} />
          </div>
        </section>
      </main>
    );
  }

  const { data } = await supabase.auth.getClaims();
  const appMetadata = (
    data?.claims as { app_metadata?: { tenant_id?: string } } | undefined
  )?.app_metadata;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl items-center px-6 py-12">
      <section className="w-full rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-6 shadow-xl sm:p-8">
        <p className="text-sm font-medium text-[color:var(--color-muted-foreground)]">
          Einladung zu einer WEG
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Einladung annehmen.</h1>
        <div className="mt-8">
          {appMetadata?.tenant_id ? (
            <AlreadyMemberNotice />
          ) : (
            <AcceptInvitationForm action={acceptAction} />
          )}
        </div>
      </section>
    </main>
  );
}
