export const SELF_MANAGED_PLANS = ["start", "gemeinschaft"] as const;
export type SelfManagedPlan = (typeof SELF_MANAGED_PLANS)[number];

export const SUBSCRIPTION_STATUSES = [
  "trial",
  "active",
  "past_due",
  "cancelled",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export interface SubscriptionSnapshot {
  status: SubscriptionStatus;
  trialEndsAt: string | null;
}

export type WritableSubscriptionResult =
  | { ok: true }
  | { ok: false; message: string };

