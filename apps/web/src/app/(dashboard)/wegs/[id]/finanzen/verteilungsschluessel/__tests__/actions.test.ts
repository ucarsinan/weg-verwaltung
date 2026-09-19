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
