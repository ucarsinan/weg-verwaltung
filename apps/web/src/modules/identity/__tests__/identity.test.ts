import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

import { readTenantClaims } from "@/modules/identity/claims";
import {
  requireTenantAdmin,
  requireTenantContext,
} from "@/modules/identity/guards";

function authClient(options?: {
  user?: { id: string } | null;
  claims?: unknown;
  claimsError?: Error | null;
}) {
  const {
    user = { id: "user-1" },
    claims = { app_metadata: { tenant_id: "tenant-1", role: "tenant_admin" } },
    claimsError = null,
  } = options ?? {};

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
      getClaims: vi.fn().mockResolvedValue({
        data: claimsError ? null : { claims },
        error: claimsError,
      }),
    },
  };
}

describe("readTenantClaims", () => {
  it("extracts tenant_id, role, email and phone from hook-injected claims", () => {
    expect(
      readTenantClaims({
        email: "a@example.test",
        phone: "+49123",
        app_metadata: { tenant_id: "tenant-1", role: "tenant_admin" },
      }),
    ).toEqual({
      tenantId: "tenant-1",
      role: "tenant_admin",
      email: "a@example.test",
      phone: "+49123",
    });
  });

  it("returns null fields for malformed or missing claims", () => {
    const empty = { tenantId: null, role: null, email: null, phone: null };
    expect(readTenantClaims(undefined)).toEqual(empty);
    expect(readTenantClaims("not-an-object")).toEqual(empty);
    expect(readTenantClaims({ app_metadata: "broken" })).toEqual(empty);
    expect(readTenantClaims({ app_metadata: { tenant_id: 42 } })).toEqual(
      empty,
    );
  });
});

describe("requireTenantContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns userId, tenantId and role for a valid session", async () => {
    mocks.createClient.mockResolvedValue(authClient());

    await expect(requireTenantContext()).resolves.toEqual({
      ok: true,
      userId: "user-1",
      tenantId: "tenant-1",
      role: "tenant_admin",
    });
  });

  it("rejects an anonymous session", async () => {
    mocks.createClient.mockResolvedValue(authClient({ user: null }));

    await expect(requireTenantContext()).resolves.toEqual({
      ok: false,
      message: "Sie sind nicht angemeldet.",
    });
  });

  it("rejects when getClaims fails", async () => {
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mocks.createClient.mockResolvedValue(
      authClient({ claimsError: new Error("boom") }),
    );

    await expect(requireTenantContext()).resolves.toEqual({
      ok: false,
      message: "JWT-Claims konnten nicht verifiziert werden.",
    });
    consoleSpy.mockRestore();
  });

  it("rejects a session without tenant claim", async () => {
    mocks.createClient.mockResolvedValue(
      authClient({ claims: { app_metadata: {} } }),
    );

    await expect(requireTenantContext()).resolves.toEqual({
      ok: false,
      message: "Kein Mandant im aktuellen JWT-Claim.",
    });
  });
});

describe("requireTenantAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps a valid admin session to actorUserId + tenantId", async () => {
    mocks.createClient.mockResolvedValue(authClient());

    await expect(requireTenantAdmin()).resolves.toEqual({
      ok: true,
      actorUserId: "user-1",
      tenantId: "tenant-1",
    });
  });

  it("rejects non-admin roles", async () => {
    mocks.createClient.mockResolvedValue(
      authClient({
        claims: { app_metadata: { tenant_id: "tenant-1", role: "verwalter" } },
      }),
    );

    await expect(requireTenantAdmin()).resolves.toEqual({
      ok: false,
      message: "Nur Mandanten-Admins dürfen Benutzer verwalten.",
    });
  });
});
