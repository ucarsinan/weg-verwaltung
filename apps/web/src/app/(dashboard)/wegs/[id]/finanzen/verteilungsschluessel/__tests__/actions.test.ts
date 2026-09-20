import { beforeEach, describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

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
  createClient: vi.fn(() => Promise.resolve({ from: mockFrom, auth: mockAuth })),
}));

import {
  createVerteilungsschluesselAction,
  saveBasiswerteAction,
  saveTeileAction,
} from "../actions";

const WEG_ID = "11111111-1111-4111-8111-111111111111";
const KEY_ID = "22222222-2222-4222-8222-222222222222";
const VERSION_ID = "33333333-3333-4333-8333-333333333333";
const UNIT_A = "44444444-4444-4444-8444-444444444444";
const UNIT_B = "55555555-5555-4555-8555-555555555555";

/** Erfolgreicher `insert(...).select("id").single()`-Pfad fuer den Schluessel. */
function keyInsertOk(id = KEY_ID) {
  return {
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id }, error: null }),
      }),
    }),
  };
}

function keyInsertFails(error: { code?: string }) {
  return {
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: null, error }),
      }),
    }),
  };
}

function schluesselFormData(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("weg_id", WEG_ID);
  fd.set("name", "Wohnfläche");
  fd.set("typ", "flaeche");
  fd.set("quelle", "beschluss");
  fd.set("gueltig_ab", "2030-01-01");
  for (const [key, value] of Object.entries(overrides)) fd.set(key, value);
  return fd;
}

function basiswerteFormData(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("weg_id", WEG_ID);
  fd.set("key_id", KEY_ID);
  fd.set("version_id", VERSION_ID);
  fd.set("einheit", "m²");
  fd.set("gueltig_ab", "2030-01-01");
  fd.append("unit_id", UNIT_A);
  fd.append("unit_id", UNIT_B);
  fd.set(`wert_${UNIT_A}`, "75");
  fd.set(`wert_${UNIT_B}`, "25");
  for (const [key, value] of Object.entries(overrides)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFrom.mockReset();
});

