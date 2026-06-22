import { notFound } from "next/navigation";

import { getVorgangDetail } from "@/lib/vorgangszentrale/queries";
import {
  acceptReviewAction,
  addInternalNoteAction,
  createTaskAction,
  rejectReviewAction,
  requestVorgangAgentSuggestionAction,
  updateTaskStatusAction,
} from "../actions";
import { VorgangDetailView } from "./vorgang-detail";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function VorgangDetailPage({
  params,
}: {
  params: Promise<{ vorgangId: string }>;
}) {
  const { vorgangId } = await params;
  if (!UUID_RE.test(vorgangId)) notFound();

  const result = await getVorgangDetail(vorgangId);
  if (!result.data && !result.error) notFound();

  return (
    <section className="mx-auto max-w-7xl space-y-6 px-6 py-10">
      <VorgangDetailView
        detail={result.data}
        loadError={result.error}
        createTaskAction={createTaskAction}
        updateTaskStatusAction={updateTaskStatusAction}
        addInternalNoteAction={addInternalNoteAction}
        requestVorgangAgentSuggestionAction={requestVorgangAgentSuggestionAction}
        acceptReviewAction={acceptReviewAction}
        rejectReviewAction={rejectReviewAction}
      />
    </section>
  );
}
