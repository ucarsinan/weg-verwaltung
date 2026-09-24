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
// Der Soft-Delete laeuft seit 0072 ueber die RPC public.dokument_entfernen,
// nicht mehr ueber ein direktes UPDATE: die SELECT-Policy aus 0015 filtert
// `deleted_at is null`, und PostgreSQL lehnt jedes UPDATE ab, dessen neue
// Zeile unter der eigenen SELECT-Policy unsichtbar waere. Betroffen waren
// beide Schreibpfade dieser Datei.
const mockRpc = vi.fn();
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
      rpc: mockRpc,
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
 * `rpc("dokument_entfernen", …)` — der einzige Soft-Delete-Pfad seit 0072.
 * Die Funktion gibt `true` zurueck, wenn genau eine Zeile entfernt wurde,
 * und `false`, wenn nichts passte (falsche weg_id, erratene ID, schon
 * entfernt). Beide Aufrufer dieser Datei muessen den Rueckgabewert
 * auswerten: PostgREST meldet fuer "nichts getroffen" keinen Fehler.
 */
function rpcEntferntOk(entfernt = true) {
  return { data: entfernt, error: null };
}

function rpcEntferntFails(error: { code?: string } = { code: "500" }) {
  return { data: null, error };
}

/**
 * `.from("weg").select("id").eq("id", wegId).single()` — der Read-Check, der
 * seit diesem Fix vor jedem Storage-Upload steht (uploadDokumentAction).
 * RLS (`weg_select_own_tenant`, 0008) filtert bereits nach tenant_id, ein
 * `null`-Ergebnis deckt sowohl "existiert nicht" als auch "gehört einem
 * anderen Mandanten" ab.
 */
function wegLookupOk() {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: WEG_ID }, error: null }),
      }),
    }),
  };
}

