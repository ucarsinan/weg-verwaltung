import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

import { createTenantInvitationAction } from "@/modules/settings/admin/invitation-actions";

function formData(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

function authClient(options?: {
  user?: { id: string; email?: string } | null;
  tenantId?: string;
  role?: string;
  rpc?: ReturnType<typeof vi.fn>;
}) {
  const {
    user = { id: "admin-1", email: "admin@example.test" },
    tenantId = "tenant-1",
    role = "tenant_admin",
    rpc = vi.fn().mockResolvedValue({ error: null }),
  } = options ?? {};

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
      getClaims: vi.fn().mockResolvedValue({
        data: { claims: { app_metadata: { tenant_id: tenantId, role } } },
        error: null,
      }),
    },
    rpc,
  };
}

describe("createTenantInvitationAction", () => {
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "https://example.test";
  });

  afterEach(() => {
    if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
  });

  it("rejects non-tenant-admins before touching the RPC", async () => {
    const rpc = vi.fn();
    mocks.createClient.mockResolvedValue(
      authClient({ role: "eigentuemer", rpc }),
    );

    const result = await createTenantInvitationAction(
      {},
      formData({ email: "neu@example.test", role: "eigentuemer" }),
    );

    expect(result).toEqual({
      status: "error",
      message: "Nur Mandanten-Admins dürfen Benutzer verwalten.",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns field errors for an invalid email or role", async () => {
    mocks.createClient.mockResolvedValue(authClient());

    const result = await createTenantInvitationAction(
      {},
      formData({ email: "not-an-email", role: "beirat" }),
    );

    expect(result.status).toBe("error");
    expect(result.fieldErrors?.email).toBeTruthy();
    expect(result.fieldErrors?.role).toBeTruthy();
  });

  it("calls create_tenant_invitation with a \\x-hex token_hash and returns the invitation link", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    mocks.createClient.mockResolvedValue(authClient({ rpc }));

    const result = await createTenantInvitationAction(
      {},
      formData({ email: "Neu@Example.test", role: "eigentuemer" }),
    );

    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("create_tenant_invitation", {
      p_email: "neu@example.test",
      p_role: "eigentuemer",
      p_token_hash: expect.stringMatching(/^\\x[0-9a-f]{64}$/),
    });

    expect(result.status).toBe("success");
    expect(result.invitationUrl).toMatch(
      /^https:\/\/example\.test\/einladung\/[A-Za-z0-9_-]+$/,
    );
  });

  it("returns a generic error when the RPC fails", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { message: "boom" } });
    mocks.createClient.mockResolvedValue(authClient({ rpc }));

    const result = await createTenantInvitationAction(
      {},
      formData({ email: "neu@example.test", role: "eigentuemer" }),
    );

    expect(result).toEqual({
      status: "error",
      message:
        "Die Einladung konnte nicht erstellt werden. Bitte versuchen Sie es später erneut.",
    });
  });
});
