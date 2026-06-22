import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRpc = vi.fn();
const mockGetUser = vi.fn();
const mockGetClaims = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: {
        getUser: mockGetUser,
        getClaims: mockGetClaims,
      },
      rpc: mockRpc,
    }),
  ),
}));

import {
  getIntegrityStatusAction,
  verifyAuditIntegrityAction,
} from "../actions";

describe("audit integrity actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });
    mockGetClaims.mockResolvedValue({
      data: {
        claims: {
          app_metadata: {
            tenant_id: "tenant-1",
            role: "tenant_admin",
          },
        },
      },
    });
  });

  it("returns a non-crashing fallback when the integrity status RPC is not migrated yet", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        code: "PGRST202",
        message:
          "Could not find the function public.audit_integrity_status without parameters in the schema cache",
      },
    });

    const result = await getIntegrityStatusAction();

    expect(result.status?.status).toBe("not_checked");
    expect(result.error).toContain("Migration 0050");
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("returns an actionable verify error when the integrity verify RPC is not migrated yet", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        code: "42883",
        message: "function public.audit_verify_chain() does not exist",
      },
    });

    const result = await verifyAuditIntegrityAction();

    expect(result.status).toBeNull();
    expect(result.error).toContain("Migration 0050");
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
