import { describe, it, expect, vi, beforeEach } from "vitest";
import { revalidatePath } from "next/cache";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const mockUpsert = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve({ from: mockFrom })),
}));

import { upsertBasiswertAction } from "../actions";

const WEG_ID = "11111111-1111-4111-8111-111111111111";
const KEY_ID = "22222222-2222-4222-8222-222222222222";
const VERSION_ID = "33333333-3333-4333-8333-333333333333";
const UNIT_ID = "44444444-4444-4444-8444-444444444444";

function validFormData(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("wert", overrides.wert ?? "42.5");
  fd.set("einheit", overrides.einheit ?? "m²");
  fd.set("gueltig_ab", overrides.gueltig_ab ?? "2026-01-01");
  return fd;
}

describe("upsertBasiswertAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsert.mockReset();
    mockFrom.mockReset();
    mockFrom.mockReturnValue({ upsert: mockUpsert });
    mockUpsert.mockResolvedValue({ error: null });
  });

  it("rejects invalid route ids before any DB call", async () => {
    const result = await upsertBasiswertAction(
      "bad",
      KEY_ID,
      VERSION_ID,
      UNIT_ID,
      {},
      validFormData(),
    );

    expect(result.errors?._form).toBeTruthy();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("validates wert, einheit, and gueltig_ab", async () => {
    const fd = validFormData({ wert: "-1", einheit: "", gueltig_ab: "" });

    const result = await upsertBasiswertAction(
      WEG_ID,
      KEY_ID,
      VERSION_ID,
      UNIT_ID,
      {},
      fd,
    );

    expect(result.errors?.wert).toBeTruthy();
    expect(result.errors?.einheit).toBeTruthy();
    expect(result.errors?.gueltig_ab).toBeTruthy();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("upserts on the natural key and reports success", async () => {
    const result = await upsertBasiswertAction(
      WEG_ID,
      KEY_ID,
      VERSION_ID,
      UNIT_ID,
      {},
      validFormData(),
    );

    expect(mockFrom).toHaveBeenCalledWith("verteilungsschluessel_basiswert");
    expect(mockUpsert).toHaveBeenCalledWith(
      {
        verteilungsschluessel_version_id: VERSION_ID,
        unit_id: UNIT_ID,
        wert: 42.5,
        einheit: "m²",
        gueltig_ab: "2026-01-01",
      },
      { onConflict: "tenant_id,verteilungsschluessel_version_id,unit_id,gueltig_ab" },
    );
    expect(revalidatePath).toHaveBeenCalledWith(
      `/wegs/${WEG_ID}/finanzen/verteilungsschluessel/${KEY_ID}`,
    );
    expect(result.success).toBe(true);
  });

  it("returns a generic form error when the upsert fails", async () => {
    mockUpsert.mockResolvedValue({ error: { code: "42501", message: "denied" } });

    const result = await upsertBasiswertAction(
      WEG_ID,
      KEY_ID,
      VERSION_ID,
      UNIT_ID,
      {},
      validFormData(),
    );

    expect(result.errors?._form).toBeTruthy();
    expect(result.success).toBeUndefined();
  });
});
