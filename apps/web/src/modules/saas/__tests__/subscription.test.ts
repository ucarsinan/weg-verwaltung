import { describe, expect, it } from "vitest";

import {
  isWriteAllowed,
  planForUnitCount,
  writableSubscriptionResult,
} from "@/modules/saas/subscription";

describe("self-managed subscription rules", () => {
  it("maps the supported unit ranges to plans", () => {
    expect(planForUnitCount(2)).toBeNull();
    expect(planForUnitCount(3)).toBe("start");
    expect(planForUnitCount(10)).toBe("start");
    expect(planForUnitCount(11)).toBe("gemeinschaft");
    expect(planForUnitCount(20)).toBe("gemeinschaft");
    expect(planForUnitCount(21)).toBeNull();
  });

  it("allows an active subscription and a non-expired trial to write", () => {
    const now = new Date("2026-07-11T12:00:00.000Z");

    expect(isWriteAllowed({ status: "active", trialEndsAt: null }, now)).toBe(true);
    expect(
      isWriteAllowed({ status: "trial", trialEndsAt: "2026-07-12T12:00:00.000Z" }, now),
    ).toBe(true);
  });

  it("blocks an expired trial and every inactive status", () => {
    const now = new Date("2026-07-11T12:00:00.000Z");

    expect(
      isWriteAllowed({ status: "trial", trialEndsAt: "2026-07-11T12:00:00.000Z" }, now),
    ).toBe(false);
    expect(isWriteAllowed({ status: "past_due", trialEndsAt: null }, now)).toBe(false);
    expect(writableSubscriptionResult(null, now)).toEqual({
      ok: false,
      message:
        "Ihre Testphase ist abgelaufen oder das Abo ist nicht aktiv. Sie können die WEG weiter einsehen, aber derzeit nichts ändern.",
    });
  });
});

