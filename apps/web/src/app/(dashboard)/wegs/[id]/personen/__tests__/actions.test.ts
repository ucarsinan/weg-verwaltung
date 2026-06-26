import { describe, it, expect, vi, beforeEach } from "vitest";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

// Mock next/navigation and next/cache
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockEq = vi.fn();

const mockFrom = vi.fn(() => ({
  insert: mockInsert,
  update: mockUpdate,
  delete: mockDelete,
}));

// Set up chains
mockUpdate.mockImplementation(() => ({
  eq: mockEq,
}));
mockDelete.mockImplementation(() => ({
  eq: mockEq,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({ from: mockFrom })
  ),
}));

// Import AFTER mocks are defined
import { createPerson, updatePerson, deletePerson } from "../actions";

const WEG_ID = "11111111-1111-1111-1111-111111111111";
const PERSON_ID = "22222222-2222-2222-2222-222222222222";
const USER_ID = "33333333-3333-3333-3333-333333333333";

describe("Person Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockResolvedValue({ error: null });
    mockUpdate.mockReturnValue({ eq: mockEq.mockResolvedValue({ error: null }) });
    mockDelete.mockReturnValue({ eq: mockEq.mockResolvedValue({ error: null }) });
  });

  describe("createPerson", () => {
    it("returns validation error when vorname is empty", async () => {
      const fd = new FormData();
      fd.set("vorname", "");
      fd.set("nachname", "Schmidt");

      const result = await createPerson(WEG_ID, {}, fd);
      expect(result.errors?.vorname).toContain("Vorname darf nicht leer sein.");
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("returns validation error when nachname is empty", async () => {
      const fd = new FormData();
      fd.set("vorname", "Max");
      fd.set("nachname", "");

      const result = await createPerson(WEG_ID, {}, fd);
      expect(result.errors?.nachname).toContain("Nachname darf nicht leer sein.");
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("returns validation error when email is too long", async () => {
      const fd = new FormData();
      fd.set("vorname", "Max");
      fd.set("nachname", "Schmidt");
      fd.set("email", "a".repeat(201));

      const result = await createPerson(WEG_ID, {}, fd);
      expect(result.errors?.email).toContain("E-Mail darf höchstens 200 Zeichen lang sein.");
    });

    it("returns validation error when user_id is not a valid UUID", async () => {
      const fd = new FormData();
      fd.set("vorname", "Max");
      fd.set("nachname", "Schmidt");
      fd.set("user_id", "invalid-uuid");

      const result = await createPerson(WEG_ID, {}, fd);
      expect(result.errors?.user_id).toContain("Benutzer-ID muss ein gültiges UUID-Format haben.");
    });

    it("calls insert with correct trimmed parameters and redirects on success", async () => {
      const fd = new FormData();
      fd.set("vorname", "  Max  ");
      fd.set("nachname", "Schmidt");
      fd.set("email", "max@example.com");
      fd.set("telefon", "012345");
      fd.set("anschrift", "Hauptstr. 1");
      fd.set("user_id", USER_ID);

      await createPerson(WEG_ID, {}, fd);

      expect(mockFrom).toHaveBeenCalledWith("person");
      expect(mockInsert).toHaveBeenCalledWith({
        vorname: "Max",
        nachname: "Schmidt",
        email: "max@example.com",
        telefon: "012345",
        anschrift: "Hauptstr. 1",
        user_id: USER_ID,
      });
      expect(revalidatePath).toHaveBeenCalledWith(`/wegs/${WEG_ID}`);
      expect(redirect).toHaveBeenCalledWith(`/wegs/${WEG_ID}`);
    });

    it("returns form error when insert fails", async () => {
      mockInsert.mockResolvedValue({ error: { code: "500", hint: "DB Error" } });

      const fd = new FormData();
      fd.set("vorname", "Max");
      fd.set("nachname", "Schmidt");

      const result = await createPerson(WEG_ID, {}, fd);
      expect(result.errors?._form).toContain("Person konnte nicht angelegt werden. Bitte erneut versuchen.");
    });
  });

  describe("updatePerson", () => {
    it("returns validation error when vorname is empty", async () => {
      const fd = new FormData();
      fd.set("vorname", "");
      fd.set("nachname", "Schmidt");

      const result = await updatePerson(WEG_ID, PERSON_ID, {}, fd);
      expect(result.errors?.vorname).toContain("Vorname darf nicht leer sein.");
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("calls update with correct parameters and redirects on success", async () => {
      const fd = new FormData();
      fd.set("vorname", "Max");
      fd.set("nachname", "Schmidt");
      fd.set("email", "max@example.com");
      fd.set("telefon", "");
      fd.set("anschrift", "");
      fd.set("user_id", "");

      await updatePerson(WEG_ID, PERSON_ID, {}, fd);

      expect(mockFrom).toHaveBeenCalledWith("person");
      expect(mockUpdate).toHaveBeenCalledWith({
        vorname: "Max",
        nachname: "Schmidt",
        email: "max@example.com",
        telefon: null,
        anschrift: null,
        user_id: null,
      });
      expect(mockEq).toHaveBeenCalledWith("id", PERSON_ID);
      expect(revalidatePath).toHaveBeenCalledWith(`/wegs/${WEG_ID}`);
      expect(redirect).toHaveBeenCalledWith(`/wegs/${WEG_ID}`);
    });

    it("returns form error when update fails", async () => {
      mockEq.mockResolvedValue({ error: { code: "500", hint: "DB Error" } });

      const fd = new FormData();
      fd.set("vorname", "Max");
      fd.set("nachname", "Schmidt");

      const result = await updatePerson(WEG_ID, PERSON_ID, {}, fd);
      expect(result.errors?._form).toContain("Person konnte nicht aktualisiert werden. Bitte erneut versuchen.");
    });
  });

  describe("deletePerson", () => {
    it("calls delete and returns empty object on success", async () => {
      const result = await deletePerson(WEG_ID, PERSON_ID);

      expect(mockFrom).toHaveBeenCalledWith("person");
      expect(mockDelete).toHaveBeenCalled();
      expect(mockEq).toHaveBeenCalledWith("id", PERSON_ID);
      expect(revalidatePath).toHaveBeenCalledWith(`/wegs/${WEG_ID}`);
      expect(result).toEqual({});
    });

    it("returns a specific error message on foreign key violation (23503)", async () => {
      mockEq.mockResolvedValue({ error: { code: "23503", hint: "foreign key violation" } });

      const result = await deletePerson(WEG_ID, PERSON_ID);

      expect(result.errors?._form).toContain(
        "Die Person konnte nicht gelöscht werden, da sie noch als Eigentümer oder Co-Eigentümer eingetragen ist."
      );
    });

    it("returns generic error on other db failures", async () => {
      mockEq.mockResolvedValue({ error: { code: "500", hint: "random error" } });

      const result = await deletePerson(WEG_ID, PERSON_ID);

      expect(result.errors?._form).toContain("Die Person konnte nicht gelöscht werden. Bitte erneut versuchen.");
    });
  });
});
