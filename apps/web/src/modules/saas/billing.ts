import type { SelfManagedPlan } from "@/modules/saas/types";

export type CheckoutResult =
  | { status: "ready"; checkoutUrl: string }
  | { status: "disabled"; message: string };

export interface BillingProvider {
  createCheckout(input: {
    tenantId: string;
    plan: SelfManagedPlan;
    returnUrl: string;
  }): Promise<CheckoutResult>;
}

export const disabledBillingProvider: BillingProvider = {
  async createCheckout() {
    return {
      status: "disabled",
      message:
        "Die Zahlungsaktivierung ist noch nicht verfügbar. Ihre WEG bleibt bis zur Freischaltung im lesbaren Modus.",
    };
  },
};

