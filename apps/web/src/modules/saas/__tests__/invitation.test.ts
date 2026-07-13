import { describe, expect, it } from "vitest";

import {
  generateInvitationToken,
  hashInvitationToken,
} from "@/modules/saas/invitation";

describe("invitation token hashing", () => {
  it("generates a base64url token and a matching \\x-hex bytea hash", () => {
    const { rawToken, tokenHashBytea } = generateInvitationToken();

    expect(rawToken).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(tokenHashBytea).toMatch(/^\\x[0-9a-f]{64}$/);
    expect(hashInvitationToken(rawToken)).toBe(tokenHashBytea);
  });

  it("produces different tokens and hashes on each call", () => {
    const first = generateInvitationToken();
    const second = generateInvitationToken();

    expect(first.rawToken).not.toBe(second.rawToken);
    expect(first.tokenHashBytea).not.toBe(second.tokenHashBytea);
  });

  it("matches the SHA-256 digest pgTAP produces via digest('invitation-token', 'sha256')", () => {
    const rawToken = Buffer.from("invitation-token", "utf8").toString("base64url");

    expect(hashInvitationToken(rawToken)).toBe(
      "\\xb52f5b0cd4dd05f04794b4fcffbc63c59d5782318409ba6efb9366d21ab4a6df",
    );
  });
});
