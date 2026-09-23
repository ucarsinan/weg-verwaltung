import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,

  // Standalone-Ausgabe: `next build` legt unter `.next/standalone` einen
  // eigenstaendigen Server samt der tatsaechlich benoetigten node_modules ab.
  // Damit laeuft die App in einem Container bei jedem Anbieter, statt an die
  // Eigenheiten eines einzelnen gebunden zu sein.
  //
  // Das ist keine Festlegung auf einen Hoster, sondern das Gegenteil davon:
  // Bedingung 3 aus docs/11-betriebsmodell.md § 11.3.3 ("ohne Probleme
  // wechseln koennen").
  output: "standalone",

  // Ohne diese Zeile verfolgt Next die Dateiabhaengigkeiten nur ab `apps/web`
  // und uebersieht die im pnpm-Workspace verlinkten Pakete. Der Container
  // startet dann mit fehlenden Modulen — und zwar erst zur Laufzeit, nicht
  // beim Bauen.
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),

  // 10 MB. Der Standardwert ist 1 MB und hat einen Sicherheitszweck — die
  // Next.js-Doku nennt "excessive server resources in parsing large amounts of
  // data" und "potential DDoS attacks". Von einem sicheren Standard weicht man
  // so weit ab wie noetig und nicht weiter: eingescannte Protokolle und
  // Rechnungen liegen praktisch immer unter 10 MB.
  //
  // Dieselbe Zahl steht in modules/dokumente/upload.ts und als
  // file_size_limit am Bucket weg-docs (Migration 0070).
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
