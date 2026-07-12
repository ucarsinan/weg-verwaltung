import type {
  SelfManagedPlan,
  SubscriptionSnapshot,
  WritableSubscriptionResult,
} from "@/modules/saas/types";

export function planForUnitCount(unitCount: number): SelfManagedPlan | null {
  if (!Number.isInteger(unitCount)) return null;
  if (unitCount >= 3 && unitCount <= 10) return "start";
  if (unitCount >= 11 && unitCount <= 20) return "gemeinschaft";
  return null;
}

export function isWriteAllowed(
  subscription: SubscriptionSnapshot,
  now: Date = new Date(),
): boolean {
  if (subscription.status === "active") return true;
  if (subscription.status !== "trial" || !subscription.trialEndsAt) return false;

  const trialEndsAt = new Date(subscription.trialEndsAt);
  return !Number.isNaN(trialEndsAt.getTime()) && trialEndsAt.getTime() > now.getTime();
}

export function writableSubscriptionResult(
  subscription: SubscriptionSnapshot | null,
  now: Date = new Date(),
): WritableSubscriptionResult {
  if (subscription && isWriteAllowed(subscription, now)) return { ok: true };

  return {
    ok: false,
    message:
      "Ihre Testphase ist abgelaufen oder das Abo ist nicht aktiv. Sie können die WEG weiter einsehen, aber derzeit nichts ändern.",
  };
}

