# WEG-Verwaltung — Web-App als Container.
#
# Warum es diese Datei gibt:
#   Nicht, um auf einen Anbieter zu wechseln, sondern um es jederzeit zu
#   koennen. Ein Container laeuft bei Scaleway, Clever Cloud, Elestio, Hetzner
#   oder einem Anbieter, den es heute noch nicht gibt. Ohne ihn waere die App an
#   die Eigenheiten eines einzelnen Hosters gebunden.
#   Bedingung 3 aus docs/11-betriebsmodell.md § 11.3.3.
#
# Baukontext ist das REPOSITORY-WURZELVERZEICHNIS, nicht apps/web — die App
# haengt ueber den pnpm-Workspace an @weg-verwaltung/shared-types:
#
#   docker build -f apps/web/Dockerfile \
#     --build-arg NEXT_PUBLIC_SUPABASE_URL=... \
#     --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
#     --build-arg NEXT_PUBLIC_APP_URL=... \
#     -t weg-verwaltung-web .
#
# Zur Trennung der Variablen:
#   NEXT_PUBLIC_* werden beim Bauen in das JavaScript eingebacken und muessen
#   deshalb als --build-arg kommen. Sie sind oeffentlich sichtbar — der
#   anon-Key ist dafuer gemacht, die Absicherung leistet RLS.
#   Alles andere (SUPABASE_SECRET_KEY, RESEND_API_KEY, …) ist ein echtes
#   Geheimnis, wird NICHT eingebacken und erst zur Laufzeit gesetzt.

# ---------------------------------------------------------------- Grundlage
# Node 22 entspricht der lokalen Entwicklungsumgebung. package.json verlangt
# >=20; die CI baut mit 20. Beide Versionen sind zulaessig.
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# ------------------------------------------------------------ Abhaengigkeiten
# Eigene Stufe, damit Docker sie nur neu aufloest, wenn sich die Manifeste
# aendern — nicht bei jeder Codeaenderung.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/shared-types/package.json packages/shared-types/
RUN pnpm install --frozen-lockfile

# -------------------------------------------------------------------- Bauen
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY . .

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_AGENT_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_AGENT_URL=$NEXT_PUBLIC_AGENT_URL \
    NEXT_TELEMETRY_DISABLED=1

RUN pnpm --filter @weg-verwaltung/web build

# ------------------------------------------------------------------ Laufzeit
FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Nicht als root laufen. Die App braucht keine Schreibrechte im Abbild.
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Die Standalone-Ausgabe enthaelt den Server samt der wirklich benoetigten
# node_modules. `static` legt Next NICHT mit hinein und wird deshalb separat
# kopiert.
#
# Ein `public/`-Verzeichnis gibt es in diesem Projekt nicht (gemessen am
# 2026-09-22). Deshalb steht hier keine COPY-Zeile dafuer — eine COPY auf einen
# nicht existierenden Pfad laesst den Build scheitern. Kommt spaeter eines dazu,
# muss hier eine Zeile ergaenzt werden, sonst fehlen die Dateien still.
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs
EXPOSE 3000

# Pfad folgt der Workspace-Struktur, weil outputFileTracingRoot auf die
# Repository-Wurzel zeigt (siehe next.config.ts).
CMD ["node", "apps/web/server.js"]
