import { describe, it, expect, vi, beforeEach } from "vitest";
import { redirect } from "next/navigation";

// Must mock before importing the module under test.
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const mockInsert = vi.fn();
const mockFrom = vi.fn(() => ({ insert: mockInsert }));
const mockGetUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({ from: mockFrom, auth: { getUser: mockGetUser } })
  ),
}));

// Import AFTER mocks are in place.
import { createBeschlussSammlungEntry } from "../actions";

describe("createBeschlussSammlungEntry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-uuid-1" } } });
    mockInsert.mockResolvedValue({ error: null });
  });

  it("returns error when beschluss_text is too short", async () => {
    const fd = new FormData();
    fd.set("beschluss_text", "kurz");
    fd.set("datum", "2026-05-28");
    fd.set("typ", "positiv_beschluss");

    const result = await createBeschlussSammlungEntry("weg-uuid-1", {}, fd);
    expect(result.errors?.beschluss_text).toBeDefined();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("returns error when typ is invalid", async () => {
    const fd = new FormData();
    fd.set("beschluss_text", "Ein gültiger Beschlusstext mit ausreichend Zeichen.");
    fd.set("datum", "2026-05-28");
    fd.set("typ", "ungueltig");

    const result = await createBeschlussSammlungEntry("weg-uuid-1", {}, fd);
    expect(result.errors?.typ).toBeDefined();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("returns error when datum is missing", async () => {
    const fd = new FormData();
    fd.set("beschluss_text", "Ein gültiger Beschlusstext mit ausreichend Zeichen.");
    fd.set("datum", "");
    fd.set("typ", "positiv_beschluss");

    const result = await createBeschlussSammlungEntry("weg-uuid-1", {}, fd);
    expect(result.errors?.datum).toBeDefined();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("calls insert with correct shape on valid input", async () => {
    const fd = new FormData();
    fd.set("beschluss_text", "Die Gemeinschaft beschließt die Dachsanierung.");
    fd.set("datum", "2026-05-28");
    fd.set("typ", "positiv_beschluss");

    await createBeschlussSammlungEntry("weg-uuid-1", {}, fd);

    expect(mockFrom).toHaveBeenCalledWith("beschluss_sammlung_entry");
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        weg_id: "weg-uuid-1",
        beschluss_text: "Die Gemeinschaft beschließt die Dachsanierung.",
        datum: "2026-05-28",
        typ: "positiv_beschluss",
        erstellt_durch: "user-uuid-1",
      })
    );
    expect(redirect).toHaveBeenCalledWith("/wegs/weg-uuid-1/beschluss-sammlung");
  });

  it("rejects resolution-linked final entries outside the Abstimmung finalization", async () => {
    const fd = new FormData();
    fd.set("beschluss_text", "Die Gemeinschaft beschließt die Dachsanierung.");
    fd.set("datum", "2026-05-28");
    fd.set("typ", "positiv_beschluss");
    fd.set("resolution_id", "resolution-uuid-1");

    const result = await createBeschlussSammlungEntry("weg-uuid-1", {}, fd);

    expect(result.errors?._form?.[0]).toMatch(/Abstimmungs-Feststellung/);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("returns _form error when supabase insert fails", async () => {
    mockInsert.mockResolvedValue({ error: { code: "42501", hint: "" } });

    const fd = new FormData();
    fd.set("beschluss_text", "Die Gemeinschaft beschließt die Dachsanierung.");
    fd.set("datum", "2026-05-28");
    fd.set("typ", "positiv_beschluss");

    const result = await createBeschlussSammlungEntry("weg-uuid-1", {}, fd);
    expect(result.errors?._form).toBeDefined();
  });

  it("returns _form error when user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const fd = new FormData();
    fd.set("beschluss_text", "Die Gemeinschaft beschließt die Dachsanierung.");
    fd.set("datum", "2026-05-28");
    fd.set("typ", "positiv_beschluss");

    const result = await createBeschlussSammlungEntry("weg-uuid-1", {}, fd);
    expect(result.errors?._form).toBeDefined();
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
