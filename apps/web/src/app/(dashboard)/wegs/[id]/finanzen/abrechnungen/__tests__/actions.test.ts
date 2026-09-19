import { beforeEach, describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const mockRpc = vi.fn();

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
    Promise.resolve({ rpc: mockRpc, from: vi.fn(), auth: mockAuth }),
  ),
}));

import {
  beschliesseAbrechnungAction,
  erstelleAbrechnungAction,
} from "../actions";

const WEG_ID = "11111111-1111-4111-8111-111111111111";
const ABRECHNUNG_ID = "22222222-2222-4222-8222-222222222222";

function erstellenFormData(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("weg_id", WEG_ID);
  fd.set("jahr", "2090");
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

function beschlussFormData(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("weg_id", WEG_ID);
  fd.set("abrechnung_id", ABRECHNUNG_ID);
  fd.set("beschlossen_am", "2091-03-15");
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRpc.mockReset();
});

describe("erstelleAbrechnungAction", () => {
  it("rejects an invalid WEG id before calling the RPC", async () => {
    const state = await erstelleAbrechnungAction(
      {},
      erstellenFormData({ weg_id: "nope" }),
    );

    expect(state.errors?._form).toBeDefined();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("refuses a year outside the allowed range", async () => {
    const state = await erstelleAbrechnungAction(
      {},
      erstellenFormData({ jahr: "1800" }),
    );

    expect(state.errors?.jahr).toBeDefined();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("opens the new statement after creating it", async () => {
    mockRpc.mockResolvedValue({ data: ABRECHNUNG_ID, error: null });

    await erstelleAbrechnungAction({}, erstellenFormData());

    expect(mockRpc).toHaveBeenCalledWith("erstelle_abrechnung", {
      p_weg_id: WEG_ID,
      p_jahr: 2090,
    });
    expect(redirect).toHaveBeenCalledWith(
      `/wegs/${WEG_ID}/finanzen/abrechnungen/${ABRECHNUNG_ID}`,
    );
  });

  it("explains that a draft for the year already exists", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: "23505" } });

    const state = await erstelleAbrechnungAction({}, erstellenFormData());

    expect(state.errors?.jahr?.[0]).toContain("bereits ein Abrechnungsentwurf");
  });

  it("names the mixed allocation key as the blocker", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: "0A000" } });

    const state = await erstelleAbrechnungAction({}, erstellenFormData());

    expect(state.errors?._form?.[0]).toContain("gemischten Verteilungsschlüssel");
  });

  it("points at missing basis values on a check violation", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: "23514" } });

    const state = await erstelleAbrechnungAction({}, erstellenFormData());

    expect(state.errors?._form?.[0]).toContain("Basiswerte");
  });
});

describe("beschliesseAbrechnungAction", () => {
  it("requires a resolution date, because it decides who owes the Spitze", async () => {
    const state = await beschliesseAbrechnungAction(
      {},
      beschlussFormData({ beschlossen_am: "" }),
    );

    expect(state.errors?.beschlossen_am).toBeDefined();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("passes the date through to the RPC and reports success", async () => {
    mockRpc.mockResolvedValue({ error: null });

    const state = await beschliesseAbrechnungAction({}, beschlussFormData());

    expect(mockRpc).toHaveBeenCalledWith("beschliesse_abrechnung", {
      p_abrechnung_id: ABRECHNUNG_ID,
      p_beschlossen_am: "2091-03-15",
    });
    expect(state.ok).toBe(true);
  });

  it("points to a Zweitbeschluss when the statement is no longer a draft", async () => {
    mockRpc.mockResolvedValue({ error: { code: "23514" } });

    const state = await beschliesseAbrechnungAction({}, beschlussFormData());

    expect(state.errors?._form?.[0]).toContain("Zweitbeschluss");
    expect(state.ok).toBeUndefined();
  });
});
