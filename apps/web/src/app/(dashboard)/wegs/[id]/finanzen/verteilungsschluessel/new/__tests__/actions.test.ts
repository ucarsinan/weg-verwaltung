import { describe, it, expect, vi, beforeEach } from "vitest";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const mockKeyInsert = vi.fn();
const mockKeySelect = vi.fn();
const mockKeySingle = vi.fn();
const mockVersionInsert = vi.fn();
const mockDeleteEq = vi.fn();
const mockDelete = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve({ from: mockFrom })),
}));

import { createVerteilungsschluesselAction } from "../actions";

const WEG_ID = "11111111-1111-4111-8111-111111111111";
const KEY_ID = "22222222-2222-4222-8222-222222222222";

function validFormData(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("weg_id", WEG_ID);
  fd.set("name", overrides.name ?? "Fläche");
  fd.set("typ", overrides.typ ?? "flaeche");
  fd.set("quelle", overrides.quelle ?? "teilungserklaerung");
  fd.set("gueltig_ab", overrides.gueltig_ab ?? "2026-01-01");
  return fd;
}

describe("createVerteilungsschluesselAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockKeyInsert.mockReset();
    mockKeySelect.mockReset();
    mockKeySingle.mockReset();
    mockVersionInsert.mockReset();
    mockDeleteEq.mockReset();
    mockDelete.mockReset();
    mockFrom.mockReset();

    mockFrom.mockImplementation((table: string) => {
      if (table === "verteilungsschluessel") {
        return { insert: mockKeyInsert, delete: mockDelete };
      }
      if (table === "verteilungsschluessel_version") {
        return { insert: mockVersionInsert };
      }
      throw new Error(`unexpected table ${table}`);
    });
    mockKeyInsert.mockReturnValue({ select: mockKeySelect });
    mockKeySelect.mockReturnValue({ single: mockKeySingle });
    mockKeySingle.mockResolvedValue({ data: { id: KEY_ID }, error: null });
    mockVersionInsert.mockResolvedValue({ error: null });
    mockDelete.mockReturnValue({ eq: mockDeleteEq });
    mockDeleteEq.mockResolvedValue({ error: null });
  });

  it("rejects an invalid WEG id before any DB call", async () => {
    const fd = validFormData();
    fd.set("weg_id", "not-a-uuid");

    const result = await createVerteilungsschluesselAction({}, fd);

    expect(result.errors?._form).toBeTruthy();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("validates name, typ, quelle, and gueltig_ab", async () => {
    const fd = validFormData({ name: "", typ: "unknown", quelle: "unknown", gueltig_ab: "" });

    const result = await createVerteilungsschluesselAction({}, fd);

    expect(result.errors?.name).toBeTruthy();
    expect(result.errors?.typ).toBeTruthy();
    expect(result.errors?.quelle).toBeTruthy();
    expect(result.errors?.gueltig_ab).toBeTruthy();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("creates the key and its first version, then redirects to the detail page", async () => {
    const fd = validFormData();

    await createVerteilungsschluesselAction({}, fd);

    expect(mockKeyInsert).toHaveBeenCalledWith({ weg_id: WEG_ID, name: "Fläche" });
    expect(mockVersionInsert).toHaveBeenCalledWith({
      verteilungsschluessel_id: KEY_ID,
      typ: "flaeche",
      quelle: "teilungserklaerung",
      gueltig_ab: "2026-01-01",
    });
    expect(revalidatePath).toHaveBeenCalledWith(
      `/wegs/${WEG_ID}/finanzen/verteilungsschluessel`,
    );
    expect(redirect).toHaveBeenCalledWith(
      `/wegs/${WEG_ID}/finanzen/verteilungsschluessel/${KEY_ID}`,
    );
  });

  it("maps a duplicate key name to a field error", async () => {
    mockKeySingle.mockResolvedValue({
      data: null,
      error: { code: "23505", message: "duplicate" },
    });

    const result = await createVerteilungsschluesselAction({}, validFormData());

    expect(result.errors?.name).toBeTruthy();
    expect(mockVersionInsert).not.toHaveBeenCalled();
  });

  it("deletes the orphaned key when the version insert fails", async () => {
    mockVersionInsert.mockResolvedValue({
      error: { code: "23514", message: "boom" },
    });

    const result = await createVerteilungsschluesselAction({}, validFormData());

    expect(mockDelete).toHaveBeenCalled();
    expect(mockDeleteEq).toHaveBeenCalledWith("id", KEY_ID);
    expect(result.errors?._form).toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });
});
