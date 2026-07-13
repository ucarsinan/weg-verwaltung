import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  send: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/modules/saas/email", () => ({
  getEmailProvider: () => ({ send: mocks.send }),
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
    rpc = vi.fn().mockResolvedValue({ data: "invitation-1", error: null }),
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
    // Default: email delivery not configured (disabled) unless a test overrides.
    mocks.send.mockResolvedValue({ status: "disabled" });
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
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
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
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("emails the invitee and reports delivery, keyed idempotently by invitation id", async () => {
    mocks.send.mockResolvedValue({ status: "sent", id: "email-1" });
    mocks.createClient.mockResolvedValue(authClient());

    const result = await createTenantInvitationAction(
      {},
      formData({ email: "neu@example.test", role: "eigentuemer" }),
    );

    expect(mocks.send).toHaveBeenCalledOnce();
    const [message, options] = mocks.send.mock.calls[0]!;
    expect(message.to).toBe("neu@example.test");
    expect(message.html).toContain(result.invitationUrl);
    expect(options).toEqual({ idempotencyKey: "einladung/invitation-1" });

    expect(result.status).toBe("success");
    expect(result.message).toMatch(/per E-Mail an neu@example\.test gesendet/);
    expect(result.invitationUrl).toBeTruthy();
  });

  it("still succeeds with the link when the email send fails (best-effort)", async () => {
    mocks.send.mockResolvedValue({ status: "error", message: "smtp down" });
    mocks.createClient.mockResolvedValue(authClient());

    const result = await createTenantInvitationAction(
      {},
      formData({ email: "neu@example.test", role: "eigentuemer" }),
    );

    expect(result.status).toBe("success");
    expect(result.invitationUrl).toBeTruthy();
    expect(result.message).toMatch(/E-Mail-Versand ist fehlgeschlagen/);
    expect(result.message).not.toMatch(/smtp down/);
  });

  it("reports the plain link message when email delivery is disabled", async () => {
    mocks.send.mockResolvedValue({ status: "disabled" });
    mocks.createClient.mockResolvedValue(authClient());

    const result = await createTenantInvitationAction(
      {},
      formData({ email: "neu@example.test", role: "eigentuemer" }),
    );

    expect(result.status).toBe("success");
    expect(result.invitationUrl).toBeTruthy();
    expect(result.message).toMatch(/Einladungslink für neu@example\.test/);
  });
});
