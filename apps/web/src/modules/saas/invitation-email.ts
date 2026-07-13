import {
  TENANT_MEMBER_ROLE_LABELS,
  type TenantInvitationRole,
} from "@/modules/settings/admin/types";

export interface InvitationEmailInput {
  invitationUrl: string;
  role: TenantInvitationRole;
  tenantName?: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderInvitationEmail(input: InvitationEmailInput): RenderedEmail {
  const roleLabel = TENANT_MEMBER_ROLE_LABELS[input.role];
  const url = escapeHtml(input.invitationUrl);
  const where = input.tenantName
    ? `der WEG „${escapeHtml(input.tenantName)}“`
    : "einer WEG";

  const subject = "Ihre Einladung zur WEG-Verwaltung";

  const html = `<!doctype html>
<html lang="de">
  <body style="margin:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;padding:32px;">
            <tr><td style="font-size:14px;color:#71717a;">Einladung zur WEG-Verwaltung</td></tr>
            <tr><td style="font-size:22px;font-weight:600;color:#18181b;padding-top:8px;">Sie wurden eingeladen.</td></tr>
            <tr><td style="font-size:15px;line-height:1.6;color:#3f3f46;padding-top:16px;">
              Sie wurden als <strong>${escapeHtml(roleLabel)}</strong> zu ${where} eingeladen.
              Erstellen Sie Ihr Konto oder melden Sie sich an, um die Einladung anzunehmen.
              Der Link ist <strong>7 Tage</strong> gültig.
            </td></tr>
            <tr><td style="padding-top:24px;">
              <a href="${url}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 24px;border-radius:8px;">Einladung annehmen</a>
            </td></tr>
            <tr><td style="font-size:13px;color:#71717a;padding-top:24px;">
              Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:<br>
              <a href="${url}" style="color:#2563eb;word-break:break-all;">${url}</a>
            </td></tr>
            <tr><td style="font-size:12px;color:#a1a1aa;padding-top:24px;border-top:1px solid #e4e4e7;margin-top:24px;">
              Wenn Sie diese Einladung nicht erwartet haben, können Sie diese E-Mail ignorieren.
            </td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html };
}
