import { describe, it, expect, vi, beforeEach } from "vitest";
import { redirect } from "next/navigation";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockEq = vi.fn();
const mockFrom = vi.fn();

// action-kernel guard: jede Form-Action prüft jetzt den Tenant-Kontext.
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
    Promise.resolve({ from: mockFrom, auth: mockAuth })
  ),
}));

import { updateUnit, deleteUnit } from "../actions";

describe("Unit Edit Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEq.mockReset();
    mockUpdate.mockReset();
    mockDelete.mockReset();
    mockFrom.mockReset();

    mockFrom.mockReturnValue({
      update: mockUpdate,
      delete: mockDelete,
    });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockDelete.mockReturnValue({ eq: mockEq });
  });

  describe("updateUnit", () => {
    beforeEach(() => {
      mockEq.mockResolvedValue({ error: null });
    });

    it("returns error when bezeichnung is empty", async () => {
      const fd = new FormData();
      fd.set("bezeichnung", "");
      fd.set("mea_zaehler", "45");
      fd.set("mea_nenner", "1000");

      const result = await updateUnit("weg-1", "unit-1", {}, fd);
      expect(result.errors?.bezeichnung).toBeDefined();
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("returns error when mea_zaehler is invalid", async () => {
      const fd = new FormData();
      fd.set("bezeichnung", "Whg. 1");
      fd.set("mea_zaehler", "-5");
      fd.set("mea_nenner", "1000");

      const result = await updateUnit("weg-1", "unit-1", {}, fd);
      expect(result.errors?.mea_zaehler).toBeDefined();
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("returns error when mea_nenner is invalid", async () => {
      const fd = new FormData();
      fd.set("bezeichnung", "Whg. 1");
      fd.set("mea_zaehler", "45");
      fd.set("mea_nenner", "abc");

      const result = await updateUnit("weg-1", "unit-1", {}, fd);
      expect(result.errors?.mea_nenner).toBeDefined();
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("calls update with correct arguments on valid input", async () => {
      const fd = new FormData();
      fd.set("bezeichnung", "Whg. 1 (neu)");
      fd.set("mea_zaehler", "50");
      fd.set("mea_nenner", "1000");

      await updateUnit("weg-1", "unit-1", {}, fd);

      expect(mockFrom).toHaveBeenCalledWith("unit");
      expect(mockUpdate).toHaveBeenCalledWith({
        bezeichnung: "Whg. 1 (neu)",
        mea_zaehler: 50,
        mea_nenner: 1000,
      });
      expect(mockEq).toHaveBeenCalledWith("id", "unit-1");
      expect(redirect).toHaveBeenCalledWith("/wegs/weg-1");
    });

    it("returns form error on database update failure", async () => {
      mockEq.mockResolvedValue({ error: { code: "500", hint: "DB failure" } });

      const fd = new FormData();
      fd.set("bezeichnung", "Whg. 1 (neu)");
      fd.set("mea_zaehler", "50");
      fd.set("mea_nenner", "1000");

      const result = await updateUnit("weg-1", "unit-1", {}, fd);
      expect(result.errors?._form).toBeDefined();
    });
  });

  describe("deleteUnit", () => {
    it("calls delete with correct arguments and redirects on success", async () => {
      mockEq.mockResolvedValue({ error: null });

      await deleteUnit("weg-1", "unit-1");

      expect(mockFrom).toHaveBeenCalledWith("unit");
      expect(mockDelete).toHaveBeenCalled();
      expect(mockEq).toHaveBeenCalledWith("id", "unit-1");
      expect(redirect).toHaveBeenCalledWith("/wegs/weg-1");
    });

    it("returns specialized error message when unit is referenced by co-owners/ownership", async () => {
      mockEq.mockResolvedValue({
        error: { code: "23503", hint: "foreign key constraint violation" },
      });

      const result = await deleteUnit("weg-1", "unit-1");
      expect(result.error).toContain("Eigentumsverhältnisse");
      expect(redirect).not.toHaveBeenCalled();
    });

    it("returns generic error on other database failures", async () => {
      mockEq.mockResolvedValue({
        error: { code: "500", hint: "internal error" },
      });

      const result = await deleteUnit("weg-1", "unit-1");
      expect(result.error).toContain("nicht gelöscht werden");
      expect(redirect).not.toHaveBeenCalled();
    });
  });
});
