import { describe, it, expect, vi, beforeEach } from "vitest";
import { redirect } from "next/navigation";

import type { PostgrestError } from "@supabase/supabase-js";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const mockUpdate = vi.fn();
const mockEq = vi.fn(() => Promise.resolve({ error: null as PostgrestError | null }));
const mockFrom = vi.fn(() => ({ update: mockUpdate }));

mockUpdate.mockImplementation(() => ({ eq: mockEq }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({ from: mockFrom })
  ),
}));

import { updateWeg } from "../actions";

describe("updateWeg", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEq.mockResolvedValue({ error: null });
  });

  it("returns error when name is too short", async () => {
    const fd = new FormData();
    fd.set("name", "ab");
    fd.set("addressStreet", "Teststraße");
    fd.set("addressHouseNumber", "1");
    fd.set("addressPostalCode", "12345");
    fd.set("addressCity", "Teststadt");

    const result = await updateWeg("weg-uuid-1", {}, fd);
    expect(result.errors?.name).toBeDefined();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns error when name is too long", async () => {
    const fd = new FormData();
    fd.set("name", "a".repeat(201));

    const result = await updateWeg("weg-uuid-1", {}, fd);
    expect(result.errors?.name).toBeDefined();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns error when adresse is too long", async () => {
    const fd = new FormData();
    fd.set("name", "Gültige WEG");
    fd.set("addressStreet", "Teststraße");
    fd.set("addressHouseNumber", "1");
    fd.set("addressPostalCode", "12345");
    fd.set("addressCity", "Teststadt");
    fd.set("addressAdditional", "a".repeat(501));

    const result = await updateWeg("weg-uuid-1", {}, fd);
    expect(result.errors?.address?.additional).toBeDefined();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("calls update with correct parameters on valid input", async () => {
    const fd = new FormData();
    fd.set("name", "Neue Test-WEG");
    fd.set("addressStreet", "Hauptstraße");
    fd.set("addressHouseNumber", "42");
    fd.set("addressPostalCode", "12345");
    fd.set("addressCity", "Berlin");
    fd.set("addressState", "Berlin");
    fd.set("addressCountry", "Deutschland");
    fd.set("addressAdditional", "Haus A");

    await updateWeg("weg-uuid-1", {}, fd);

    expect(mockFrom).toHaveBeenCalledWith("weg");
    expect(mockUpdate).toHaveBeenCalledWith({
      name: "Neue Test-WEG",
      adresse: "Hauptstraße 42\n12345 Berlin\nBerlin\nDeutschland\nHaus A",
    });
    expect(mockEq).toHaveBeenCalledWith("id", "weg-uuid-1");
    expect(redirect).toHaveBeenCalledWith("/wegs/weg-uuid-1");
  });

  it("returns _form error when database update fails", async () => {
    mockEq.mockResolvedValue({
      error: {
        code: "500",
        hint: "DB failure",
        message: "DB failure",
        details: "DB failure",
      } as PostgrestError,
    });

    const fd = new FormData();
    fd.set("name", "Neue Test-WEG");
    fd.set("addressStreet", "Hauptstraße");
    fd.set("addressHouseNumber", "42");
    fd.set("addressPostalCode", "12345");
    fd.set("addressCity", "Berlin");

    const result = await updateWeg("weg-uuid-1", {}, fd);
    expect(result.errors?._form).toBeDefined();
  });
});
