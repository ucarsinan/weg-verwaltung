import { describe, it, expect, vi, beforeEach } from "vitest";
import { redirect } from "next/navigation";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const mockInsert = vi.fn();
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
  createClient: vi.fn(() => Promise.resolve({ from: mockFrom, auth: mockAuth })),
}));

import { createUnit } from "../actions";

const WEG_ID = "11111111-1111-4111-8111-111111111111";

function validFormData(): FormData {
  const fd = new FormData();
  fd.set("weg_id", WEG_ID);
  fd.set("bezeichnung", "Whg. 1");
  fd.set("mea_zaehler", "50");
  fd.set("mea_nenner", "1000");
  return fd;
}

describe("Unit Create Server Action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockReset();
    mockFrom.mockReset();

    mockFrom.mockReturnValue({ insert: mockInsert });
    mockInsert.mockResolvedValue({ error: null });
  });

  it("returns an error when weg_id is invalid", async () => {
    const fd = validFormData();
    fd.set("weg_id", "not-a-uuid");

    const result = await createUnit({}, fd);

    expect(result.errors?._form).toBeDefined();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("returns field errors for invalid MEA values", async () => {
    const fd = validFormData();
    fd.set("mea_zaehler", "0");
    fd.set("mea_nenner", "");

    const result = await createUnit({}, fd);

    expect(result.errors?.mea_zaehler).toBeDefined();
    expect(result.errors?.mea_nenner).toBeDefined();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("rejects partial integer strings for MEA values", async () => {
    const fd = validFormData();
    fd.set("mea_zaehler", "1.5");
    fd.set("mea_nenner", "12abc");

    const result = await createUnit({}, fd);

    expect(result.errors?.mea_zaehler).toBeDefined();
    expect(result.errors?.mea_nenner).toBeDefined();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("inserts the unit and redirects on valid input", async () => {
    const fd = validFormData();

    await createUnit({}, fd);

    expect(mockFrom).toHaveBeenCalledWith("unit");
    expect(mockInsert).toHaveBeenCalledWith({
      weg_id: WEG_ID,
      bezeichnung: "Whg. 1",
      mea_zaehler: 50,
      mea_nenner: 1000,
    });
    expect(redirect).toHaveBeenCalledWith(`/wegs/${WEG_ID}`);
  });

  it("returns a visible form error on database insert failure", async () => {
    mockInsert.mockResolvedValue({
      error: { code: "23503", hint: "foreign key constraint violation" },
    });

    const result = await createUnit({}, validFormData());

    expect(result.errors?._form).toBeDefined();
    expect(redirect).not.toHaveBeenCalled();
  });
});
