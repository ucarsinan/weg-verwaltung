import { beforeEach, describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const mockFrom = vi.fn();

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

import {
  createZahlungAction,
  deleteZahlungAction,
  saveZuordnungenAction,
} from "../actions";

const WEG_ID = "11111111-1111-4111-8111-111111111111";
const ZAHLUNG_ID = "22222222-2222-4222-8222-222222222222";
const SOLL_A = "33333333-3333-4333-8333-333333333333";
const SOLL_B = "44444444-4444-4444-8444-444444444444";

function zahlungFormData(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("weg_id", WEG_ID);
  fd.set("betrag", "400");
  fd.set("wert_datum", "2060-01-05");
  fd.set("zahler_referenz", "Muster, Hausgeld Januar");
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

function zuordnungFormData(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("weg_id", WEG_ID);
  fd.set("zahlung_id", ZAHLUNG_ID);
  fd.append("sollstellung_id", SOLL_A);
  fd.append("sollstellung_id", SOLL_B);
  fd.set(`betrag_${SOLL_A}`, "400");
  fd.set(`betrag_${SOLL_B}`, "");
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

function insertZahlungOk(id = ZAHLUNG_ID) {
  return {
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id }, error: null }),
      }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFrom.mockReset();
});

describe("createZahlungAction", () => {
  it("rejects an invalid WEG id before touching the database", async () => {
    const state = await createZahlungAction(
      {},
      zahlungFormData({ weg_id: "nope" }),
    );

    expect(state.errors?._form).toBeDefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("refuses a non-positive amount", async () => {
    const state = await createZahlungAction({}, zahlungFormData({ betrag: "0" }));
    expect(state.errors?.betrag).toBeDefined();
  });

  it("requires a payer reference, because that is what the payment is matched by", async () => {
    const state = await createZahlungAction(
      {},
      zahlungFormData({ zahler_referenz: "   " }),
    );
    expect(state.errors?.zahler_referenz).toBeDefined();
  });

  it("accepts a comma as the decimal separator", async () => {
    const table = insertZahlungOk();
    mockFrom.mockReturnValue(table);

    await createZahlungAction({}, zahlungFormData({ betrag: "1234,56" }));

    expect(table.insert).toHaveBeenCalledWith(
      expect.objectContaining({ betrag: 1234.56, quelle: "manuell" }),
    );
  });

  it("sends the user straight to the allocation page", async () => {
    mockFrom.mockReturnValue(insertZahlungOk());

    await createZahlungAction({}, zahlungFormData());

    expect(revalidatePath).toHaveBeenCalledWith(
      `/wegs/${WEG_ID}/finanzen/offene-posten`,
    );
    expect(redirect).toHaveBeenCalledWith(
      `/wegs/${WEG_ID}/finanzen/zahlungen/${ZAHLUNG_ID}`,
    );
  });
});

describe("deleteZahlungAction", () => {
  it("explains the lock when the payment is already allocated", async () => {
    mockFrom.mockReturnValue({
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: { code: "23514" } }),
        }),
      }),
    });

    const fd = new FormData();
    fd.set("weg_id", WEG_ID);
    fd.set("zahlung_id", ZAHLUNG_ID);

    const state = await deleteZahlungAction({}, fd);

    expect(state.errors?._form?.[0]).toContain("bereits zugeordnet");
  });
});

describe("saveZuordnungenAction", () => {
  it("rejects an invalid route before touching the database", async () => {
    const state = await saveZuordnungenAction(
      {},
      zuordnungFormData({ zahlung_id: "nope" }),
    );

    expect(state.errors?._form).toBeDefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("refuses a submission without any amount", async () => {
    const state = await saveZuordnungenAction(
      {},
      zuordnungFormData({ [`betrag_${SOLL_A}`]: "" }),
    );

    expect(state.errors?.betraege?.[0]).toContain("mindestens einen Betrag");
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("refuses a negative amount", async () => {
    const state = await saveZuordnungenAction(
      {},
      zuordnungFormData({ [`betrag_${SOLL_A}`]: "-5" }),
    );

    expect(state.errors?.betraege).toBeDefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("skips empty rows and upserts only what was filled in", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({ upsert });

    const state = await saveZuordnungenAction({}, zuordnungFormData());

    const [rows, options] = upsert.mock.calls[0] ?? [];
    expect(rows).toEqual([
      { zahlung_id: ZAHLUNG_ID, sollstellung_id: SOLL_A, betrag: 400 },
    ]);
    expect(options).toEqual({
      onConflict: "tenant_id,zahlung_id,sollstellung_id",
    });
    expect(state.ok).toBe(true);
  });

  it("translates the database guard into a readable message", async () => {
    mockFrom.mockReturnValue({
      upsert: vi.fn().mockResolvedValue({ error: { code: "23514" } }),
    });

    const state = await saveZuordnungenAction({}, zuordnungFormData());

    expect(state.errors?.betraege?.[0]).toContain("überschreitet den Zahlbetrag");
    expect(state.ok).toBeUndefined();
  });
});
