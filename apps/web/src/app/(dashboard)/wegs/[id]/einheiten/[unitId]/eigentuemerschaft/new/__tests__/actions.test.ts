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

const mockSinglePerson = vi.fn();
const mockSelectPerson = vi.fn(() => ({
  single: mockSinglePerson,
}));
const mockInsertPerson = vi.fn(() => ({
  select: mockSelectPerson,
}));

const mockSingleOwnership = vi.fn();
const mockSelectOwnership = vi.fn(() => ({
  single: mockSingleOwnership,
}));
const mockInsertOwnership = vi.fn(() => ({
  select: mockSelectOwnership,
}));

const mockInsertCoOwner = vi.fn();

const mockFrom = vi.fn((table: string) => {
  if (table === "person") {
    return {
      insert: mockInsertPerson,
    };
  }
  if (table === "ownership") {
    return {
      insert: mockInsertOwnership,
    };
  }
  if (table === "ownership_co_owner") {
    return {
      insert: mockInsertCoOwner,
    };
  }
  return {};
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({ from: mockFrom })
  ),
}));

// Import AFTER mocks are defined
import { createEigentuemer } from "../actions";

const WEG_ID = "11111111-1111-1111-1111-111111111111";
const UNIT_ID = "22222222-2222-2222-2222-222222222222";

