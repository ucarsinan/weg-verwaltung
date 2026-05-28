import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Defence-in-depth: middleware already gates this route group, but a missing
// session here still redirects. Cheap, removes a class of "what if matcher
// regex changes" footguns.
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return <div className="min-h-screen">{children}</div>;
}
