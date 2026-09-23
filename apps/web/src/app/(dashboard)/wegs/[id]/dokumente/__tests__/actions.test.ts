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

const WEG_ID = "22222222-2222-4222-8222-222222222222";
// Nur für neueVersionAction/loescheDokumentAction: dort kommt die Dokument-ID
// als Formularfeld herein, sie ist also frei wählbar. uploadDokumentAction
// generiert ihre eigene ID über das echte `crypto.randomUUID()` — dessen Wert
// wird pro Test aus dem tatsächlichen Storage-Aufruf gelesen, statt ihn zu
// mocken (ein Mock auf "node:crypto" griff unter Vitest/jsdom hier nicht
// zuverlässig).
const DOC_ID = "33333333-3333-4333-8333-333333333333";

const mockFrom = vi.fn();
const mockStorageUpload = vi.fn();
// Kein `remove` mehr: weg-docs vergibt laut 0015 keine DELETE-Policy auf
// storage.objects, die Action ruft es also nie auf (siehe Ruling zu Fix
// Round 1 — `raeumeDateiAuf` war totes/unausführbares Kompensationscode).
const mockStorageFrom = vi.fn(() => ({ upload: mockStorageUpload }));

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

import {
  loescheDokumentAction,
  neueVersionAction,
  uploadDokumentAction,
} from "../actions";

const PDF = new File(["inhalt"], "wartung.pdf", { type: "application/pdf" });

/** Pfadmuster: tenant/weg/doctyp/<uuid>-v<versionNo>-<eindeutig, 8 Hex>.ext */
function parsePfad(pfad: string) {
  const match = new RegExp(
    `^tenant-1/${WEG_ID}/rechnung/([0-9a-f-]{36})-v(\\d+)-([0-9a-f]{8})\\.pdf$`,
    "i",
  ).exec(pfad);
  return match
    ? { dokumentId: match[1], versionNo: Number(match[2]), eindeutig: match[3] }
    : null;
}

/**
 * Erfolgreicher `insert(...).select("id").single()`-Pfad fuer das Dokument.
 * Echot die tatsaechlich uebergebene `id` zurueck — uploadDokumentAction
 * generiert sie selbst uber `crypto.randomUUID()`, ein fest verdrahteter Wert
 * waere von der Zeile entkoppelt, die tatsaechlich getestet wird.
 */
function documentInsertOk() {
  const insert = vi.fn((row: { id: string }) => ({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: { id: row.id }, error: null }),
    }),
  }));
  return { insert };
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

/**
 * `.update({...}).eq("id", ...)` — die Soft-Delete-Kompensation in
 * `uploadDokumentAction`, wenn der Versions-Insert scheitert (ein `eq`).
 * Betrifft nur die Dokumentzeile — die Datei selbst kann nicht kompensiert
 * werden (siehe orphanCall-Assertions), das ist der Kern von Fix Round 1.
 */
function documentCleanupUpdateOk() {
  const eq = vi.fn().mockResolvedValue({ error: null });
  return { update: vi.fn().mockReturnValue({ eq }) };
}

function documentCleanupUpdateFails(error: { code?: string } = { code: "500" }) {
  const eq = vi.fn().mockResolvedValue({ error });
  return { update: vi.fn().mockReturnValue({ eq }) };
}

/**
 * `.update({...}).eq("id", ...).eq("weg_id", ...).select("id")` —
 * `loescheDokumentAction`. Das `.select("id")` ist Pflicht in der echten
 * Action (PostgREST meldet sonst keinen Fehler bei null getroffenen Zeilen),
 * die Mocks bilden das nach: `matchedIds` steuert, was `data` liefert.
 */
function loescheUpdateOk(matchedIds: string[] = [DOC_ID]) {
  const select = vi
    .fn()
    .mockResolvedValue({ data: matchedIds.map((id) => ({ id })), error: null });
  const eq2 = vi.fn().mockReturnValue({ select });
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
  return { update: vi.fn().mockReturnValue({ eq: eq1 }) };
}

