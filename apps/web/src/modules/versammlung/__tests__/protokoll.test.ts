import { describe, expect, it, vi } from "vitest";

import {
  PROTOCOL_STATUSES,
  PROTOCOL_STATUS_LABEL,
  canSign,
  canSubmitRevision,
  isProtocolStatus,
} from "../protokoll-status";
import { executeSignProtokoll } from "../protokoll-sign";

describe("protokoll-status", () => {
  it("labels every canonical status (DB check 0032)", () => {
    for (const status of PROTOCOL_STATUSES) {
      expect(PROTOCOL_STATUS_LABEL[status]).toBeTruthy();
    }
  });

  it("narrows unknown strings via isProtocolStatus", () => {
    expect(isProtocolStatus("ki_entwurf")).toBe(true);
    expect(isProtocolStatus("verwalter_revision")).toBe(true);
    expect(isProtocolStatus("completed")).toBe(false);
    expect(isProtocolStatus(null)).toBe(false);
  });

  it("allows revision only from awaiting_review and signing only from ki_entwurf", () => {
    expect(canSubmitRevision("awaiting_review")).toBe(true);
    expect(canSubmitRevision("ki_entwurf")).toBe(false);
    expect(canSign("ki_entwurf")).toBe(true);
    expect(canSign("awaiting_review")).toBe(false);
    expect(canSign("unterzeichnet")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// executeSignProtokoll — pipeline through a scripted Supabase client
// ---------------------------------------------------------------------------

interface ScriptOptions {
  protocol?: Record<string, unknown> | null;
  uploadError?: { message: string } | null;
  docInsertError?: { message: string } | null;
}

function scriptedClient(options?: ScriptOptions) {
  const protocol =
    options?.protocol === undefined
      ? {
          id: "prot-1",
          status: "ki_entwurf",
          text: "# Protokoll",
          meeting_id: "meeting-1",
          document_id: null,
          meeting: {
            id: "meeting-1",
            weg_id: "weg-1",
            titel: "ETV 2026",
            termin_von: "2026-06-01T10:00:00Z",
            tenant_id: "tenant-1",
            status: "beendet",
          },
        }
      : options.protocol;

  const inserted = { document: [] as unknown[], document_version: [] as unknown[] };
  const updates = { document: [] as unknown[], protocol: [] as unknown[] };
  const insertLog = inserted as unknown as Record<string, unknown[] | undefined>;
  const updateLog = updates as unknown as Record<string, unknown[] | undefined>;
  const upload = vi.fn().mockResolvedValue({
    error: options?.uploadError ?? null,
  });

  const client = {
    from(table: string) {
      return {
        select: () => ({
          eq: () => ({
            single: async () =>
              table === "protocol"
                ? { data: protocol, error: protocol ? null : { message: "not found" } }
                : { data: null, error: { message: `unexpected select on ${table}` } },
          }),
        }),
        insert: (row: unknown) => ({
          select: () => ({
            single: async () => {
              if (table === "document" && options?.docInsertError) {
                return { data: null, error: options.docInsertError };
              }
              insertLog[table]?.push(row);
              return {
                data: { id: table === "document" ? "doc-1" : "version-1" },
                error: null,
              };
            },
          }),
        }),
        update: (row: unknown) => ({
          eq: async () => {
            updateLog[table]?.push(row);
            return { error: null };
          },
        }),
      };
    },
    storage: {
      from: () => ({ upload }),
    },
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }),
    },
  };

  return { client, inserted, updates, upload };
}

const renderPdf = vi.fn(async () => Buffer.from("pdf-bytes"));

function deps(client: unknown) {
  return {
    supabase: client as never,
    renderPdf,
    now: () => new Date("2026-07-16T12:00:00Z"),
  };
}

describe("executeSignProtokoll", () => {
  it("runs the full pipeline: PDF → upload → document rows → unterzeichnet", async () => {
    const { client, inserted, updates, upload } = scriptedClient();

    const result = await executeSignProtokoll(deps(client), "prot-1");

    expect(result).toEqual({ documentId: "doc-1", meetingId: "meeting-1" });
    expect(upload).toHaveBeenCalledWith(
      "tenant-1/weg-1/protokoll/prot-1.pdf",
      expect.any(Buffer),
      { contentType: "application/pdf", upsert: false },
    );
    expect(inserted.document[0]).toMatchObject({
      doc_typ: "protokoll",
      weg_id: "weg-1",
      created_by: "user-1",
    });
    expect(inserted.document_version[0]).toMatchObject({
      document_id: "doc-1",
      sha256: expect.stringMatching(/^\\x[0-9a-f]{64}$/),
    });
    expect(updates.protocol[0]).toMatchObject({
      status: "unterzeichnet",
      unterzeichnet_von: "user-1",
      document_id: "doc-1",
    });
  });

  it("rejects a double sign before any side effect", async () => {
    const { client, upload } = scriptedClient({
      protocol: {
        id: "prot-1",
        status: "ki_entwurf",
        text: "x",
        meeting_id: "meeting-1",
        document_id: "doc-existing",
        meeting: { status: "beendet" },
      },
    });

    await expect(executeSignProtokoll(deps(client), "prot-1")).rejects.toThrow(
      /bereits unterzeichnet/,
    );
    expect(upload).not.toHaveBeenCalled();
  });

  it("rejects signing outside ki_entwurf (statemachine precondition)", async () => {
    const { client } = scriptedClient({
      protocol: {
        id: "prot-1",
        status: "awaiting_review",
        text: "x",
        meeting_id: "meeting-1",
        document_id: null,
        meeting: { status: "beendet" },
      },
    });

    await expect(executeSignProtokoll(deps(client), "prot-1")).rejects.toThrow(
      /aktueller Status: awaiting_review/,
    );
  });

  it("rejects signing while the meeting is not beendet", async () => {
    const { client } = scriptedClient({
      protocol: {
        id: "prot-1",
        status: "ki_entwurf",
        text: "x",
        meeting_id: "meeting-1",
        document_id: null,
        meeting: {
          id: "meeting-1",
          weg_id: "weg-1",
          titel: "ETV",
          termin_von: null,
          tenant_id: "tenant-1",
          status: "laufend",
        },
      },
    });

    await expect(executeSignProtokoll(deps(client), "prot-1")).rejects.toThrow(
      /erst nach Beenden/,
    );
  });

  it("surfaces a failed storage upload without touching document rows", async () => {
    const { client, inserted } = scriptedClient({
      uploadError: { message: "bucket missing" },
    });

    await expect(executeSignProtokoll(deps(client), "prot-1")).rejects.toThrow(
      /PDF-Upload fehlgeschlagen: bucket missing/,
    );
    expect(inserted.document).toHaveLength(0);
  });
});
