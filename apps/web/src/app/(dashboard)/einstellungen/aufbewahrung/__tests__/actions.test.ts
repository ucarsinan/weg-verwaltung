import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";

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

import { speichereRegelAction } from "../actions";

function regelFormData(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("doc_typ", "rechnung");
  fd.set("jahre", "10");
  fd.set("rechtsgrundlage", "eigene Rechtsberatung");
  fd.set("notiz", "");
  for (const [key, value] of Object.entries(overrides)) fd.set(key, value);
  return fd;
}

function upsertOk() {
  return { upsert: vi.fn().mockResolvedValue({ error: null }) };
}

function upsertFails(error: { code?: string } = { code: "500" }) {
  return { upsert: vi.fn().mockResolvedValue({ error }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFrom.mockReset();
});

describe("speichereRegelAction", () => {
  it("rejects an unknown doc_typ before touching the database", async () => {
    const state = await speichereRegelAction(
      {},
      regelFormData({ doc_typ: "quittung" }),
    );

    expect(state.errors?.doc_typ).toBeDefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it(
    "rejects 0 years before touching the database — Number('') is 0, so the " +
      "empty-vs-zero guard has to run before any upsert",
    async () => {
      const state = await speichereRegelAction({}, regelFormData({ jahre: "0" }));

      expect(state.errors?.jahre).toBeDefined();
      expect(mockFrom).not.toHaveBeenCalled();
    },
  );

  it("upserts on (tenant_id, doc_typ) using the tenant from the session context", async () => {
    const table = upsertOk();
    mockFrom.mockReturnValueOnce(table);

    const state = await speichereRegelAction({}, regelFormData());

    expect(mockFrom).toHaveBeenCalledWith("aufbewahrungsregel");
    expect(table.upsert).toHaveBeenCalledWith(
      {
        tenant_id: "tenant-1",
        doc_typ: "rechnung",
        jahre: 10,
        rechtsgrundlage: "eigene Rechtsberatung",
        notiz: null,
      },
      { onConflict: "tenant_id,doc_typ" },
    );
    expect(state.errors).toBeUndefined();
    expect(state.success).toBeDefined();
  });

  it("persists an empty jahre field as null (dauerhaft), never as 0", async () => {
    const table = upsertOk();
    mockFrom.mockReturnValueOnce(table);

    await speichereRegelAction({}, regelFormData({ jahre: "" }));

    expect(table.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ jahre: null }),
      expect.anything(),
    );
  });

  it(
    "revalidates the settings page and every WEG's document list — a " +
      "changed rule applies tenant-wide, not to one WEG",
    async () => {
      mockFrom.mockReturnValueOnce(upsertOk());

      await speichereRegelAction({}, regelFormData());

      expect(revalidatePath).toHaveBeenCalledWith("/einstellungen/aufbewahrung");
      expect(revalidatePath).toHaveBeenCalledWith("/wegs/[id]/dokumente", "page");
    },
  );

  it("reports a form error on database failure, without revalidating anything", async () => {
    mockFrom.mockReturnValueOnce(upsertFails());

    const state = await speichereRegelAction({}, regelFormData());

    expect(state.errors?._form).toBeDefined();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
