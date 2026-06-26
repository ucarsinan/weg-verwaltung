import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WEG-Verwaltung",
  description:
    "Verwaltungssoftware für Wohnungseigentümergemeinschaften — Portfolio-Projekt.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body suppressHydrationWarning>
        <a href="#main" className="skip-link">
          Zum Hauptinhalt springen
        </a>
        <div>{children}</div>
      </body>
    </html>
  );
}