describe("createEigentuemer Server Action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSinglePerson.mockResolvedValue({ data: { id: "new-person-uuid-1" }, error: null });
    mockSingleOwnership.mockResolvedValue({ data: { id: "ownership-uuid-1" }, error: null });
    mockInsertCoOwner.mockResolvedValue({ error: null });
  });

  describe("Validation Errors", () => {
    it("returns validation error on _form if IDs are invalid", async () => {
      const fd = new FormData();
      fd.set("weg_id", "invalid-uuid");
      fd.set("unit_id", UNIT_ID);

      const result = await createEigentuemer({}, fd);
      expect(result.errors?._form).toContain("Ungültige IDs. Bitte Seite neu laden.");
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it("returns validation error if von date is missing or invalid", async () => {
      const fd = new FormData();
      fd.set("weg_id", WEG_ID);
      fd.set("unit_id", UNIT_ID);
      fd.set("von", "");
      fd.set("vorname", "Max");
      fd.set("nachname", "Mustermann");

      const result = await createEigentuemer({}, fd);
      expect(result.errors?.von).toContain("Bitte ein gültiges Einzugsdatum angeben (JJJJ-MM-TT).");
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it("returns validation error if inline person is partially filled (missing vorname)", async () => {
      const fd = new FormData();
      fd.set("weg_id", WEG_ID);
      fd.set("unit_id", UNIT_ID);
      fd.set("von", "2026-06-10");
      fd.set("vorname", "");
      fd.set("nachname", "Mustermann");

      const result = await createEigentuemer({}, fd);
      expect(result.errors?.vorname).toContain("Vorname darf nicht leer sein.");
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it("returns validation error if inline person is partially filled (missing nachname)", async () => {
      const fd = new FormData();
      fd.set("weg_id", WEG_ID);
      fd.set("unit_id", UNIT_ID);
      fd.set("von", "2026-06-10");
      fd.set("vorname", "Max");
      fd.set("nachname", "");

      const result = await createEigentuemer({}, fd);
      expect(result.errors?.nachname).toContain("Nachname darf nicht leer sein.");
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it("returns validation error on _form if neither inline person nor existing people are provided", async () => {
      const fd = new FormData();
      fd.set("weg_id", WEG_ID);
      fd.set("unit_id", UNIT_ID);
      fd.set("von", "2026-06-10");

      const result = await createEigentuemer({}, fd);
      expect(result.errors?._form).toContain(
        "Bitte entweder eine neue Person anlegen oder mindestens eine existierende Person auswählen."
      );
      expect(mockFrom).not.toHaveBeenCalled();
    });
  });

  describe("Happy Paths", () => {
    it("creates owner with new inline person and redirects", async () => {
      const fd = new FormData();
      fd.set("weg_id", WEG_ID);
      fd.set("unit_id", UNIT_ID);
      fd.set("von", "2026-06-10");
      fd.set("vorname", "Max");
      fd.set("nachname", "Mustermann");
      fd.set("email", "max@example.com");
      fd.set("telefon", "12345");

      await createEigentuemer({}, fd);

      // Verify person insert
      expect(mockFrom).toHaveBeenCalledWith("person");
      expect(mockInsertPerson).toHaveBeenCalledWith({
        vorname: "Max",
        nachname: "Mustermann",
        email: "max@example.com",
        telefon: "12345",
      });

      // Verify ownership insert
      expect(mockFrom).toHaveBeenCalledWith("ownership");
      expect(mockInsertOwnership).toHaveBeenCalledWith({
        weg_id: WEG_ID,
        unit_id: UNIT_ID,
        person_id: "new-person-uuid-1",
        von: "2026-06-10",
      });

      // Verify revalidation and redirect
      expect(revalidatePath).toHaveBeenCalledWith(`/wegs/${WEG_ID}/einheiten/${UNIT_ID}/eigentuemerschaft`);
      expect(redirect).toHaveBeenCalledWith(`/wegs/${WEG_ID}/einheiten/${UNIT_ID}/eigentuemerschaft`);
    });

    it("creates owner with existing person and redirects (no co-owners)", async () => {
      const fd = new FormData();
      fd.set("weg_id", WEG_ID);
      fd.set("unit_id", UNIT_ID);
      fd.set("von", "2026-06-10");
      fd.append("existing_person_ids", "existing-person-uuid-1");

      await createEigentuemer({}, fd);

      // Person should not be created inline
      expect(mockInsertPerson).not.toHaveBeenCalled();

      // Verify ownership insert with existing person
      expect(mockFrom).toHaveBeenCalledWith("ownership");
      expect(mockInsertOwnership).toHaveBeenCalledWith({
        weg_id: WEG_ID,
        unit_id: UNIT_ID,
        person_id: "existing-person-uuid-1",
        von: "2026-06-10",
      });

      // Co-owner should not be inserted
      expect(mockInsertCoOwner).not.toHaveBeenCalled();

      expect(redirect).toHaveBeenCalled();
    });

    it("creates owner with combination of inline person and existing co-owners", async () => {
      const fd = new FormData();
      fd.set("weg_id", WEG_ID);
      fd.set("unit_id", UNIT_ID);
      fd.set("von", "2026-06-10");
      fd.set("vorname", "Max");
      fd.set("nachname", "Mustermann");
      fd.append("existing_person_ids", "existing-person-uuid-1");
      fd.append("existing_person_ids", "existing-person-uuid-2");

      await createEigentuemer({}, fd);

      // Verify person insert
      expect(mockFrom).toHaveBeenCalledWith("person");
      expect(mockInsertPerson).toHaveBeenCalled();

      // Verify ownership insert (primary owner is the new person)
      expect(mockFrom).toHaveBeenCalledWith("ownership");
      expect(mockInsertOwnership).toHaveBeenCalledWith({
        weg_id: WEG_ID,
        unit_id: UNIT_ID,
        person_id: "new-person-uuid-1",
        von: "2026-06-10",
      });

      // Verify co-owners insert
      expect(mockFrom).toHaveBeenCalledWith("ownership_co_owner");
      expect(mockInsertCoOwner).toHaveBeenCalledWith([
        { ownership_id: "ownership-uuid-1", person_id: "existing-person-uuid-1" },
        { ownership_id: "ownership-uuid-1", person_id: "existing-person-uuid-2" },
      ]);

      expect(redirect).toHaveBeenCalled();
    });

    it("creates owner with multiple existing people and co-owners", async () => {
      const fd = new FormData();
      fd.set("weg_id", WEG_ID);
      fd.set("unit_id", UNIT_ID);
      fd.set("von", "2026-06-10");
      fd.append("existing_person_ids", "existing-person-uuid-1");
      fd.append("existing_person_ids", "existing-person-uuid-2");

      await createEigentuemer({}, fd);

      expect(mockInsertPerson).not.toHaveBeenCalled();

      // Primary owner is first in array
      expect(mockInsertOwnership).toHaveBeenCalledWith({
        weg_id: WEG_ID,
        unit_id: UNIT_ID,
        person_id: "existing-person-uuid-1",
        von: "2026-06-10",
      });

      // Second is co-owner
      expect(mockInsertCoOwner).toHaveBeenCalledWith([
        { ownership_id: "ownership-uuid-1", person_id: "existing-person-uuid-2" },
      ]);

      expect(redirect).toHaveBeenCalled();
    });
  });

  describe("Database Failures", () => {
    it("returns form error when person insert fails", async () => {
      mockSinglePerson.mockResolvedValue({ data: null, error: { code: "500", hint: "DB Failure" } });

      const fd = new FormData();
      fd.set("weg_id", WEG_ID);
      fd.set("unit_id", UNIT_ID);
      fd.set("von", "2026-06-10");
      fd.set("vorname", "Max");
      fd.set("nachname", "Mustermann");

      const result = await createEigentuemer({}, fd);
      expect(result.errors?._form).toContain("Person konnte nicht angelegt werden. Bitte erneut versuchen.");
      expect(mockInsertOwnership).not.toHaveBeenCalled();
    });

    it("returns form error when ownership insert fails", async () => {
      mockSingleOwnership.mockResolvedValue({ data: null, error: { code: "500", hint: "DB Failure" } });

      const fd = new FormData();
      fd.set("weg_id", WEG_ID);
      fd.set("unit_id", UNIT_ID);
      fd.set("von", "2026-06-10");
      fd.set("vorname", "Max");
      fd.set("nachname", "Mustermann");

      const result = await createEigentuemer({}, fd);
      expect(result.errors?._form).toContain(
        "Eigentümerschaft konnte nicht angelegt werden. Bitte erneut versuchen."
      );
      expect(mockInsertCoOwner).not.toHaveBeenCalled();
    });

    it("returns form error when co-owner insert fails", async () => {
      mockInsertCoOwner.mockResolvedValue({ error: { code: "500", hint: "DB Failure" } });

      const fd = new FormData();
      fd.set("weg_id", WEG_ID);
      fd.set("unit_id", UNIT_ID);
      fd.set("von", "2026-06-10");
      fd.append("existing_person_ids", "existing-person-uuid-1");
      fd.append("existing_person_ids", "existing-person-uuid-2");

      const result = await createEigentuemer({}, fd);
      expect(result.errors?._form).toContain(
        "Miteigentümer konnten nicht verknüpft werden. Bitte erneut versuchen."
      );
      expect(redirect).not.toHaveBeenCalled();
    });
  });
});