function wegLookupFails(error: { code?: string } = { code: "PGRST116" }) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: null, error }),
      }),
    }),
  };
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
  mockRpc.mockReset();
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

  it(
    "rejects a well-formed WEG id that doesn't resolve for this tenant, " +
      "before Storage receives any bytes",
    async () => {
      // RLS (weg_select_own_tenant, 0008) macht eine fremde WEG von einer
      // nicht existierenden ununterscheidbar — beide liefern hier `null`.
      mockFrom.mockReturnValueOnce(wegLookupFails());

      const state = await uploadDokumentAction({}, dokumentFormData());

      expect(state.errors?._form).toBeDefined();
      expect(mockStorageUpload).not.toHaveBeenCalled();
      // Nur der WEG-Check — kein document-Insert-Versuch für eine WEG, die
      // es (für diesen Mandanten) gar nicht gibt.
      expect(mockFrom).toHaveBeenCalledTimes(1);
    },
  );

  it(
    "checks that the WEG exists for this tenant strictly before the Storage " +
      "upload — an order assertion, not just a call count",
    async () => {
      // Eine reine "upload wurde nicht aufgerufen"-Assertion würde auch dann
      // gruen bleiben, wenn jemand den Upload wieder VOR den WEG-Check
      // schiebt und der Check danach zufällig noch fehlschlägt. Deshalb hier
      // die tatsächliche Aufrufreihenfolge über `invocationCallOrder`
      // (vitest/jest-Mock-API) statt nur "wurde aufgerufen"/"wurde nicht
      // aufgerufen".
      mockFrom
        .mockReturnValueOnce(wegLookupOk())
        .mockReturnValueOnce(documentInsertOk())
        .mockReturnValueOnce(versionInsertOk());

      await uploadDokumentAction({}, dokumentFormData());

      const [wegLookupCallOrder] = mockFrom.mock.invocationCallOrder;
      const [uploadCallOrder] = mockStorageUpload.mock.invocationCallOrder;

      // `noUncheckedIndexedAccess` macht beide Werte `number | undefined` —
      // ein `if`-Guard statt zweier `toBeDefined()`-Assertions engt den Typ
      // fuer den Compiler tatsaechlich ein (ein `expect(...).toBeDefined()`
      // tut das nicht).
      if (wegLookupCallOrder === undefined || uploadCallOrder === undefined) {
        throw new Error(
          "expected both the WEG lookup and the Storage upload to have been called",
        );
      }
      expect(wegLookupCallOrder).toBeLessThan(uploadCallOrder);
    },
  );

  it("uploads first, writes the document with the pre-generated id, then the version", async () => {
    mockFrom
      .mockReturnValueOnce(wegLookupOk())
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
    // Index 0 ist der WEG-Check (results[0]), Index 1 die Dokumentzeile.
    const documentCall = mockFrom.mock.results[1]?.value as {
      insert: ReturnType<typeof vi.fn>;
    };
    const [documentRow] = documentCall.insert.mock.calls[0] ?? [];
    expect(documentRow).toMatchObject({ id: geparst?.dokumentId, weg_id: WEG_ID });

    // Die Version traegt die serverseitig berechnete Pruefsumme, hex-codiert
    // mit dem PostgREST-bytea-Praefix "\x" — kein rohes Buffer-Objekt.
    const versionCall = mockFrom.mock.results[2]?.value as {
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

  it(
    "reads only the WEG check, then writes nothing when the Storage upload fails",
    async () => {
      // Der WEG-Check ist ein Read und läuft immer, auch wenn der Upload
      // danach scheitert — das ist beabsichtigt (siehe Fix-Kommentar in
      // actions.ts) und kein Widerspruch zu "Storage vor Dokumentzeile":
      // dieser Test belegt, dass nach dem Read kein einziger Schreibversuch
      // (document/document_version) stattfindet.
      mockFrom.mockReturnValueOnce(wegLookupOk());
      mockStorageUpload.mockResolvedValue({
        error: { message: "network error", name: "StorageError" },
      });

      const state = await uploadDokumentAction({}, dokumentFormData());

      expect(state.errors?.datei).toBeDefined();
      expect(mockFrom).toHaveBeenCalledTimes(1);
      expect(redirect).not.toHaveBeenCalled();
    },
  );

  it(
    "logs the orphaned file when the document insert fails, since weg-docs " +
      "grants no delete policy (0015) to remove it",
    async () => {
      mockFrom
        .mockReturnValueOnce(wegLookupOk())
        .mockReturnValueOnce(documentInsertFails());
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

      const state = await uploadDokumentAction({}, dokumentFormData());

      const [uploadedPath] = mockStorageUpload.mock.calls[0] ?? [];

      expect(state.errors?._form).toBeDefined();
      // Kein document_version-Versuch — genau ZWEI from()-Aufrufe (WEG-Check
      // und Dokument).
      expect(mockFrom).toHaveBeenCalledTimes(2);
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
        .mockReturnValueOnce(wegLookupOk())
        .mockReturnValueOnce(documentInsertOk())
        .mockReturnValueOnce(versionInsertFails({ code: "23502" }));
      mockRpc.mockResolvedValueOnce(rpcEntferntFails());
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

      const state = await uploadDokumentAction({}, dokumentFormData());

      const [uploadedPath] = mockStorageUpload.mock.calls[0] ?? [];

      expect(state.errors?._form).toBeDefined();

      // Die Kompensation geht ueber die RPC aus 0072, nicht ueber ein
      // direktes UPDATE — das scheiterte hier an der SELECT-Policy aus 0015.
      // Den Fehler las dieser Pfad schon immer (42501, protokolliert); was
      // er nie las, war die Trefferzahl. Der Fall darunter deckt genau die
      // ab: kein Fehler, aber auch kein Treffer.
      expect(mockRpc).toHaveBeenCalledWith("dokument_entfernen", {
        p_dokument_id: expect.any(String),
        p_weg_id: WEG_ID,
      });

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
      .mockReturnValueOnce(wegLookupOk())
      .mockReturnValueOnce(documentInsertOk())
      .mockReturnValueOnce(versionInsertFails());
    mockRpc.mockResolvedValueOnce(rpcEntferntOk());

    const state = await uploadDokumentAction({}, dokumentFormData());

    expect(state.errors?._form).toBeDefined();
    expect(redirect).not.toHaveBeenCalled();
  });

  it(
    "logs the failed compensation when dokument_entfernen matches no row, " +
      "instead of treating a silent false as success",
    async () => {
      mockFrom
        .mockReturnValueOnce(wegLookupOk())
        .mockReturnValueOnce(documentInsertOk())
        .mockReturnValueOnce(versionInsertFails());
      // Kein Fehler, aber auch kein Treffer — PostgREST meldet dafuer nichts.
      mockRpc.mockResolvedValueOnce(rpcEntferntOk(false));
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

      await uploadDokumentAction({}, dokumentFormData());

      const scopes = consoleError.mock.calls.map((call) => String(call[0]));
      expect(
        scopes.some((s) =>
          s.includes("[uploadDokument.cleanup.document] request failed"),
        ),
      ).toBe(true);

      consoleError.mockRestore();
    },
  );
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

  it(
    "soft-deletes through the 0072 RPC — never a direct UPDATE, never Storage",
    async () => {
      mockRpc.mockResolvedValueOnce(rpcEntferntOk());

      await loescheDokumentAction({}, loescheFormData());

      // Ein direktes `.from("document").update({ deleted_at })` wird von der
      // SELECT-Policy aus 0015 abgelehnt ("new row violates row-level
      // security policy"), weil die neue Zeile unter der eigenen Policy
      // unsichtbar waere. Deshalb: RPC statt UPDATE, und `from` gar nicht
      // mehr angefasst.
      expect(mockRpc).toHaveBeenCalledWith("dokument_entfernen", {
        p_dokument_id: DOC_ID,
        p_weg_id: WEG_ID,
      });
      expect(mockFrom).not.toHaveBeenCalled();
      expect(mockStorageFrom).not.toHaveBeenCalled();
      expect(revalidatePath).toHaveBeenCalledWith(`/wegs/${WEG_ID}/dokumente`);
      expect(redirect).toHaveBeenCalledWith(`/wegs/${WEG_ID}/dokumente`);
    },
  );

  it("reports a generic error on database failure", async () => {
    mockRpc.mockResolvedValueOnce(rpcEntferntFails());

    const state = await loescheDokumentAction({}, loescheFormData());

    expect(state.errors?._form).toBeDefined();
    expect(redirect).not.toHaveBeenCalled();
  });

  it(
    "reports not-found when the RPC matched nothing, instead of telling " +
      "the user it was removed",
    async () => {
      // Die RPC gibt `false` zurueck, wenn nichts passte (falsche weg_id,
      // erratene ID, schon entfernt) — und PostgREST meldet dafuer keinen
      // Fehler. Ohne diese Pruefung wuerde der Nutzer "entfernt" hoeren,
      // obwohl nichts passiert ist.
      mockRpc.mockResolvedValueOnce(rpcEntferntOk(false));

      const state = await loescheDokumentAction({}, loescheFormData());

      expect(state.errors?._form).toBeDefined();
      expect(redirect).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
    },
  );
});
