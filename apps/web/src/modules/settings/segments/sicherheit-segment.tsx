import { LogOut } from "lucide-react";

import type { SettingsOverviewData } from "@/modules/settings/data";
import { logoutAction } from "@/modules/settings/actions";
import { MfaPanel } from "@/modules/settings/mfa-panel";
import { PasswordForm, PasswordResetForm } from "@/modules/settings/security-forms";
import {
  DetailRow,
  SettingsCard,
  formatDateTime,
} from "@/modules/settings/segments/shared";
import { Button } from "@/components/ui/button";

export function SicherheitSegment({ data }: { data: SettingsOverviewData }) {
  const { account } = data;

  return (
    <SettingsCard title="Sicherheit" description="Aktive Sitzung und Abmeldung.">
      <div className="space-y-5">
        <dl>
          <DetailRow
            label="Letzter Login"
            value={formatDateTime(account.lastSignInAt)}
          />
          <DetailRow label="Sitzung" value="Aktiv" />
        </dl>
        <PasswordForm />
        <PasswordResetForm />
        <MfaPanel />
      </div>
      <form action={logoutAction} className="mt-5">
        <Button type="submit" variant="destructive">
          <LogOut aria-hidden="true" />
          Sitzung beenden
        </Button>
      </form>
    </SettingsCard>
  );
}
