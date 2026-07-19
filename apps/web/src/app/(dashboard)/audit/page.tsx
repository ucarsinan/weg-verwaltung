import { PageHeader } from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/server";
import { getTenantClaims } from "@/modules/identity";
import {
  getArchivedFilesAction,
  getArchivablePartitionsAction,
  getAuditFeedAction,
  getDownloadUrlAction,
  getIntegrityStatusAction,
  revealAuditPayloadAction,
  verifyAuditIntegrityAction,
  type AuditFeedFilters,
} from "./actions";
import { AuditShell } from "./audit-shell";
import type { AuditFeedItem } from "./audit-feed";

export default async function AuditPage() {
  const supabase = await createClient();
  const { claims } = await getTenantClaims(supabase);
  const isAdmin = claims.role === "tenant_admin";

  const feed = await getAuditFeedAction({ limit: 50 });
  const integrity = isAdmin
    ? await getIntegrityStatusAction()
    : { status: null, error: null };
  const partitions = isAdmin
    ? await getArchivablePartitionsAction()
    : { partitions: [], error: null };
  const archivedFiles = isAdmin
    ? await getArchivedFilesAction()
    : { files: [], error: null };

  const archiveError =
    partitions.error || archivedFiles.error
      ? [partitions.error, archivedFiles.error].filter(Boolean).join(" ")
      : null;

  return (
    <section className="mx-auto max-w-7xl space-y-6 px-6 py-10">
      <PageHeader
        title="Audit"
        description="Nachvollziehbare Systemereignisse, Integritätsstatus und Archivübersicht. Einträge bleiben unveränderlich und werden mandantenisoliert gelesen."
      />

      <AuditShell
        isAdmin={isAdmin}
        initialFeed={feed.items}
        initialCursor={feed.nextCursor}
        initialFeedError={feed.error}
        initialIntegrityStatus={integrity.status}
        initialIntegrityError={integrity.error}
        archive={{
          partitions: partitions.partitions,
          files: archivedFiles.files,
          error: archiveError,
        }}
        onLoadFeed={loadAuditFeed}
        onRevealPayload={revealAuditPayload}
        onVerifyIntegrity={verifyAuditIntegrity}
        onDownloadArchive={getDownloadUrlAction}
      />
    </section>
  );
}

async function loadAuditFeed(filters: AuditFeedFilters) {
  "use server";
  return getAuditFeedAction(filters);
}

async function revealAuditPayload(event: AuditFeedItem) {
  "use server";
  const result = await revealAuditPayloadAction(event.id, event.created_at);
  if (result.error) {
    throw new Error(result.error);
  }
  return result.payload ?? null;
}

async function verifyAuditIntegrity() {
  "use server";
  const result = await verifyAuditIntegrityAction();
  if (result.error || !result.status) {
    throw new Error(result.error ?? "Integritätsprüfung lieferte kein Ergebnis.");
  }
  return result.status;
}
