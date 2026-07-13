import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

import { hashInvitationToken } from "@/modules/saas/invitation";
import {
  acceptInvitationAction,
  signUpForInvitationAction,
} from "@/app/einladung/[token]/actions";

const TOKEN = "abcdefghijklmnopqrstuvwxyz0123456789ABCD";

function formData(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

function client(options?: {
  user?: { id: string } | null;
  signUp?: ReturnType<typeof vi.fn>;
  rpc?: ReturnType<typeof vi.fn>;
  refreshSession?: ReturnType<typeof vi.fn>;
}) {
  const {
    user = { id: "invitee-1" },
    signUp = vi.fn().mockResolvedValue({ error: null }),
    rpc = vi.fn().mockResolvedValue({ error: null }),
    refreshSession = vi.fn().mockResolvedValue({ error: null }),
  } = options ?? {};

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
      signUp,
      refreshSession,
    },
    rpc,
  };
}

describe("signUpForInvitationAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "https://example.test";
  });

  it("returns field errors before calling signUp", async () => {
    const signUp = vi.fn();
    mocks.createClient.mockResolvedValue(client({ signUp }));

    const result = await signUpForInvitationAction(
      TOKEN,
      {},
      formData({ email: "not-an-email", password: "short" }),
    );

    expect(result.status).toBe("error");
    expect(result.fieldErrors?.email).toBeTruthy();
    expect(result.fieldErrors?.password).toBeTruthy();
    expect(signUp).not.toHaveBeenCalled();
  });

  it("signs up with an emailRedirectTo that carries the invitation token", async () => {
    const signUp = vi.fn().mockResolvedValue({ error: null });
    mocks.createClient.mockResolvedValue(client({ signUp }));

    const result = await signUpForInvitationAction(
      TOKEN,
      {},
      formData({ email: "invitee@example.test", password: "supersecurepassword" }),
    );

    expect(signUp).toHaveBeenCalledOnce();
    expect(signUp).toHaveBeenCalledWith({
      email: "invitee@example.test",
      password: "supersecurepassword",
      options: {
        emailRedirectTo: `https://example.test/auth/callback?next=${encodeURIComponent(`/einladung/${TOKEN}`)}`,
      },
    });
    expect(result.status).toBe("success");
  });

  it("returns a generic error when signUp fails", async () => {
    mocks.createClient.mockResolvedValue(
      client({ signUp: vi.fn().mockResolvedValue({ error: { message: "boom" } }) }),
    );

    const result = await signUpForInvitationAction(
      TOKEN,
      {},
      formData({ email: "invitee@example.test", password: "supersecurepassword" }),
    );

    expect(result.status).toBe("error");
    expect(result.message).not.toMatch(/boom/);
  });
});

describe("acceptInvitationAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirect.mockImplementation(() => {
      throw new Error("redirect called");
    });
  });

  it("returns field errors before checking authentication", async () => {
    mocks.createClient.mockResolvedValue(client());

    const result = await acceptInvitationAction(
      TOKEN,
      {},
      formData({ vorname: "", nachname: "" }),
    );

    expect(result.fieldErrors?.vorname).toBeTruthy();
    expect(result.fieldErrors?.nachname).toBeTruthy();
  });

  it("requires an authenticated session", async () => {
    const rpc = vi.fn();
    mocks.createClient.mockResolvedValue(client({ user: null, rpc }));

    const result = await acceptInvitationAction(
      TOKEN,
      {},
      formData({ vorname: "Erika", nachname: "Musterfrau" }),
    );

    expect(result.message).toBe("Bitte melden Sie sich erneut an.");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls accept_tenant_invitation with the correctly hashed token", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    mocks.createClient.mockResolvedValue(client({ rpc }));

    await expect(
      acceptInvitationAction(
        TOKEN,
        {},
        formData({ vorname: "Erika", nachname: "Musterfrau" }),
      ),
    ).rejects.toThrow("redirect called");

    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("accept_tenant_invitation", {
      p_token_hash: hashInvitationToken(TOKEN),
      p_vorname: "Erika",
      p_nachname: "Musterfrau",
    });
    expect(mocks.redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("returns a single generic message for any RPC rejection", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ error: { message: "invitation is invalid or no longer available" } });
    mocks.createClient.mockResolvedValue(client({ rpc }));

    const result = await acceptInvitationAction(
      TOKEN,
      {},
      formData({ vorname: "Erika", nachname: "Musterfrau" }),
    );

    expect(result.message).toMatch(/ungültig, abgelaufen oder nicht mehr verfügbar/);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
