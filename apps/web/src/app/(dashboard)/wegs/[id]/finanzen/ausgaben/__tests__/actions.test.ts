import { beforeEach, describe, expect, it, vi } from "vitest";
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

import { createAusgabeAction, createRuecklagenBewegungAction } from "../actions";

const WEG_ID = "11111111-1111-4111-8111-111111111111";
const VERSION_ID = "22222222-2222-4222-8222-222222222222";

function ausgabeFormData(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("weg_id", WEG_ID);
  fd.set("betrag", "250,50");
  fd.set("wert_datum", "2060-03-01");
  fd.set("empfaenger", "Stadtwerke");
  fd.set("kostenart", "Allgemeinstrom");
  fd.set("verteilungsschluessel_version_id", VERSION_ID);
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

function ruecklageFormData(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("weg_id", WEG_ID);
  fd.set("datum", "2060-06-01");
  fd.set("betrag", "2000");
  fd.set("richtung", "zufuehrung");
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFrom.mockReset();
});

describe("createAusgabeAction", () => {
  it("rejects an invalid WEG id before touching the database", async () => {
    const state = await createAusgabeAction(
      {},
      ausgabeFormData({ weg_id: "nope" }),
    );

    expect(state.errors?._form).toBeDefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("requires recipient, cost type and an allocation key", async () => {
    const state = await createAusgabeAction(
      {},
      ausgabeFormData({
        empfaenger: "  ",
        kostenart: "  ",
        verteilungsschluessel_version_id: "",
      }),
    );

    expect(state.errors?.empfaenger).toBeDefined();
    expect(state.errors?.kostenart).toBeDefined();
    expect(state.errors?.verteilungsschluessel_version_id).toBeDefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("refuses a non-positive amount", async () => {
    const state = await createAusgabeAction({}, ausgabeFormData({ betrag: "0" }));
    expect(state.errors?.betrag).toBeDefined();
  });

  it("accepts a comma as the decimal separator and defaults to art=kosten", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({ insert });

    await createAusgabeAction({}, ausgabeFormData());

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        betrag: 250.5,
        art: "kosten",
        quelle: "manuell",
        verteilungsschluessel_version_id: VERSION_ID,
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith(
      `/wegs/${WEG_ID}/finanzen/ausgaben`,
    );
  });

  it("passes a Ruecklagen-Zufuehrung through as its own art", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({ insert });

    await createAusgabeAction(
      {},
      ausgabeFormData({ art: "ruecklage_zufuehrung" }),
    );

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ art: "ruecklage_zufuehrung" }),
    );
  });

  it("maps the cross-WEG guard onto the allocation key field", async () => {
    mockFrom.mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: { code: "23514" } }),
    });

    const state = await createAusgabeAction({}, ausgabeFormData());

    expect(state.errors?.verteilungsschluessel_version_id?.[0]).toContain(
      "anderen WEG",
    );
  });
});

describe("createRuecklagenBewegungAction", () => {
  it("rejects an unknown Bewegungsart", async () => {
    const state = await createRuecklagenBewegungAction(
      {},
      ruecklageFormData({ richtung: "erfunden" }),
    );

    expect(state.errors?.richtung).toBeDefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("requires a valid date", async () => {
    const state = await createRuecklagenBewegungAction(
      {},
      ruecklageFormData({ datum: "irgendwann" }),
    );

    expect(state.errors?.datum).toBeDefined();
  });

  it("saves a Zufuehrung and reports success", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({ insert });

    const state = await createRuecklagenBewegungAction({}, ruecklageFormData());

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        weg_id: WEG_ID,
        betrag: 2000,
        richtung: "zufuehrung",
        datum: "2060-06-01",
      }),
    );
    expect(state.ok).toBe(true);
  });

  it("explains the value-date rule when an Entnahme is not covered", async () => {
    mockFrom.mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: { code: "23514" } }),
    });

    const state = await createRuecklagenBewegungAction(
      {},
      ruecklageFormData({ richtung: "entnahme" }),
    );

    expect(state.errors?.betrag?.[0]).toContain("später zugeführt");
    expect(state.ok).toBeUndefined();
  });

  it("explains that only one Anfangsbestand exists per WEG", async () => {
    mockFrom.mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: { code: "23505" } }),
    });

    const state = await createRuecklagenBewegungAction(
      {},
      ruecklageFormData({ richtung: "anfangsbestand" }),
    );

    expect(state.errors?.richtung?.[0]).toContain("bereits ein Anfangsbestand");
  });
});
