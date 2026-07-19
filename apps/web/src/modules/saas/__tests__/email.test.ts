import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: vi.fn(() => ({ emails: { send: mocks.send } })),
}));

import {
  disabledEmailProvider,
  getEmailProvider,
  resendEmailProvider,
} from "@/modules/saas/email";

describe("resendEmailProvider", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends via resend.emails.send and maps data to a sent result", async () => {
    mocks.send.mockResolvedValue({ data: { id: "email-123" }, error: null });
    const provider = resendEmailProvider("re_test", "WEG <from@example.test>");

    const result = await provider.send(
      { to: "to@example.test", subject: "Hallo", html: "<p>Hi</p>" },
      { idempotencyKey: "einladung/abc" },
    );

    expect(result).toEqual({ status: "sent", id: "email-123" });
    expect(mocks.send).toHaveBeenCalledWith(
      {
        from: "WEG <from@example.test>",
        to: ["to@example.test"],
        subject: "Hallo",
        html: "<p>Hi</p>",
      },
      { idempotencyKey: "einladung/abc" },
    );
  });

  it("maps an API error to a generic error result", async () => {
    mocks.send.mockResolvedValue({ data: null, error: { message: "rate limited" } });
    const provider = resendEmailProvider("re_test", "from@example.test");

    const result = await provider.send({ to: "x@example.test", subject: "s", html: "h" });

    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.message).not.toMatch(/rate limited/);
  });

  it("maps a network failure (thrown) to an error result", async () => {
    mocks.send.mockRejectedValue(new Error("ECONNREFUSED"));
    const provider = resendEmailProvider("re_test", "from@example.test");

    const result = await provider.send({ to: "x@example.test", subject: "s", html: "h" });

    expect(result.status).toBe("error");
  });

  // Mit dem resend.dev-Sandbox-Absender bedeutet ein Fehlschlag "kein
  // verifizierter Absender eingerichtet", nicht "der Mailversand ist kaputt".
  // Der Aufrufer soll das dem Nutzer nicht als Stoerung melden.
  it("maps a failure with the resend.dev sandbox sender to disabled, not error", async () => {
    mocks.send.mockResolvedValue({
      data: null,
      error: { name: "validation_error", message: "You can only send testing emails to..." },
    });
    const provider = resendEmailProvider("re_test", "WEG-Verwaltung <onboarding@resend.dev>");

    const result = await provider.send({ to: "fremd@example.test", subject: "s", html: "h" });

    expect(result).toEqual({ status: "disabled" });
  });

  it("still reports a real send with the sandbox sender as sent", async () => {
    mocks.send.mockResolvedValue({ data: { id: "email-9" }, error: null });
    const provider = resendEmailProvider("re_test", "WEG-Verwaltung <onboarding@resend.dev>");

    const result = await provider.send({ to: "eigene@example.test", subject: "s", html: "h" });

    expect(result).toEqual({ status: "sent", id: "email-9" });
  });
});

describe("disabledEmailProvider", () => {
  it("returns a disabled result without sending", async () => {
    const result = await disabledEmailProvider.send({
      to: "x@example.test",
      subject: "s",
      html: "h",
    });
    expect(result).toEqual({ status: "disabled" });
  });
});

describe("getEmailProvider", () => {
  const original = process.env.RESEND_API_KEY;
  afterEach(() => {
    if (original === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = original;
  });

  it("returns the disabled provider when RESEND_API_KEY is unset", async () => {
    delete process.env.RESEND_API_KEY;
    const result = await getEmailProvider().send({
      to: "x@example.test",
      subject: "s",
      html: "h",
    });
    expect(result).toEqual({ status: "disabled" });
  });

  it("returns a live provider when RESEND_API_KEY is set", async () => {
    process.env.RESEND_API_KEY = "re_live";
    mocks.send.mockResolvedValue({ data: { id: "e1" }, error: null });
    const result = await getEmailProvider().send({
      to: "x@example.test",
      subject: "s",
      html: "h",
    });
    expect(result).toEqual({ status: "sent", id: "e1" });
  });
});
