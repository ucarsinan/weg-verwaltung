import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Das echte `redirect()` von Next wirft, um die Ausführung abzubrechen. Ein
 * Mock, der nur zurückkehrt, liesse den Code weiterlaufen und einen Fehler an
 * ganz anderer Stelle erzeugen — deshalb wirft dieser auch.
 */
const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn((ziel: string) => {
    throw new Error(`NEXT_REDIRECT:${ziel}`);
  }),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/components/shell/app-shell", () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));

import DashboardLayout from "../layout";

/**
 * Baut einen Supabase-Client-Mock. `claims` wird so übergeben, wie
 * `getClaims()` sie liefert — also roh, mit `app_metadata`.
 */
function authClient(options?: {
  user?: { id: string; email: string } | null;
  claims?: unknown;
  claimsError?: Error | null;
}) {
  const {
    user = { id: "user-1", email: "admin@admin.com" },
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

/** Faengt das Weiterleitungs-Signal, damit der Test die Zusicherung erreicht. */
async function render(client: ReturnType<typeof authClient>) {
  mocks.createClient.mockResolvedValue(client);
  try {
    await DashboardLayout({ children: null });
  } catch (fehler) {
    if (!(fehler instanceof Error) || !fehler.message.startsWith("NEXT_REDIRECT:")) {
      throw fehler;
    }
  }
}

describe("DashboardLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("schickt Abgemeldete zur Anmeldung", async () => {
    await render(authClient({ user: null }));
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });

  it("lässt einen Nutzer mit Mandant durch", async () => {
    await render(authClient());
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("schickt einen Nutzer ohne Mandant ins Onboarding", async () => {
    // Genau die Sackgasse aus Befund 3: Bisher landete dieser Nutzer im
    // Dashboard und bekam beim ersten Klick "Kein Mandant im aktuellen
    // JWT-Claim." zu sehen.
    await render(authClient({ claims: { app_metadata: {} } }));
    expect(mocks.redirect).toHaveBeenCalledWith("/onboarding");
  });

  it("hält die Rolle eigentuemer vom Verwalter-Dashboard fern", async () => {
    // Die Rolle ist einladbar, hat aber keine eigene Ansicht — und die RLS der
    // Fachtabellen filtert nur nach Mandant. Ohne diesen Riegel sähe ein
    // eingeladener Eigentümer jede WEG des Mandanten und könnte sie ändern.
    await render(
      authClient({
        claims: { app_metadata: { tenant_id: "tenant-1", role: "eigentuemer" } },
      }),
    );

    expect(mocks.redirect).toHaveBeenCalledWith("/kein-zugang");
  });

  it("lässt einen Verwalter unverändert durch", async () => {
    await render(
      authClient({
        claims: {
          app_metadata: { tenant_id: "tenant-1", role: "verwalter_mitarbeiter" },
        },
      }),
    );

    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("sperrt NICHT aus, wenn die Rolle fehlt", async () => {
    // Der Grund für die Sperrliste. Eine Positivliste („nur diese Rollen
    // dürfen rein") würde bei nicht registriertem Access-Token-Hook jeden
    // aussperren — dieselbe Falle wie beim claimsError-Zweig darunter.
    await render(
      authClient({ claims: { app_metadata: { tenant_id: "tenant-1" } } }),
    );

    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("leitet NICHT um, wenn die Claims gar nicht geprüft werden konnten", async () => {
    // Der wichtigste Fall. Bei einer JWKS- oder Netzstörung liefert
    // getTenantClaims ebenfalls tenantId null. Wer darauf umleitet, wirft
    // gültige Nutzer ins Onboarding — und bei fehlendem Access-Token-Hook
    // träfe es jeden. Durchlassen und loggen ist die diagnostizierbare Wahl.
    const fehler = vi.spyOn(console, "error").mockImplementation(() => {});

    await render(authClient({ claimsError: new Error("JWKS unreachable") }));

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(fehler).toHaveBeenCalled();
    fehler.mockRestore();
  });
});
