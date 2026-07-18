import { beforeEach, describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

import {
  logPostgrestError,
  runFormAction,
  type FormActionSpec,
} from "@/modules/action-kernel";

interface TestState {
  errors?: { name?: string[]; _form?: string[] };
}

type TestSpec = FormActionSpec<{ name: string }, TestState>;

function authClient(options?: { user?: { id: string } | null; tenantId?: string | null }) {
  const { user = { id: "user-1" }, tenantId = "tenant-1" } = options ?? {};
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
      getClaims: vi.fn().mockResolvedValue({
        data: {
          claims: {
            app_metadata: tenantId
              ? { tenant_id: tenantId, role: "verwalter" }
              : {},
          },
        },
        error: null,
      }),
    },
  };
}

function spec(execute: TestSpec["execute"]): TestSpec {
  return {
    scope: "testAction",
    guardError: (message) => ({ errors: { _form: [message] } }),
    parse: (formData) => {
      const name = String(formData.get("name") ?? "").trim();
      if (!name) {
        return { errors: { errors: { name: ["Name fehlt."] } } };
      }
      return { input: { name } };
    },
    execute,
  };
}

function formData(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

describe("runFormAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue(authClient());
  });

  it("returns parse errors before touching auth or the DB", async () => {
    const execute = vi.fn();

    const result = await runFormAction(spec(execute), formData({}));

    expect(result).toEqual({ errors: { name: ["Name fehlt."] } });
    expect(execute).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("blocks anonymous callers via the tenant guard (auth as contract)", async () => {
    mocks.createClient.mockResolvedValue(authClient({ user: null }));
    const execute = vi.fn();

    const result = await runFormAction(spec(execute), formData({ name: "x" }));

    expect(result.errors?._form).toEqual(["Sie sind nicht angemeldet."]);
    expect(execute).not.toHaveBeenCalled();
  });

  it("blocks sessions without tenant claim", async () => {
    mocks.createClient.mockResolvedValue(authClient({ tenantId: null }));
    const execute = vi.fn();

    const result = await runFormAction(spec(execute), formData({ name: "x" }));

    expect(result.errors?._form).toEqual(["Kein Mandant im aktuellen JWT-Claim."]);
    expect(execute).not.toHaveBeenCalled();
  });

  it("passes context + parsed input to execute and finishes with revalidate + redirect", async () => {
    const execute = vi.fn().mockResolvedValue({
      revalidate: ["/wegs"],
      redirectTo: "/wegs/neu-1",
    });

    await runFormAction(spec(execute), formData({ name: "WEG Musterweg" }));

    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        tenantId: "tenant-1",
        role: "verwalter",
      }),
      { name: "WEG Musterweg" },
    );
    expect(revalidatePath).toHaveBeenCalledWith("/wegs");
    expect(redirect).toHaveBeenCalledWith("/wegs/neu-1");
  });

  it("returns execute errors unchanged (DB error path)", async () => {
    const execute = vi.fn().mockResolvedValue({
      errors: { errors: { _form: ["Speichern fehlgeschlagen."] } },
    });

    const result = await runFormAction(spec(execute), formData({ name: "x" }));

    expect(result.errors?._form).toEqual(["Speichern fehlgeschlagen."]);
    expect(redirect).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("supports a state outcome with revalidation but without redirect", async () => {
    const execute = vi.fn().mockResolvedValue({
      revalidate: ["/einstellungen"],
      state: {},
    });

    const result = await runFormAction(spec(execute), formData({ name: "x" }));

    expect(result).toEqual({});
    expect(revalidatePath).toHaveBeenCalledWith("/einstellungen");
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("logPostgrestError", () => {
  it("logs only structured code/hint fields, never raw error text", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logPostgrestError("testAction", {
      code: "42501",
      hint: "policy",
    });

    expect(spy).toHaveBeenCalledWith("[testAction] request failed", {
      code: "42501",
      hint: "policy",
    });
    spy.mockRestore();
  });
});
