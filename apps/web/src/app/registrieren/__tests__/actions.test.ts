import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

import { registerAction } from "@/app/registrieren/actions";

const VALID_EMAIL = "neue.verwalterin@example.com";
const VALID_PASSWORD = "SicheresPasswort123";

function formData(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

function client(signUp = vi.fn().mockResolvedValue({ error: null })) {
  const supabase = { auth: { signUp } };
  mocks.createClient.mockResolvedValue(supabase);
  return signUp;
}

describe("registerAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Diesen Zweig deckt der Browser-Test bewusst nicht ab: ein echter signUp
  // gegen Supabase Auth verschickt eine Bestätigungsmail und ist rate-limitiert
  // (siehe Kommentar in e2e/saas-onboarding.spec.ts).
  it("ruft signUp auf und meldet die Bestätigungs-E-Mail", async () => {
    const signUp = client();

    const result = await registerAction({}, formData({ email: VALID_EMAIL, password: VALID_PASSWORD }));

    expect(signUp).toHaveBeenCalledWith({
      email: VALID_EMAIL,
      password: VALID_PASSWORD,
      options: { emailRedirectTo: "https://app.example.com/auth/callback?next=/onboarding" },
    });
    expect(result.status).toBe("success");
    expect(result.message).toMatch(/Postfach/);
  });

  it("normalisiert die E-Mail-Adresse vor dem signUp", async () => {
    const signUp = client();

    await registerAction({}, formData({ email: "  Neue.Verwalterin@Example.COM  ", password: VALID_PASSWORD }));

    expect(signUp).toHaveBeenCalledWith(expect.objectContaining({ email: VALID_EMAIL }));
  });

  it("laesst emailRedirectTo weg, wenn keine App-URL konfiguriert ist", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    const signUp = client();

    await registerAction({}, formData({ email: VALID_EMAIL, password: VALID_PASSWORD }));

    expect(signUp).toHaveBeenCalledWith(
      expect.objectContaining({ options: { emailRedirectTo: undefined } }),
    );
  });

  // Die Meldung bleibt generisch — sie darf nicht verraten, ob die Adresse
  // bereits registriert ist (User-Enumeration).
  it("meldet einen Supabase-Fehler generisch und leakt keine Details", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const signUp = vi.fn().mockResolvedValue({
      error: { code: "email_address_invalid", status: 400, message: `Email address "${VALID_EMAIL}" is invalid` },
    });
    client(signUp);

    const result = await registerAction({}, formData({ email: VALID_EMAIL, password: VALID_PASSWORD }));

    expect(result.status).toBe("error");
    expect(result.message).toMatch(/konnte nicht abgeschlossen werden/);
    expect(result.message).not.toMatch(/invalid/i);
    expect(result.message).not.toContain(VALID_EMAIL);
  });

  it("weist ungueltige E-Mail und zu kurzes Passwort ab, ohne Supabase zu rufen", async () => {
    const signUp = client();

    const result = await registerAction({}, formData({ email: "keine-adresse", password: "zukurz" }));

    expect(signUp).not.toHaveBeenCalled();
    expect(result.status).toBe("error");
    expect(result.fieldErrors?.email).toMatch(/gültige E-Mail-Adresse/);
    expect(result.fieldErrors?.password).toMatch(/mindestens 12 Zeichen/);
  });
});
