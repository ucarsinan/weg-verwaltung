import { describe, expect, it } from "vitest";

import { renderInvitationEmail } from "@/modules/saas/invitation-email";

describe("renderInvitationEmail", () => {
  it("includes the invitation link, role label, and validity window", () => {
    const { subject, html } = renderInvitationEmail({
      invitationUrl: "https://example.test/einladung/abc123",
      role: "eigentuemer",
    });

    expect(subject).toBe("Ihre Einladung zur WEG-Verwaltung");
    expect(html).toContain("https://example.test/einladung/abc123");
    expect(html).toContain("Eigentümer");
    expect(html).toContain("7 Tage");
  });

  it("renders the tenant name when provided", () => {
    const { html } = renderInvitationEmail({
      invitationUrl: "https://example.test/einladung/abc",
      role: "tenant_admin",
      tenantName: "Hausgemeinschaft Muster",
    });
    expect(html).toContain("Hausgemeinschaft Muster");
    expect(html).toContain("Mandanten-Admin");
  });

  it("HTML-escapes a tenant name to prevent markup injection", () => {
    const { html } = renderInvitationEmail({
      invitationUrl: "https://example.test/einladung/abc",
      role: "eigentuemer",
      tenantName: '<script>alert("x")</script>',
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
