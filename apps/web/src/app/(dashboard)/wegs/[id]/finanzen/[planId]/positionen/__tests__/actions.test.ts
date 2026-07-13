import { describe, it, expect, vi, beforeEach } from "vitest";
import { revalidatePath } from "next/cache";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const mockCountEq = vi.fn();
const mockCountSelect = vi.fn();
const mockInsert = vi.fn();
const mockDeleteEqPlan = vi.fn();
const mockDeleteEqPosition = vi.fn();
const mockDelete = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve({ from: mockFrom })),
}));

import { createPositionAction, deletePositionAction } from "../actions";

const WEG_ID = "11111111-1111-4111-8111-111111111111";
const PLAN_ID = "22222222-2222-4222-8222-222222222222";
const POSITION_ID = "33333333-3333-4333-8333-333333333333";
const VERSION_ID = "44444444-4444-4444-8444-444444444444";

function validFormData(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("kostenart", overrides.kostenart ?? "Hausmeister");
  fd.set("beschreibung", overrides.beschreibung ?? "");
  fd.set("jahresbetrag", overrides.jahresbetrag ?? "3000");
  fd.set("verteilungsschluessel_version_id", overrides.version ?? VERSION_ID);
  return fd;
}

describe("createPositionAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCountEq.mockReset();
    mockCountSelect.mockReset();
    mockInsert.mockReset();
    mockFrom.mockReset();

    mockFrom.mockReturnValue({ select: mockCountSelect, insert: mockInsert });
    mockCountSelect.mockReturnValue({ eq: mockCountEq });
    mockCountEq.mockResolvedValue({ count: 2 });
    mockInsert.mockResolvedValue({ error: null });
  });

  it("rejects invalid route ids before any DB call", async () => {
    const result = await createPositionAction("bad", PLAN_ID, {}, validFormData());

    expect(result.errors?._form).toBeTruthy();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("validates kostenart, jahresbetrag, and the allocation key", async () => {
    const fd = validFormData({ kostenart: "", jahresbetrag: "-5", version: "not-a-uuid" });

    const result = await createPositionAction(WEG_ID, PLAN_ID, {}, fd);

    expect(result.errors?.kostenart).toBeTruthy();
    expect(result.errors?.jahresbetrag).toBeTruthy();
    expect(result.errors?.verteilungsschluessel_version_id).toBeTruthy();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("inserts the next sequential position number and revalidates", async () => {
    const result = await createPositionAction(WEG_ID, PLAN_ID, {}, validFormData());

    expect(mockInsert).toHaveBeenCalledWith({
      wirtschaftsplan_id: PLAN_ID,
      position: 3,
      kostenart: "Hausmeister",
      beschreibung: null,
      jahresbetrag: 3000,
      verteilungsschluessel_version_id: VERSION_ID,
    });
    expect(revalidatePath).toHaveBeenCalledWith(
      `/wegs/${WEG_ID}/finanzen/${PLAN_ID}/positionen`,
    );
    expect(result.errors).toBeUndefined();
  });

  it("maps a draft-only violation to a friendly message", async () => {
    mockInsert.mockResolvedValue({ error: { code: "23514", message: "boom" } });

    const result = await createPositionAction(WEG_ID, PLAN_ID, {}, validFormData());

    expect(result.errors?._form?.[0]).toMatch(/Entwurf/);
  });
});

describe("deletePositionAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDelete.mockReset();
    mockDeleteEqPlan.mockReset();
    mockDeleteEqPosition.mockReset();
    mockFrom.mockReset();

    mockFrom.mockReturnValue({ delete: mockDelete });
    mockDelete.mockReturnValue({ eq: mockDeleteEqPosition });
    mockDeleteEqPosition.mockReturnValue({ eq: mockDeleteEqPlan });
    mockDeleteEqPlan.mockResolvedValue({ error: null });
  });

  it("rejects invalid ids before any DB call", async () => {
    const result = await deletePositionAction(WEG_ID, PLAN_ID, "bad-id");

    expect(result.error).toBeTruthy();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("deletes the position scoped to the plan and revalidates", async () => {
    const result = await deletePositionAction(WEG_ID, PLAN_ID, POSITION_ID);

    expect(mockDeleteEqPosition).toHaveBeenCalledWith("id", POSITION_ID);
    expect(mockDeleteEqPlan).toHaveBeenCalledWith("wirtschaftsplan_id", PLAN_ID);
    expect(revalidatePath).toHaveBeenCalledWith(
      `/wegs/${WEG_ID}/finanzen/${PLAN_ID}/positionen`,
    );
    expect(result.error).toBeUndefined();
  });

  it("maps a draft-only violation to a friendly message", async () => {
    mockDeleteEqPlan.mockResolvedValue({ error: { code: "23514", message: "boom" } });

    const result = await deletePositionAction(WEG_ID, PLAN_ID, POSITION_ID);

    expect(result.error).toMatch(/Entwurf/);
  });
});
