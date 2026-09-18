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

import { createPositionAction, deletePositionAction } from "../actions";

const WEG_ID = "11111111-1111-4111-8111-111111111111";
const PLAN_ID = "22222222-2222-4222-8222-222222222222";
const VERSION_ID = "33333333-3333-4333-8333-333333333333";
const POSITION_ID = "44444444-4444-4444-8444-444444444444";

/** `select().eq().order().limit()` — die Abfrage der hoechsten Positionsnummer. */
function letztePositionIst(position: number | null) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({
            data: position === null ? [] : [{ position }],
            error: null,
          }),
        }),
      }),
    }),
  };
}

function positionFormData(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("weg_id", WEG_ID);
  fd.set("plan_id", PLAN_ID);
  fd.set("kostenart", "Hausreinigung");
  fd.set("jahresbetrag", "12000");
  fd.set("verteilungsschluessel_version_id", VERSION_ID);
  for (const [key, value] of Object.entries(overrides)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFrom.mockReset();
});

describe("createPositionAction", () => {
  it("rejects an invalid route before touching the database", async () => {
    const state = await createPositionAction(
      {},
      positionFormData({ plan_id: "nope" }),
    );

    expect(state.errors?._form).toBeDefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("requires a Kostenart and a selected Verteilungsschlüssel", async () => {
    const state = await createPositionAction(
      {},
      positionFormData({
        kostenart: "   ",
        verteilungsschluessel_version_id: "",
      }),
    );

    expect(state.errors?.kostenart).toBeDefined();
    expect(state.errors?.verteilungsschluessel_version_id).toBeDefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("refuses a negative Jahresbetrag", async () => {
    const state = await createPositionAction(
      {},
      positionFormData({ jahresbetrag: "-1" }),
    );

    expect(state.errors?.jahresbetrag).toBeDefined();
  });

  it("accepts 0 as a Jahresbetrag, matching the check constraint", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    mockFrom
      .mockReturnValueOnce(letztePositionIst(null))
      .mockReturnValueOnce({ insert });

    const state = await createPositionAction(
      {},
      positionFormData({ jahresbetrag: "0" }),
    );

    expect(state.errors).toBeUndefined();
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ jahresbetrag: 0 }),
    );
  });

  it("numbers the first position 1", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    mockFrom
      .mockReturnValueOnce(letztePositionIst(null))
      .mockReturnValueOnce({ insert });

    await createPositionAction({}, positionFormData());

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        position: 1,
        wirtschaftsplan_id: PLAN_ID,
        kostenart: "Hausreinigung",
        jahresbetrag: 12000,
        verteilungsschluessel_version_id: VERSION_ID,
        beschreibung: null,
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith(
      `/wegs/${WEG_ID}/finanzen/${PLAN_ID}/positionen`,
    );
  });

  it("continues the numbering after the highest existing position", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    mockFrom
      .mockReturnValueOnce(letztePositionIst(7))
      .mockReturnValueOnce({ insert });

    await createPositionAction({}, positionFormData());

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ position: 8 }),
    );
  });

  it("explains the draft-only rule when the plan is no longer a draft", async () => {
    mockFrom.mockReturnValueOnce(letztePositionIst(1)).mockReturnValueOnce({
      insert: vi.fn().mockResolvedValue({ error: { code: "23514" } }),
    });

    const state = await createPositionAction({}, positionFormData());

    expect(state.errors?._form?.[0]).toContain("nur ändern");
  });

  it("asks the user to retry when the position number was taken concurrently", async () => {
    mockFrom.mockReturnValueOnce(letztePositionIst(1)).mockReturnValueOnce({
      insert: vi.fn().mockResolvedValue({ error: { code: "23505" } }),
    });

    const state = await createPositionAction({}, positionFormData());

    expect(state.errors?._form?.[0]).toContain("erneut speichern");
  });

  it("stops when the existing positions cannot be read", async () => {
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi
              .fn()
              .mockResolvedValue({ data: null, error: { code: "500" } }),
          }),
        }),
      }),
    });

    const state = await createPositionAction({}, positionFormData());

    expect(state.errors?._form).toBeDefined();
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });
});

describe("deletePositionAction", () => {
  function deleteFormData(overrides: Record<string, string> = {}) {
    const fd = new FormData();
    fd.set("weg_id", WEG_ID);
    fd.set("plan_id", PLAN_ID);
    fd.set("position_id", POSITION_ID);
    for (const [key, value] of Object.entries(overrides)) fd.set(key, value);
    return fd;
  }

  it("rejects an invalid position id", async () => {
    const state = await deletePositionAction(
      {},
      deleteFormData({ position_id: "nope" }),
    );

    expect(state.errors?._form).toBeDefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("scopes the delete to the plan in the route", async () => {
    const eqPlan = vi.fn().mockResolvedValue({ error: null });
    const eqId = vi.fn().mockReturnValue({ eq: eqPlan });
    mockFrom.mockReturnValue({
      delete: vi.fn().mockReturnValue({ eq: eqId }),
    });

    await deletePositionAction({}, deleteFormData());

    expect(eqId).toHaveBeenCalledWith("id", POSITION_ID);
    expect(eqPlan).toHaveBeenCalledWith("wirtschaftsplan_id", PLAN_ID);
  });

  it("explains the draft-only rule on a check violation", async () => {
    mockFrom.mockReturnValue({
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: { code: "23514" } }),
        }),
      }),
    });

    const state = await deletePositionAction({}, deleteFormData());

    expect(state.errors?._form?.[0]).toContain("nur ändern");
  });
});
