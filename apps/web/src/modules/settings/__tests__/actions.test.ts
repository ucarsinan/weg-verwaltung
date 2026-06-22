import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

import { updateTenantNameAction } from "@/modules/settings/admin-actions";
import { inviteTenantUserAction } from "@/modules/settings/admin/actions";
import { updateProfilePersonAction } from "@/modules/settings/profile-actions";
import { updatePasswordAction } from "@/modules/settings/security-actions";

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
  claimsError?: unknown;
  from?: ReturnType<typeof vi.fn>;
}) {
  const {
    user = { id: "user-1", email: "user@example.test" },
    tenantId = "tenant-1",
    role = "tenant_admin",
    claimsError = null,
    from = vi.fn(),
  } = options ?? {};

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
      getClaims: vi.fn().mockResolvedValue({
        data: {
          claims: {
            app_metadata: {
              tenant_id: tenantId,
              role,
            },
          },
        },
        error: claimsError,
      }),
      updateUser: vi.fn().mockResolvedValue({ error: null }),
    },
    from,
  };
}

describe("settings server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirect.mockImplementation(() => {
      throw new Error("redirect called");
    });
    mocks.createAdminClient.mockReturnValue(null);
  });

  it("returns profile validation errors without querying person rows", async () => {
    const from = vi.fn();
    mocks.createClient.mockResolvedValue(authClient({ from }));

    const result = await updateProfilePersonAction(
      {},
      formData({
        vorname: "",
        nachname: "",
        email: "not-an-email",
        telefon: "1".repeat(51),
        anschrift: "x".repeat(501),
      }),
    );

    expect(result).toEqual({
      errors: {
        vorname: ["Bitte geben Sie einen Vornamen an."],
        nachname: ["Bitte geben Sie einen Nachnamen an."],
        email: ["Bitte geben Sie eine gültige E-Mail-Adresse an."],
        telefon: ["Die Telefonnummer darf höchstens 50 Zeichen lang sein."],
        anschrift: ["Die Anschrift darf höchstens 500 Zeichen lang sein."],
      },
    });
    expect(from).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("returns password length and mismatch validation errors before Supabase access", async () => {
    const result = await updatePasswordAction(
      {},
      formData({
        password: "short",
        confirm_password: "different",
      }),
    );

    expect(result).toEqual({
      errors: {
        password: ["Das Passwort muss mindestens 12 Zeichen lang sein."],
        confirm_password: ["Die Passwort-Wiederholung stimmt nicht überein."],
      },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("validates tenant names before checking admin permissions", async () => {
    const emptyResult = await updateTenantNameAction(
      {},
      formData({ name: "   " }),
    );
    const tooLongResult = await updateTenantNameAction(
      {},
      formData({ name: "x".repeat(121) }),
    );

    expect(emptyResult).toEqual({
      errors: { name: ["Bitte einen Namen eingeben."] },
    });
    expect(tooLongResult).toEqual({
      errors: { name: ["Name ist zu lang."] },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("rejects tenant name updates for non-admin users", async () => {
    mocks.createClient.mockResolvedValue(
      authClient({ role: "verwalter_mitarbeiter" }),
    );

    const result = await updateTenantNameAction(
      {},
      formData({ name: "Neue Verwaltung" }),
    );

    expect(result).toEqual({ errors: { _form: ["Keine Berechtigung."] } });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("returns an admin configuration error when tenant admin actions are disabled", async () => {
    mocks.createClient.mockResolvedValue(authClient());
    mocks.createAdminClient.mockReturnValue(null);

    const result = await inviteTenantUserAction(
      {},
      formData({
        email: "neu@example.test",
        role: "beirat",
      }),
    );

    expect(result).toEqual({
      status: "error",
      message:
        "Benutzerverwaltung ist serverseitig deaktiviert: SUPABASE_SERVICE_ROLE_KEY oder SUPABASE_SECRET_KEY fehlt.",
    });
    expect(mocks.createAdminClient).toHaveBeenCalledOnce();
  });
});
