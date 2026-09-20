import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const mockRpc = vi.fn();
const mockFrom = vi.fn();

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
    Promise.resolve({ rpc: mockRpc, from: mockFrom, auth: mockAuth }),
  ),
}));

import {
  createPositionAction,
  deletePositionAction,
  erstelleVermoegensberichtAction,
  stelleFertigAction,
} from "../actions";

const WEG_ID = "11111111-1111-4111-8111-111111111111";
const BERICHT_ID = "22222222-2222-4222-8222-222222222222";
const POSITION_ID = "33333333-3333-4333-8333-333333333333";

function erstellenFormData(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("weg_id", WEG_ID);
  fd.set("jahr", "2090");
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

function positionFormData(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("weg_id", WEG_ID);
  fd.set("bericht_id", BERICHT_ID);
  fd.set("abschnitt", "konto");
  fd.set("bezeichnung", "Girokonto");
  fd.set("betrag", "3479,00");
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

function fertigFormData(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("weg_id", WEG_ID);
  fd.set("bericht_id", BERICHT_ID);
  fd.set("erstellt_am", "2091-05-01");
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

/** `insert()` als einzelner Aufruf, wie PostgREST ihn hier verwendet. */
function insertGibt(result: { error: unknown }) {
  const insert = vi.fn().mockResolvedValue(result);
  mockFrom.mockReturnValue({ insert });
  return insert;
}

/** `delete().eq().eq()` — die Kette der Loeschaktion. */
function deleteGibt(result: { error: unknown }) {
  const zweitesEq = vi.fn().mockResolvedValue(result);
  const erstesEq = vi.fn().mockReturnValue({ eq: zweitesEq });
  mockFrom.mockReturnValue({
    delete: vi.fn().mockReturnValue({ eq: erstesEq }),
  });
  return { erstesEq, zweitesEq };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRpc.mockReset();
  mockFrom.mockReset();
});

describe("erstelleVermoegensberichtAction", () => {
  it("rejects an invalid WEG id before calling the RPC", async () => {
    const state = await erstelleVermoegensberichtAction(
      {},
      erstellenFormData({ weg_id: "nope" }),
    );

    expect(state.errors?._form).toBeDefined();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("refuses a year outside the allowed range", async () => {
    const state = await erstelleVermoegensberichtAction(
      {},
      erstellenFormData({ jahr: "1800" }),
    );

    expect(state.errors?.jahr).toBeDefined();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("names the duplicate draft when the unique index fires", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: "23505" } });

    const state = await erstelleVermoegensberichtAction({}, erstellenFormData());

    expect(state.errors?.jahr?.join(" ")).toContain("bereits ein Berichts");
  });

  it("passes year and WEG through to the RPC", async () => {
    mockRpc.mockResolvedValue({ data: BERICHT_ID, error: null });

    await erstelleVermoegensberichtAction({}, erstellenFormData());

    expect(mockRpc).toHaveBeenCalledWith("erstelle_vermoegensbericht", {
      p_weg_id: WEG_ID,
      p_jahr: 2090,
    });
  });
});

describe("createPositionAction", () => {
  it("stores a Sachwert without an amount as null, never as zero", async () => {
    // Der Kern: `Number("")` ist 0 und besteht jede isFinite-Prüfung. Würde
    // das Feld so durchgereicht, stünde ein unbewerteter Gegenstand mit
    // 0,00 € in der Summe.
    const insert = insertGibt({ error: null });

    const state = await createPositionAction(
      {},
      positionFormData({
        abschnitt: "sachwert",
        bezeichnung: "Aufsitzrasenmäher",
        betrag: "",
      }),
    );

    expect(state.errors).toBeUndefined();
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ betrag: null, quelle: "manuell" }),
    );
  });

  it("refuses an empty amount outside the Sachwert section", async () => {
    const state = await createPositionAction(
      {},
      positionFormData({ abschnitt: "forderung", betrag: "" }),
    );

    expect(state.errors?.betrag).toBeDefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("accepts a German decimal comma", async () => {
    const insert = insertGibt({ error: null });

    await createPositionAction({}, positionFormData({ betrag: "3479,55" }));

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ betrag: 3479.55 }),
    );
  });

  it("refuses an opening balance outside Konto and Rücklage", async () => {
    const state = await createPositionAction(
      {},
      positionFormData({ abschnitt: "forderung", betrag_anfang: "100" }),
    );

    expect(state.errors?.betrag_anfang).toBeDefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("keeps an opening balance on a Konto", async () => {
    const insert = insertGibt({ error: null });

    await createPositionAction({}, positionFormData({ betrag_anfang: "2500" }));

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ betrag_anfang: 2500 }),
    );
  });

  it("rejects a non-numeric amount", async () => {
    const state = await createPositionAction(
      {},
      positionFormData({ betrag: "viel" }),
    );

    expect(state.errors?.betrag).toBeDefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("requires a Bezeichnung", async () => {
    const state = await createPositionAction(
      {},
      positionFormData({ bezeichnung: "   " }),
    );

    expect(state.errors?.bezeichnung).toBeDefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("explains the lock when the report is already finalised", async () => {
    insertGibt({ error: { code: "23514" } });

    const state = await createPositionAction({}, positionFormData());

    expect(state.errors?._form?.join(" ")).toContain("fertiggestellte");
  });
});

describe("deletePositionAction", () => {
  it("only ever deletes positions entered by hand", async () => {
    // Eine abgeleitete Zeile gehört zum Snapshot. Wer sie von Hand entfernt,
    // fälscht den Bericht still — deshalb filtert die Aktion auf quelle.
    const { erstesEq, zweitesEq } = deleteGibt({ error: null });

    await deletePositionAction(
      {},
      (() => {
        const fd = new FormData();
        fd.set("weg_id", WEG_ID);
        fd.set("bericht_id", BERICHT_ID);
        fd.set("position_id", POSITION_ID);
        return fd;
      })(),
    );

    expect(erstesEq).toHaveBeenCalledWith("id", POSITION_ID);
    expect(zweitesEq).toHaveBeenCalledWith("quelle", "manuell");
  });

  it("rejects an invalid position id before touching the database", async () => {
    const fd = new FormData();
    fd.set("weg_id", WEG_ID);
    fd.set("bericht_id", BERICHT_ID);
    fd.set("position_id", "nope");

    const state = await deletePositionAction({}, fd);

    expect(state.errors?._form).toBeDefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe("stelleFertigAction", () => {
  it("requires a date", async () => {
    const state = await stelleFertigAction(
      {},
      fertigFormData({ erstellt_am: "" }),
    );

    expect(state.errors?.erstellt_am).toBeDefined();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("calls the RPC with report and date", async () => {
    mockRpc.mockResolvedValue({ error: null });

    const state = await stelleFertigAction({}, fertigFormData());

    expect(mockRpc).toHaveBeenCalledWith("stelle_vermoegensbericht_fertig", {
      p_vermoegensbericht_id: BERICHT_ID,
      p_erstellt_am: "2091-05-01",
    });
    expect(state.ok).toBe(true);
  });

  it("points to a new report when the draft guard fires", async () => {
    mockRpc.mockResolvedValue({ error: { code: "23514" } });

    const state = await stelleFertigAction({}, fertigFormData());

    expect(state.errors?._form?.join(" ")).toContain("Berichtigung");
  });
});