describe("createVerteilungsschluesselAction", () => {
  it("rejects an invalid WEG id before touching the database", async () => {
    const state = await createVerteilungsschluesselAction(
      {},
      schluesselFormData({ weg_id: "nope" }),
    );

    expect(state.errors?._form).toBeDefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("reports field errors for an empty name and an unknown typ", async () => {
    const state = await createVerteilungsschluesselAction(
      {},
      schluesselFormData({ name: "  ", typ: "erfunden" }),
    );

    expect(state.errors?.name).toBeDefined();
    expect(state.errors?.typ).toBeDefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("rejects an unknown Rechtsgrundlage", async () => {
    const state = await createVerteilungsschluesselAction(
      {},
      schluesselFormData({ quelle: "bauchgefuehl" }),
    );

    expect(state.errors?.quelle).toBeDefined();
  });

  it("maps a unique violation onto the name field", async () => {
    mockFrom.mockReturnValue(keyInsertFails({ code: "23505" }));

    const state = await createVerteilungsschluesselAction(
      {},
      schluesselFormData(),
    );

    expect(state.errors?.name).toEqual([
      "Ein Verteilungsschlüssel mit diesem Namen existiert bereits.",
    ]);
  });

  it("tells the user the key exists when only the version insert fails", async () => {
    mockFrom
      .mockReturnValueOnce(keyInsertOk())
      .mockReturnValueOnce({
        insert: vi.fn().mockResolvedValue({ error: { code: "500" } }),
      });

    const state = await createVerteilungsschluesselAction(
      {},
      schluesselFormData(),
    );

    expect(state.errors?._form?.[0]).toContain("Der Schlüssel wurde angelegt");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("sends a basis-value type straight to its detail page", async () => {
    mockFrom
      .mockReturnValueOnce(keyInsertOk())
      .mockReturnValueOnce({
        insert: vi.fn().mockResolvedValue({ error: null }),
      });

    await createVerteilungsschluesselAction({}, schluesselFormData());

    expect(revalidatePath).toHaveBeenCalledWith(
      `/wegs/${WEG_ID}/finanzen/verteilungsschluessel`,
    );
    expect(redirect).toHaveBeenCalledWith(
      `/wegs/${WEG_ID}/finanzen/verteilungsschluessel/${KEY_ID}`,
    );
  });

  it("sends a derived type back to the list, because it needs no basis values", async () => {
    mockFrom
      .mockReturnValueOnce(keyInsertOk())
      .mockReturnValueOnce({
        insert: vi.fn().mockResolvedValue({ error: null }),
      });

    await createVerteilungsschluesselAction(
      {},
      schluesselFormData({ typ: "mea", quelle: "gesetz" }),
    );

    expect(redirect).toHaveBeenCalledWith(
      `/wegs/${WEG_ID}/finanzen/verteilungsschluessel`,
    );
  });
});

describe("saveBasiswerteAction", () => {
  it("rejects an invalid route before touching the database", async () => {
    const state = await saveBasiswerteAction(
      {},
      basiswerteFormData({ version_id: "nope" }),
    );

    expect(state.errors?._form).toBeDefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("refuses to save when a unit has no value, mirroring the generator's fail-closed rule", async () => {
    const fd = basiswerteFormData();
    fd.set(`wert_${UNIT_B}`, "");

    const state = await saveBasiswerteAction({}, fd);

    expect(state.errors?.werte).toBeDefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("refuses a negative value", async () => {
    const state = await saveBasiswerteAction(
      {},
      basiswerteFormData({ [`wert_${UNIT_B}`]: "-5" }),
    );

    expect(state.errors?.werte).toBeDefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("refuses an all-zero set, because the shares would be undefined", async () => {
    const state = await saveBasiswerteAction(
      {},
      basiswerteFormData({
        [`wert_${UNIT_A}`]: "0",
        [`wert_${UNIT_B}`]: "0",
      }),
    );

    expect(state.errors?.werte).toEqual([
      "Mindestens ein Wert muss größer als 0 sein.",
    ]);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("requires a Maßeinheit", async () => {
    const state = await saveBasiswerteAction(
      {},
      basiswerteFormData({ einheit: "  " }),
    );

    expect(state.errors?.einheit).toBeDefined();
  });

  it("upserts every unit in one call and reports success", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({ upsert });

    const state = await saveBasiswerteAction({}, basiswerteFormData());

    expect(upsert).toHaveBeenCalledTimes(1);
    const [rows, options] = upsert.mock.calls[0] ?? [];
    expect(rows).toEqual([
      {
        verteilungsschluessel_version_id: VERSION_ID,
        unit_id: UNIT_A,
        wert: 75,
        einheit: "m²",
        gueltig_ab: "2030-01-01",
      },
      {
        verteilungsschluessel_version_id: VERSION_ID,
        unit_id: UNIT_B,
        wert: 25,
        einheit: "m²",
        gueltig_ab: "2030-01-01",
      },
    ]);
    expect(options).toEqual({
      onConflict:
        "tenant_id,verteilungsschluessel_version_id,unit_id,gueltig_ab",
    });
    expect(state.ok).toBe(true);
  });

  it("accepts a comma as the decimal separator", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({ upsert });

    await saveBasiswerteAction(
      {},
      basiswerteFormData({ [`wert_${UNIT_A}`]: "75,5" }),
    );

    const [rows] = upsert.mock.calls[0] ?? [];
    expect(rows?.[0]?.wert).toBe(75.5);
  });

  it("returns a generic error when the upsert fails", async () => {
    mockFrom.mockReturnValue({
      upsert: vi.fn().mockResolvedValue({ error: { code: "500" } }),
    });

    const state = await saveBasiswerteAction({}, basiswerteFormData());

    expect(state.errors?._form).toBeDefined();
    expect(state.ok).toBeUndefined();
  });
});

const TEIL_VERBRAUCH = "66666666-6666-4666-8666-666666666666";
const TEIL_FLAECHE = "77777777-7777-4777-8777-777777777777";

/** `delete().eq()` gefolgt von `insert(...)` — der Ersetzungspfad der Teile. */
function teileDbOk() {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const deleteEq = vi.fn().mockResolvedValue({ error: null });
  mockFrom.mockReturnValue({
    delete: vi.fn().mockReturnValue({ eq: deleteEq }),
    insert,
  });
  return { insert, deleteEq };
}

function teileFormData(
  teile: { versionId: string; typ: string; gewicht: string }[],
  regelwerk = "heizkv_waerme",
) {
  const fd = new FormData();
  fd.set("weg_id", WEG_ID);
  fd.set("key_id", KEY_ID);
  fd.set("version_id", VERSION_ID);
  fd.set("regelwerk", regelwerk);
  for (const teil of teile) {
    fd.append("teil_version_id", teil.versionId);
    fd.set(`typ_${teil.versionId}`, teil.typ);
    fd.set(`gewicht_${teil.versionId}`, teil.gewicht);
  }
  return fd;
}

describe("saveTeileAction", () => {
  it("replaces the whole set in one insert, so the per-statement sum holds", () => {
    // Zeilenweise gespeichert waere die Summe nach der ersten Zeile nie 100 —
    // Migration 0067 wuerde jedes Speichern ablehnen.
    const { insert, deleteEq } = teileDbOk();

    return saveTeileAction(
      {},
      teileFormData([
        { versionId: TEIL_VERBRAUCH, typ: "verbrauch", gewicht: "70" },
        { versionId: TEIL_FLAECHE, typ: "flaeche", gewicht: "30" },
      ]),
    ).then((state) => {
      expect(state.errors).toBeUndefined();
      expect(deleteEq).toHaveBeenCalledWith(
        "verteilungsschluessel_version_id",
        VERSION_ID,
      );
      expect(insert).toHaveBeenCalledTimes(1);
      expect(insert).toHaveBeenCalledWith([
        expect.objectContaining({ teil_version_id: TEIL_VERBRAUCH, gewicht: 70 }),
        expect.objectContaining({ teil_version_id: TEIL_FLAECHE, gewicht: 30 }),
      ]);
    });
  });

  it("refuses 80 percent by consumption before touching the database", async () => {
    const state = await saveTeileAction(
      {},
      teileFormData([
        { versionId: TEIL_VERBRAUCH, typ: "verbrauch", gewicht: "80" },
        { versionId: TEIL_FLAECHE, typ: "flaeche", gewicht: "20" },
      ]),
    );

    expect(state.errors?.teile?.join(" ")).toContain("höchstens 70");
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("refuses weights that do not sum to 100", async () => {
    const state = await saveTeileAction(
      {},
      teileFormData(
        [
          { versionId: TEIL_VERBRAUCH, typ: "verbrauch", gewicht: "60" },
          { versionId: TEIL_FLAECHE, typ: "flaeche", gewicht: "30" },
        ],
        "frei",
      ),
    );

    expect(state.errors?.teile?.join(" ")).toContain("100 %");
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("accepts a free rule outside the HeizKV corridor", async () => {
    const { insert } = teileDbOk();

    const state = await saveTeileAction(
      {},
      teileFormData(
        [
          { versionId: TEIL_FLAECHE, typ: "flaeche", gewicht: "90" },
          { versionId: TEIL_VERBRAUCH, typ: "einheit", gewicht: "10" },
        ],
        "frei",
      ),
    );

    expect(state.errors).toBeUndefined();
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("accepts a German decimal comma in a weight", async () => {
    const { insert } = teileDbOk();

    await saveTeileAction(
      {},
      teileFormData(
        [
          { versionId: TEIL_VERBRAUCH, typ: "verbrauch", gewicht: "66,667" },
          { versionId: TEIL_FLAECHE, typ: "flaeche", gewicht: "33,333" },
        ],
        "frei",
      ),
    );

    expect(insert).toHaveBeenCalledWith([
      expect.objectContaining({ gewicht: 66.667 }),
      expect.objectContaining({ gewicht: 33.333 }),
    ]);
  });

  it("refuses a weight of zero", async () => {
    const state = await saveTeileAction(
      {},
      teileFormData(
        [
          { versionId: TEIL_VERBRAUCH, typ: "verbrauch", gewicht: "0" },
          { versionId: TEIL_FLAECHE, typ: "flaeche", gewicht: "100" },
        ],
        "frei",
      ),
    );

    expect(state.errors?.teile).toBeDefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("passes the database message through when the guard fires there", async () => {
    const deleteEq = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({
      delete: vi.fn().mockReturnValue({ eq: deleteEq }),
      insert: vi.fn().mockResolvedValue({
        error: { code: "23514", message: "Der Teil gehört zu einer anderen WEG." },
      }),
    });

    const state = await saveTeileAction(
      {},
      teileFormData([
        { versionId: TEIL_VERBRAUCH, typ: "verbrauch", gewicht: "70" },
        { versionId: TEIL_FLAECHE, typ: "flaeche", gewicht: "30" },
      ]),
    );

    expect(state.errors?.teile?.join(" ")).toContain("anderen WEG");
  });
});
