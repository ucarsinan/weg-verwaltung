import { describe, it, expect, vi, beforeEach } from "vitest";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const mockEqPlan = vi.fn();
const mockEqWeg = vi.fn();
const mockSelect = vi.fn();
const mockSingle = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockFrom = vi.fn();
const mockRpc = vi.fn();

// action-kernel guard: updateWirtschaftsplanAction prüft jetzt den Tenant-Kontext.
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
  createClient: vi.fn(() => Promise.resolve({ from: mockFrom, rpc: mockRpc, auth: mockAuth })),
}));

import {
  activateWirtschaftsplan,
  archiveWirtschaftsplan,
  createNachtragsplan,
  deleteWirtschaftsplanAction,
  updateWirtschaftsplanAction,
} from "../actions";

describe("updateWirtschaftsplanAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEqPlan.mockReset();
    mockEqWeg.mockReset();
    mockSelect.mockReset();
    mockSingle.mockReset();
    mockUpdate.mockReset();
    mockDelete.mockReset();
    mockFrom.mockReset();
    mockRpc.mockReset();

    mockFrom.mockReturnValue({ update: mockUpdate, delete: mockDelete });
    mockUpdate.mockReturnValue({ eq: mockEqPlan });
    mockDelete.mockReturnValue({ eq: mockEqPlan });
    mockEqPlan.mockReturnValue({ eq: mockEqWeg });
    mockEqWeg.mockReturnValue({ select: mockSelect });
    mockSelect.mockReturnValue({ single: mockSingle });
    mockSingle.mockResolvedValue({ error: null });
  });

  it("returns form error for invalid route ids", async () => {
    const fd = new FormData();
    fd.set("jahr", "2026");
    fd.set("bezeichnung", "Wirtschaftsplan 2026");
    fd.set("gesamtkosten", "12000");

    const result = await updateWirtschaftsplanAction("bad-id", "plan-1", {}, fd);

    expect(result.errors?._form).toBeDefined();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns field errors for invalid input", async () => {
    const fd = new FormData();
    fd.set("jahr", "1800");
    fd.set("bezeichnung", "");
    fd.set("gesamtkosten", "0");

    const result = await updateWirtschaftsplanAction(
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000002",
      {},
      fd,
    );

    expect(result.errors?.jahr).toBeDefined();
    expect(result.errors?.bezeichnung).toBeDefined();
    expect(result.errors?.gesamtkosten).toBeDefined();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("updates plan scoped to WEG and redirects on valid input", async () => {
    const fd = new FormData();
    fd.set("jahr", "2027");
    fd.set("bezeichnung", "Wirtschaftsplan 2027");
    fd.set("gesamtkosten", "24000,50");

    await updateWirtschaftsplanAction(
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000002",
      {},
      fd,
    );

    expect(mockFrom).toHaveBeenCalledWith("wirtschaftsplan");
    expect(mockUpdate).toHaveBeenCalledWith({
      jahr: 2027,
      bezeichnung: "Wirtschaftsplan 2027",
      gesamtkosten: 24000.5,
      wirksam_ab_monat: null,
    });
    expect(mockEqPlan).toHaveBeenCalledWith(
      "id",
      "00000000-0000-0000-0000-000000000002",
    );
    expect(mockEqWeg).toHaveBeenCalledWith(
      "weg_id",
      "00000000-0000-0000-0000-000000000001",
    );
    expect(revalidatePath).toHaveBeenCalledWith(
      "/wegs/00000000-0000-0000-0000-000000000001/finanzen",
    );
    expect(redirect).toHaveBeenCalledWith(
      "/wegs/00000000-0000-0000-0000-000000000001/finanzen",
    );
  });

  it("returns year error on unique constraint violation", async () => {
    mockSingle.mockResolvedValue({
      error: { code: "23505", hint: "duplicate key" },
    });

    const fd = new FormData();
    fd.set("jahr", "2027");
    fd.set("bezeichnung", "Wirtschaftsplan 2027");
    fd.set("gesamtkosten", "24000");

    const result = await updateWirtschaftsplanAction(
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000002",
      {},
      fd,
    );

    expect(result.errors?.jahr).toBeDefined();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("returns form error on database failure", async () => {
    mockSingle.mockResolvedValue({
      error: { code: "500", hint: "internal error" },
    });

    const fd = new FormData();
    fd.set("jahr", "2027");
    fd.set("bezeichnung", "Wirtschaftsplan 2027");
    fd.set("gesamtkosten", "24000");

    const result = await updateWirtschaftsplanAction(
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000002",
      {},
      fd,
    );

    expect(result.errors?._form).toBeDefined();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("returns form error when plan is not found in the requested WEG", async () => {
    mockSingle.mockResolvedValue({
      error: { code: "PGRST116", hint: "not found" },
    });

    const fd = new FormData();
    fd.set("jahr", "2027");
    fd.set("bezeichnung", "Wirtschaftsplan 2027");
    fd.set("gesamtkosten", "24000");

    const result = await updateWirtschaftsplanAction(
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000002",
      {},
      fd,
    );

    expect(result.errors?._form).toBeDefined();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("returns history error when posted Sollstellungen block a rewrite", async () => {
    mockSingle.mockResolvedValue({
      error: { code: "23514", hint: "check violation" },
    });

    const fd = new FormData();
    fd.set("jahr", "2027");
    fd.set("bezeichnung", "Wirtschaftsplan 2027");
    fd.set("gesamtkosten", "24000");

    const result = await updateWirtschaftsplanAction(
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000002",
      {},
      fd,
    );

    expect(result.errors?._form?.join(" ")).toContain("historische Forderungen");
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("wirtschaftsplan lifecycle actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
    mockRpc.mockReset();
    mockRpc.mockResolvedValue({ data: null, error: null });
  });

  it("activates a plan through the lifecycle RPC", async () => {
    await activateWirtschaftsplan(
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000002",
    );

    expect(mockRpc).toHaveBeenCalledWith("activate_wirtschaftsplan", {
      p_wirtschaftsplan_id: "00000000-0000-0000-0000-000000000002",
    });
    expect(revalidatePath).toHaveBeenCalledWith(
      "/wegs/00000000-0000-0000-0000-000000000001/finanzen",
    );
    expect(redirect).toHaveBeenCalledWith(
      "/wegs/00000000-0000-0000-0000-000000000001/finanzen",
    );
  });

  it("archives a plan through the lifecycle RPC", async () => {
    await archiveWirtschaftsplan(
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000002",
    );

    expect(mockRpc).toHaveBeenCalledWith("archive_wirtschaftsplan", {
      p_wirtschaftsplan_id: "00000000-0000-0000-0000-000000000002",
    });
    expect(redirect).toHaveBeenCalledWith(
      "/wegs/00000000-0000-0000-0000-000000000001/finanzen",
    );
  });

  it("creates a Nachtragsplan and redirects to the new draft", async () => {
    mockRpc.mockResolvedValue({
      data: "00000000-0000-0000-0000-000000000003",
      error: null,
    });

    await createNachtragsplan(
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000002",
    );

    expect(mockRpc).toHaveBeenCalledWith("create_nachtragsplan", {
      p_wirtschaftsplan_id: "00000000-0000-0000-0000-000000000002",
    });
    expect(redirect).toHaveBeenCalledWith(
      "/wegs/00000000-0000-0000-0000-000000000001/finanzen/00000000-0000-0000-0000-000000000003/edit",
    );
  });

  it("maps lifecycle constraint violations to an actionable error", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "23514", hint: "invalid transition" },
    });

    const result = await activateWirtschaftsplan(
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000002",
    );

    expect(result.error).toContain("Statuswechsel");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("rejects invalid lifecycle route ids before RPC calls", async () => {
    const result = await archiveWirtschaftsplan("bad-id", "also-bad");

    expect(result.error).toBeDefined();
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe("deleteWirtschaftsplanAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEqPlan.mockReset();
    mockEqWeg.mockReset();
    mockSelect.mockReset();
    mockSingle.mockReset();
    mockUpdate.mockReset();
    mockDelete.mockReset();
    mockFrom.mockReset();

    mockFrom.mockReturnValue({ update: mockUpdate, delete: mockDelete });
    mockUpdate.mockReturnValue({ eq: mockEqPlan });
    mockDelete.mockReturnValue({ eq: mockEqPlan });
    mockEqPlan.mockReturnValue({ eq: mockEqWeg });
    mockEqWeg.mockReturnValue({ select: mockSelect });
    mockSelect.mockReturnValue({ single: mockSingle });
    mockSingle.mockResolvedValue({ error: null });
  });

  it("returns error for invalid route ids", async () => {
    const result = await deleteWirtschaftsplanAction("bad-id", "plan-1");

    expect(result.error).toBeDefined();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("deletes plan scoped to WEG and redirects on success", async () => {
    await deleteWirtschaftsplanAction(
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000002",
    );

    expect(mockFrom).toHaveBeenCalledWith("wirtschaftsplan");
    expect(mockDelete).toHaveBeenCalled();
    expect(mockEqPlan).toHaveBeenCalledWith(
      "id",
      "00000000-0000-0000-0000-000000000002",
    );
    expect(mockEqWeg).toHaveBeenCalledWith(
      "weg_id",
      "00000000-0000-0000-0000-000000000001",
    );
    expect(revalidatePath).toHaveBeenCalledWith(
      "/wegs/00000000-0000-0000-0000-000000000001/finanzen",
    );
    expect(redirect).toHaveBeenCalledWith(
      "/wegs/00000000-0000-0000-0000-000000000001/finanzen",
    );
  });

  it("returns error when plan is not found in the requested WEG", async () => {
    mockSingle.mockResolvedValue({
      error: { code: "PGRST116", hint: "not found" },
    });

    const result = await deleteWirtschaftsplanAction(
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000002",
    );

    expect(result.error).toContain("nicht gefunden");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("returns generic error on database failure", async () => {
    mockSingle.mockResolvedValue({
      error: { code: "500", hint: "internal error" },
    });

    const result = await deleteWirtschaftsplanAction(
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000002",
    );

    expect(result.error).toContain("nicht gelöscht werden");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("returns history error when posted Sollstellungen block deletion", async () => {
    mockSingle.mockResolvedValue({
      error: { code: "23514", hint: "check violation" },
    });

    const result = await deleteWirtschaftsplanAction(
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000002",
    );

    expect(result.error).toContain("historische Sollstellungen");
    expect(redirect).not.toHaveBeenCalled();
  });
});
