import { beforeEach, describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// jsdoms File/Blob-Polyfill kennt `arrayBuffer()` nicht (Stand jsdom in
// diesem Projekt) — die Action liest die Datei aber genau so, weil das der
// echte Browser-Weg ist. Nachgerüstet über FileReader, das jsdom vollständig
// implementiert, nur für diese Testdatei (ein Vitest-Testfile bekommt eine
// eigene jsdom-Umgebung, das Prototyp-Patch bleibt also isoliert).
if (typeof File.prototype.arrayBuffer !== "function") {
  File.prototype.arrayBuffer = function (this: Blob) {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}

const mockFrom = vi.fn();
const mockStorageUpload = vi.fn();
const mockStorageRemove = vi.fn();
const mockStorageFrom = vi.fn(() => ({
  upload: mockStorageUpload,
  remove: mockStorageRemove,
}));

const mockAuth = {
  getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
  getClaims: vi.fn().mockResolvedValue({
    data: {
      claims: { app_metadata: { tenant_id: "tenant-1", role: "verwalter" } },
    },
    error: null,
  }),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      from: mockFrom,
      auth: mockAuth,
      storage: { from: mockStorageFrom },
    }),
  ),
}));

import { uploadDokumentAction } from "../actions";

const WEG_ID = "22222222-2222-4222-8222-222222222222";
const DOC_ID = "33333333-3333-4333-8333-333333333333";

const PDF = new File(["inhalt"], "wartung.pdf", { type: "application/pdf" });

/** Erfolgreicher `insert(...).select("id").single()`-Pfad fuer das Dokument. */
function documentInsertOk(id = DOC_ID) {
  return {
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id }, error: null }),
      }),
    }),
  };
}

function documentInsertFails(error: { code?: string } = { code: "500" }) {
  return {
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: null, error }),
      }),
    }),
  };
}

function versionInsertOk() {
  return { insert: vi.fn().mockResolvedValue({ error: null }) };
}

function versionInsertFails(error: { code?: string } = { code: "500" }) {
  return { insert: vi.fn().mockResolvedValue({ error }) };
}

function dokumentFormData(
  overrides: Record<string, string> = {},
  { includeDatei = true } = {},
) {
  const fd = new FormData();
  fd.set("weg_id", WEG_ID);
  fd.set("titel", "Heizungswartung 2019");
  fd.set("doc_typ", "rechnung");
  fd.set("dokument_datum", "2019-03-15");
  if (includeDatei) fd.set("datei", PDF);
  for (const [key, value] of Object.entries(overrides)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFrom.mockReset();
  mockStorageUpload.mockReset().mockResolvedValue({ error: null });
  mockStorageRemove.mockReset().mockResolvedValue({ error: null });
});

