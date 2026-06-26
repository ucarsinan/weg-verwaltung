import { Inbox } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import {
  listInboxItems,
  listVorgaenge,
} from "@/lib/vorgangszentrale/queries";
import {
  classifyInboxItemAction,
  convertInboxItemAction,
  dismissInboxItemAction,
  linkInboxItemAction,
} from "../actions";
import { InboxTriage } from "./inbox-triage";

export default async function VorgangInboxPage() {
  const [inbox, vorgaenge] = await Promise.all([
    listInboxItems({ statuses: ["new", "classified", "failed"], limit: 100 }),
    listVorgaenge({ limit: 100 }),
  ]);
  const error = inbox.error ?? vorgaenge.error;

  return (
    <section className="mx-auto max-w-7xl space-y-6 px-6 py-10">
      <PageHeader
        title="Inbox"
        description="Triage für neue Eingangselemente. Kein Eintrag wird automatisch portal-sichtbar."
        actions={
          <Button asChild variant="outline">
            <Link href={"/vorgaenge" as Route}>Zurück zu Vorgängen</Link>
          </Button>
        }
      />

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100"
        >
          {error}
        </p>
      ) : null}

      <InboxTriage
        items={inbox.data}
        candidateVorgaenge={vorgaenge.data}
        classifyAction={classifyInboxItemAction}
        dismissAction={dismissInboxItemAction}
        linkAction={linkInboxItemAction}
        convertAction={convertInboxItemAction}
        emptyIcon={<Inbox />}
      />
    </section>
  );
}
