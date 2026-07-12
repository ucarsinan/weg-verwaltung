import type {
  SubscriptionSnapshot,
  WritableSubscriptionResult,
} from "@/modules/saas/types";
import { writableSubscriptionResult } from "@/modules/saas/subscription";

export function requireWritableSubscription(
  subscription: SubscriptionSnapshot | null,
  now: Date = new Date(),
): WritableSubscriptionResult {
  return writableSubscriptionResult(subscription, now);
}