describe("uploadDokumentAction", () => {
  it("rejects an invalid WEG id before touching the database", async () => {
    const state = await uploadDokumentAction(
      {},
      dokumentFormData({ weg_id: "nope" }),
    );

    expect(state.errors?._form).toBeDefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("reports a field error for a missing title, without touching the database", async () => {
    const state = await uploadDokumentAction(
      {},
      dokumentFormData({ titel: "" }),
    );

    expect(state.errors?.titel).toBeDefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("uploads the file, records the version and redirects to the list", async () => {
    mockFrom
      .mockReturnValueOnce(documentInsertOk())
      .mockReturnValueOnce(versionInsertOk());

    // `redirect()` wirft im echten Betrieb NEXT_REDIRECT und kehrt nie
    // zurueck; hier ist es ein No-Op-Mock, der Rueckgabewert ist deshalb kein
    // gueltiger DokumentFormState mehr — wie im Muster der
    // Verteilungsschluessel-Actions wird auf den Redirect-Pfad geprueft,
    // nicht auf den (in diesem Zweig bedeutungslosen) Rueckgabewert.
    await uploadDokumentAction({}, dokumentFormData());

    // Storage-Pfad folgt dem Muster aus baueStoragePfad: tenant/weg/doctyp/id.ext
    expect(mockStorageFrom).toHaveBeenCalledWith("weg-docs");
    expect(mockStorageUpload).toHaveBeenCalledTimes(1);
    const [path, bytes, options] = mockStorageUpload.mock.calls[0] ?? [];
    expect(path).toBe(`tenant-1/${WEG_ID}/rechnung/${DOC_ID}.pdf`);
    expect(Buffer.isBuffer(bytes)).toBe(true);
    expect(options).toEqual({ contentType: "application/pdf", upsert: false });

    // Die Version traegt die serverseitig berechnete Pruefsumme, hex-codiert
    // mit dem PostgREST-bytea-Praefix "\x" — kein rohes Buffer-Objekt.
    const versionCall = mockFrom.mock.results[1]?.value as {
      insert: ReturnType<typeof vi.fn>;
    };
    const [versionRow] = versionCall.insert.mock.calls[0] ?? [];
    expect(versionRow).toMatchObject({
      document_id: DOC_ID,
      version_no: 1,
      storage_path: `tenant-1/${WEG_ID}/rechnung/${DOC_ID}.pdf`,
      mime_type: "application/pdf",
      file_size_bytes: 6,
      uploaded_by: "user-1",
    });
    expect(versionRow.sha256).toMatch(/^\\x[0-9a-f]{64}$/);

    expect(revalidatePath).toHaveBeenCalledWith(`/wegs/${WEG_ID}/dokumente`);
    expect(redirect).toHaveBeenCalledWith(`/wegs/${WEG_ID}/dokumente`);
  });

  it("stops before Storage when the document insert fails", async () => {
    mockFrom.mockReturnValueOnce(documentInsertFails());

    const state = await uploadDokumentAction({}, dokumentFormData());

    expect(state.errors?._form).toBeDefined();
    expect(mockStorageUpload).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("reports the file field when the Storage upload fails, without writing a version", async () => {
    mockFrom.mockReturnValueOnce(documentInsertOk());
    mockStorageUpload.mockResolvedValue({
      error: { message: "already exists" },
    });

    const state = await uploadDokumentAction({}, dokumentFormData());

    expect(state.errors?.datei).toBeDefined();
    // Nur EIN from()-Aufruf (das Dokument) — document_version wird nicht mehr
    // angefasst, wenn der Upload schon scheitert.
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(redirect).not.toHaveBeenCalled();
  });

  it(
    "removes the orphaned file when the version insert fails, and logs both " +
      "failures honestly when the cleanup itself also fails",
    async () => {
      mockFrom
        .mockReturnValueOnce(documentInsertOk())
        .mockReturnValueOnce(versionInsertFails({ code: "23502" }));
      mockStorageRemove.mockResolvedValue({
        error: { message: "network error" },
      });
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

      const state = await uploadDokumentAction({}, dokumentFormData());

      expect(state.errors?._form).toBeDefined();
      expect(mockStorageRemove).toHaveBeenCalledWith([
        `tenant-1/${WEG_ID}/rechnung/${DOC_ID}.pdf`,
      ]);

      // Beide Fehlschlaege muessen protokolliert sein — die verwaiste Datei
      // bleibt sonst unbemerkt, wenn auch das Aufraeumen scheitert.
      const scopes = consoleError.mock.calls.map((call) => call[0]);
      expect(scopes).toEqual(
        expect.arrayContaining([
          "[uploadDokument.version] request failed",
          "[uploadDokument.cleanup] request failed",
        ]),
      );

      consoleError.mockRestore();
    },
  );

  it("still reports the save failure when the cleanup succeeds", async () => {
    mockFrom
      .mockReturnValueOnce(documentInsertOk())
      .mockReturnValueOnce(versionInsertFails());

    const state = await uploadDokumentAction({}, dokumentFormData());

    expect(state.errors?._form).toBeDefined();
    expect(mockStorageRemove).toHaveBeenCalledWith([
      `tenant-1/${WEG_ID}/rechnung/${DOC_ID}.pdf`,
    ]);
    expect(redirect).not.toHaveBeenCalled();
  });
});