function loescheUpdateFails(error: { code?: string } = { code: "500" }) {
  const select = vi.fn().mockResolvedValue({ data: null, error });
  const eq2 = vi.fn().mockReturnValue({ select });
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
  return { update: vi.fn().mockReturnValue({ eq: eq1 }) };
}

/** `.select("id, doc_typ").eq("id", ...).eq("weg_id", ...).single()`. */
function documentLookupOk(docTyp = "rechnung") {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi
            .fn()
            .mockResolvedValue({ data: { id: DOC_ID, doc_typ: docTyp }, error: null }),
        }),
      }),
    }),
  };
}

function documentLookupFails(error: { code?: string } = { code: "PGRST116" }) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error }),
        }),
      }),
    }),
  };
}

/** `.select("version_no").eq(...).order(...).limit(1)`. */
function versionenListe(rows: { version_no: number }[]) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
        }),
      }),
    }),
  };
}

function versionenListeFails(error: { code?: string } = { code: "500" }) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: null, error }),
        }),
      }),
    }),
  };
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

function neueVersionFormData(overrides: Record<string, string> = {}, includeDatei = true) {
  const fd = new FormData();
  fd.set("weg_id", WEG_ID);
  fd.set("dokument_id", DOC_ID);
  if (includeDatei) fd.set("datei", PDF);
  for (const [key, value] of Object.entries(overrides)) fd.set(key, value);
  return fd;
}

function loescheFormData(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("weg_id", WEG_ID);
  fd.set("dokument_id", DOC_ID);
  for (const [key, value] of Object.entries(overrides)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFrom.mockReset();
  mockStorageUpload.mockReset().mockResolvedValue({ error: null });
});

