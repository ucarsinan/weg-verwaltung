import { Bot } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { listReviewItems } from "@/lib/vorgangszentrale/queries";
import { acceptReviewAction, rejectReviewAction } from "../actions";
import { ReviewQueue } from "./review-queue";

export default async function VorgangReviewsPage() {
  const reviews = await listReviewItems({ limit: 100 });

  return (
    <section className="mx-auto max-w-7xl space-y-6 px-6 py-10">
      <PageHeader
        title="Reviews"
        description="Menschliche Entscheidungen zu KI- und Systemvorschlägen. Hochriskante Aktionen bleiben im ersten Schnitt review-only."
        actions={
          <Button asChild variant="outline">
            <Link href={"/vorgaenge" as Route}>Zurück zu Vorgängen</Link>
          </Button>
        }
      />

      {reviews.error ? (
        <p
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100"
        >
          {reviews.error}
        </p>
      ) : null}

      <ReviewQueue
        items={reviews.data}
        acceptAction={acceptReviewAction}
        rejectAction={rejectReviewAction}
        emptyIcon={<Bot />}
      />
    </section>
  );
}
