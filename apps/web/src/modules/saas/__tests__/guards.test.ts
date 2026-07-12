import { describe, expect, it } from "vitest";

import { requireWritableSubscription } from "@/modules/saas/guards";

describe("requireWritableSubscription", () => {
  it("preserves the read-only response for an inactive subscription", () => {
    expect(
      requireWritableSubscription(
        { status: "cancelled", trialEndsAt: null },
        new Date("2026-07-11T12:00:00.000Z"),
      ),
    ).toMatchObject({ ok: false });
  });
});
