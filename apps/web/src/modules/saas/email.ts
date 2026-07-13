import "server-only";

import { Resend } from "resend";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

export interface SendOptions {
  idempotencyKey?: string;
}

export type SendResult =
  | { status: "sent"; id: string }
  | { status: "disabled" }
  | { status: "error"; message: string };

export interface EmailProvider {
  send(message: EmailMessage, options?: SendOptions): Promise<SendResult>;
}

/**
 * No-op provider used when RESEND_API_KEY is not configured. Mirrors
 * disabledBillingProvider: the feature degrades gracefully instead of failing.
 */
export const disabledEmailProvider: EmailProvider = {
  async send() {
    return { status: "disabled" };
  },
};

export function resendEmailProvider(apiKey: string, from: string): EmailProvider {
  const resend = new Resend(apiKey);

  return {
    async send(message, options) {
      try {
        const { data, error } = await resend.emails.send(
          {
            from,
            to: [message.to],
            subject: message.subject,
            html: message.html,
          },
          options?.idempotencyKey
            ? { idempotencyKey: options.idempotencyKey }
            : undefined,
        );

        if (error || !data) {
          console.error("[email] resend send failed:", error);
          return {
            status: "error",
            message: "Der E-Mail-Versand ist fehlgeschlagen.",
          };
        }

        return { status: "sent", id: data.id };
      } catch (cause) {
        // Network-level failure only — the SDK returns { data, error } for API errors.
        console.error("[email] resend network failure:", cause);
        return {
          status: "error",
          message: "Der E-Mail-Dienst ist derzeit nicht erreichbar.",
        };
      }
    },
  };
}

const DEV_FALLBACK_FROM = "WEG-Verwaltung <onboarding@resend.dev>";

/**
 * Resolves the active email provider from the environment. Returns the Resend
 * provider when RESEND_API_KEY is set, otherwise the disabled no-op provider.
 * EMAIL_FROM must be a verified-domain sender in production; the resend.dev
 * onboarding sender is only valid for testing.
 */
export function getEmailProvider(): EmailProvider {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return disabledEmailProvider;

  const from = process.env.EMAIL_FROM?.trim() || DEV_FALLBACK_FROM;
  return resendEmailProvider(apiKey, from);
}
