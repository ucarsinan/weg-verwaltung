import { redirect } from "next/navigation";
import type { Route } from "next";

// The settings landing route resolves to the first segment so the sidebar
// sub-navigation and bookmarks always point at a concrete sub-page.
export default function EinstellungenPage() {
  redirect("/einstellungen/konto" as Route);
}
