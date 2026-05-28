import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WEG-Verwaltung",
  description:
    "Verwaltungssoftware für Wohnungseigentümergemeinschaften — Portfolio-Projekt.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body>
        <a href="#main" className="skip-link">
          Zum Hauptinhalt springen
        </a>
        <main id="main">{children}</main>
      </body>
    </html>
  );
}
