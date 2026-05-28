// Next.js not-found.tsx — rendered when the server component calls notFound().
//
// Subtle wording: because the SELECT is RLS-scoped to the user's tenant, a
// row that exists in another tenant is indistinguishable from a row that
// truly does not exist. The message reflects that explicitly — leaking
// "exists but not yours" vs "does not exist" would be a cross-tenant
// information disclosure (see § 3 isolation model, § 5.1 sichere Defaults).

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function WegNotFound() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <Card>
        <CardHeader>
          <CardTitle>WEG nicht gefunden</CardTitle>
          <CardDescription>
            Diese WEG existiert nicht oder gehört nicht zu Ihrem Mandanten.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/wegs">Zurück zur WEG-Liste</Link>
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}