describe("uploadDokumentAction", () => {
  it("rejects an invalid WEG id before touching the database or Storage", async () => {
    const state = await uploadDokumentAction(
      {},
      dokumentFormData({ weg_id: "nope" }),
    );

    expect(state.errors?._form).toBeDefined();
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockStorageUpload).not.toHaveBeenCalled();
  });

  it("reports a field error for a missing title, without touching Storage", async () => {
    const state = await uploadDokumentAction(
      {},
      dokumentFormData({ titel: "" }),
    );

    expect(state.errors?.titel).toBeDefined();
    expect(mockStorageUpload).not.toHaveBeenCalled();
  });

  it("uploads first, writes the document with the pre-generated id, then the version", async () => {
    mockFrom
      .mockReturnValueOnce(documentInsertOk())
      .mockReturnValueOnce(versionInsertOk());

    // `redirect()` wirft im echten Betrieb NEXT_REDIRECT und kehrt nie
    // zurueck; hier ist es ein No-Op-Mock, der Rueckgabewert ist deshalb kein
    // gueltiger DokumentFormState mehr — wie im Muster der
    // Verteilungsschluessel-Actions wird auf den Redirect-Pfad geprueft,
    // nicht auf den (in diesem Zweig bedeutungslosen) Rueckgabewert.
    await uploadDokumentAction({}, dokumentFormData());

    // Storage zuerst: der Pfad enthaelt schon die ID, die erst danach in die
    // Dokumentzeile geschrieben wird, das Versions-Segment "-v1" und ein
    // Zufallsanteil ("eindeutig"). Die ID selbst kommt aus dem echten
    // `crypto.randomUUID()` — hier aus dem tatsaechlichen Aufruf gelesen,
    // statt sie zu mocken.
    expect(mockStorageFrom).toHaveBeenCalledWith("weg-docs");
    expect(mockStorageUpload).toHaveBeenCalledTimes(1);
    const [path, bytes, options] = mockStorageUpload.mock.calls[0] ?? [];
    const geparst = parsePfad(path);
    expect(geparst).not.toBeNull();
    expect(geparst?.versionNo).toBe(1);
    expect(Buffer.isBuffer(bytes)).toBe(true);
    expect(options).toEqual({ contentType: "application/pdf", upsert: false });

    // Danach erst die Dokumentzeile — mit genau der ID aus dem Storage-Pfad.
    const documentCall = mockFrom.mock.results[0]?.value as {
      insert: ReturnType<typeof vi.fn>;
    };
    const [documentRow] = documentCall.insert.mock.calls[0] ?? [];
    expect(documentRow).toMatchObject({ id: geparst?.dokumentId, weg_id: WEG_ID });

    // Die Version traegt die serverseitig berechnete Pruefsumme, hex-codiert
    // mit dem PostgREST-bytea-Praefix "\x" — kein rohes Buffer-Objekt.
    const versionCall = mockFrom.mock.results[1]?.value as {
      insert: ReturnType<typeof vi.fn>;
    };
    const [versionRow] = versionCall.insert.mock.calls[0] ?? [];
    expect(versionRow).toMatchObject({
      document_id: geparst?.dokumentId,
      version_no: 1,
      storage_path: path,
      mime_type: "application/pdf",
      file_size_bytes: 6,
      uploaded_by: "user-1",
    });
    expect(versionRow.sha256).toMatch(/^\\x[0-9a-f]{64}$/);

    expect(revalidatePath).toHaveBeenCalledWith(`/wegs/${WEG_ID}/dokumente`);
    expect(redirect).toHaveBeenCalledWith(`/wegs/${WEG_ID}/dokumente`);
  });

  it("never touches the database when the Storage upload fails", async () => {
    mockStorageUpload.mockResolvedValue({
      error: { message: "network error", name: "StorageError" },
    });

    const state = await uploadDokumentAction({}, dokumentFormData());

    expect(state.errors?.datei).toBeDefined();
    expect(mockFrom).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it(
    "logs the orphaned file when the document insert fails, since weg-docs " +
      "grants no delete policy (0015) to remove it",
    async () => {
      mockFrom.mockReturnValueOnce(documentInsertFails());
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

      const state = await uploadDokumentAction({}, dokumentFormData());

      const [uploadedPath] = mockStorageUpload.mock.calls[0] ?? [];

      expect(state.errors?._form).toBeDefined();
      // Kein document_version-Versuch — nur EIN from()-Aufruf (das Dokument).
      expect(mockFrom).toHaveBeenCalledTimes(1);
      expect(redirect).not.toHaveBeenCalled();

      const orphanCall = consoleError.mock.calls.find((call) =>
        String(call[0]).includes("[uploadDokument] orphaned storage object"),
      );
      expect(orphanCall).toBeDefined();
      expect(orphanCall?.[1]).toMatchObject({ pfad: uploadedPath });

      consoleError.mockRestore();
    },
  );

  it(
    "logs the orphaned file and soft-deletes the document when the version " +
      "insert fails",
    async () => {
      mockFrom
        .mockReturnValueOnce(documentInsertOk())
        .mockReturnValueOnce(versionInsertFails({ code: "23502" }))
        .mockReturnValueOnce(documentCleanupUpdateFails());
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

      const state = await uploadDokumentAction({}, dokumentFormData());

      const [uploadedPath] = mockStorageUpload.mock.calls[0] ?? [];

      expect(state.errors?._form).toBeDefined();

      const softDeleteCall = mockFrom.mock.results[2]?.value as {
        update: ReturnType<typeof vi.fn>;
      };
      expect(softDeleteCall.update).toHaveBeenCalledWith(
        expect.objectContaining({ deleted_at: expect.any(String) }),
      );

      // Die Datei kann nicht entfernt werden (0015: keine DELETE-Policy auf
      // storage.objects) — sie muss protokolliert sein, ebenso der
      // fehlgeschlagene Insert UND der fehlgeschlagene Kompensationsversuch
      // für die Dokumentzeile. Alle drei einzeln, nichts verschluckt.
      const scopes = consoleError.mock.calls.map((call) => String(call[0]));
      expect(
        scopes.some((s) => s.includes("[uploadDokument.version] request failed")),
      ).toBe(true);
      expect(
        scopes.some((s) => s.includes("[uploadDokument] orphaned storage object")),
      ).toBe(true);
      expect(
        scopes.some((s) =>
          s.includes("[uploadDokument.cleanup.document] request failed"),
        ),
      ).toBe(true);

      const orphanCall = consoleError.mock.calls.find((call) =>
        String(call[0]).includes("orphaned storage object"),
      );
      expect(orphanCall?.[1]).toMatchObject({ pfad: uploadedPath });

      consoleError.mockRestore();
    },
  );

  it("still reports the save failure when the document soft-delete succeeds", async () => {
    mockFrom
      .mockReturnValueOnce(documentInsertOk())
      .mockReturnValueOnce(versionInsertFails())
      .mockReturnValueOnce(documentCleanupUpdateOk());

    const state = await uploadDokumentAction({}, dokumentFormData());

    expect(state.errors?._form).toBeDefined();
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("neueVersionAction", () => {
  it("rejects an invalid dokument id before touching the database", async () => {
    const state = await neueVersionAction(
      {},
      neueVersionFormData({ dokument_id: "nope" }),
    );

    expect(state.errors?._form).toBeDefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("requires a file", async () => {
    const state = await neueVersionAction({}, neueVersionFormData({}, false));

    expect(state.errors?.datei).toBeDefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("reports when the document cannot be found for this WEG", async () => {
    mockFrom.mockReturnValueOnce(documentLookupFails());

    const state = await neueVersionAction({}, neueVersionFormData());

    expect(state.errors?._form).toBeDefined();
    expect(mockStorageUpload).not.toHaveBeenCalled();
  });

  it("uploads version 2 to a path distinct from version 1 and bumps version_no", async () => {
    mockFrom
      .mockReturnValueOnce(documentLookupOk("rechnung"))
      .mockReturnValueOnce(versionenListe([{ version_no: 1 }]))
      .mockReturnValueOnce(versionInsertOk());

    const state = await neueVersionAction({}, neueVersionFormData());

    expect(state.errors).toBeUndefined();
    expect(state.ok).toBe(true);

    const [path] = mockStorageUpload.mock.calls[0] ?? [];
    const geparst = parsePfad(path);
    expect(geparst).toMatchObject({ dokumentId: DOC_ID, versionNo: 2 });

    const versionCall = mockFrom.mock.results[2]?.value as {
      insert: ReturnType<typeof vi.fn>;
    };
    const [versionRow] = versionCall.insert.mock.calls[0] ?? [];
    expect(versionRow).toMatchObject({
      document_id: DOC_ID,
      version_no: 2,
      storage_path: path,
    });
  });

  it("starts at version 1 when the lookup returns no prior version (defensive)", async () => {
    mockFrom
      .mockReturnValueOnce(documentLookupOk("rechnung"))
      .mockReturnValueOnce(versionenListe([]))
      .mockReturnValueOnce(versionInsertOk());

    await neueVersionAction({}, neueVersionFormData());

    const [path] = mockStorageUpload.mock.calls[0] ?? [];
    expect(parsePfad(path)).toMatchObject({ dokumentId: DOC_ID, versionNo: 1 });
  });

  it("stops before Storage when the prior-version lookup fails", async () => {
    mockFrom
      .mockReturnValueOnce(documentLookupOk("rechnung"))
      .mockReturnValueOnce(versionenListeFails());

    const state = await neueVersionAction({}, neueVersionFormData());

    expect(state.errors?._form).toBeDefined();
    expect(mockStorageUpload).not.toHaveBeenCalled();
  });

  it(
    "logs the orphaned file when the version insert fails, without touching " +
      "the document row",
    async () => {
      mockFrom
        .mockReturnValueOnce(documentLookupOk("rechnung"))
        .mockReturnValueOnce(versionenListe([{ version_no: 1 }]))
        .mockReturnValueOnce(versionInsertFails());
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

      const state = await neueVersionAction({}, neueVersionFormData());

      const [uploadedPath] = mockStorageUpload.mock.calls[0] ?? [];

      expect(state.errors?._form).toBeDefined();

      const orphanCall = consoleError.mock.calls.find((call) =>
        String(call[0]).includes("[neueVersion] orphaned storage object"),
      );
      expect(orphanCall).toBeDefined();
      expect(orphanCall?.[1]).toMatchObject({
        pfad: uploadedPath,
        dokumentId: DOC_ID,
      });

      // Genau drei from()-Aufrufe: Lookup, Versionsliste, Version-Insert —
      // kein vierter für ein document-Update, anders als beim Erst-Upload.
      expect(mockFrom).toHaveBeenCalledTimes(3);

      consoleError.mockRestore();
    },
  );

  it(
    "computes a different path on a retry, so a failed attempt can never " +
      "collide with the next one",
    async () => {
      // Simuliert genau das Szenario, das `eindeutig` verhindert: der erste
      // Versuch scheitert nach dem Upload, max(version_no) bleibt
      // unveraendert (der Insert kam nie an), ein zweiter Versuch mit
      // denselben Formulardaten würde ohne `eindeutig` exakt denselben Pfad
      // berechnen und mit "already exists" scheitern — das Dokument wäre für
      // immer unversionierbar.
      mockFrom
        .mockReturnValueOnce(documentLookupOk("rechnung"))
        .mockReturnValueOnce(versionenListe([{ version_no: 1 }]))
        .mockReturnValueOnce(versionInsertFails());
      await neueVersionAction({}, neueVersionFormData());
      const [ersterPfad] = mockStorageUpload.mock.calls[0] ?? [];

      mockFrom
        .mockReturnValueOnce(documentLookupOk("rechnung"))
        .mockReturnValueOnce(versionenListe([{ version_no: 1 }])) // unveraendert
        .mockReturnValueOnce(versionInsertOk());
      await neueVersionAction({}, neueVersionFormData());
      const [zweiterPfad] = mockStorageUpload.mock.calls[1] ?? [];

      expect(ersterPfad).not.toBe(zweiterPfad);
      expect(parsePfad(ersterPfad)).toMatchObject({ versionNo: 2 });
      expect(parsePfad(zweiterPfad)).toMatchObject({ versionNo: 2 });
    },
  );
});

describe("loescheDokumentAction", () => {
  it("rejects an invalid id before touching the database", async () => {
    const state = await loescheDokumentAction(
      {},
      loescheFormData({ dokument_id: "nope" }),
    );

    expect(state.errors?._form).toBeDefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("soft-deletes by setting deleted_at, never touching Storage", async () => {
    mockFrom.mockReturnValueOnce(loescheUpdateOk());

    await loescheDokumentAction({}, loescheFormData());

    const call = mockFrom.mock.results[0]?.value as {
      update: ReturnType<typeof vi.fn>;
    };
    expect(call.update).toHaveBeenCalledWith(
      expect.objectContaining({ deleted_at: expect.any(String) }),
    );
    expect(mockStorageFrom).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith(`/wegs/${WEG_ID}/dokumente`);
    expect(redirect).toHaveBeenCalledWith(`/wegs/${WEG_ID}/dokumente`);
  });

  it("reports a generic error on database failure", async () => {
    mockFrom.mockReturnValueOnce(loescheUpdateFails());

    const state = await loescheDokumentAction({}, loescheFormData());

    expect(state.errors?._form).toBeDefined();
    expect(redirect).not.toHaveBeenCalled();
  });

  it(
    "reports not-found when the update matches nothing, instead of telling " +
      "the user it was removed",
    async () => {
      // PostgREST meldet fuer ein UPDATE, das null Zeilen trifft, keinen
      // Fehler — ohne `.select("id")` und diese Pruefung wuerde der Nutzer
      // "entfernt" hoeren, obwohl nichts passiert ist (falsche weg_id, schon
      // entfernt, oder eine erratene ID).
      mockFrom.mockReturnValueOnce(loescheUpdateOk([]));

      const state = await loescheDokumentAction({}, loescheFormData());

      expect(state.errors?._form).toBeDefined();
      expect(redirect).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
    },
  );
});
