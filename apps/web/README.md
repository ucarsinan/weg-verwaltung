# apps/web — Next.js 16 Frontend

WEG-Verwaltung Web-App. Server Components default, `@supabase/ssr` für Auth,
Tailwind v4 für Styling.

## Was hier liegt

- App Router (`src/app/`) — Landing, Login, OAuth-Callback, geschütztes
  `(dashboard)`-Routen-Group.
- `src/middleware.ts` + `src/lib/supabase/middleware.ts` — refresht die
  Supabase-Session bei jedem Request und redirected unauth Zugriffe auf
  `/login?next=<path>`.
- `src/lib/supabase/{client,server}.ts` — Browser- und Server-Client-Factories.
- `src/lib/agent/fetch.ts` — Server-seitiger Fetch zu `apps/agent` mit
  `Authorization: Bearer <jwt>` aus der aktuellen Supabase-Session
  (JWT-Pass-Through, siehe `docs/02-architecture-deployment.md` §2.4).

## Lokal starten

```bash
# einmalig im Repo-Root:
pnpm install

# danach im Repo-Root (startet web parallel mit agent + supabase):
just dev

# oder isoliert nur web:
pnpm --filter @weg-verwaltung/web dev
```

App läuft auf `http://localhost:3000`.

## Env

Schema in `./../../.env.example` (Repo-Root). Lokal: `cp .env.example apps/web/.env.local`
und Werte eintragen. Die App liest `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_AGENT_URL`. Service-Role-Key
gehört **nicht** in diesen Workspace — RLS macht den User-JWT zur einzigen
Trust-Quelle.

## Was noch nicht hier ist

- Design-System / Komponenten-Bibliothek (shadcn/ui kommt mit Section 5
  Umsetzung).
- Domain-Module unter `src/modules/` (`identity/`, `weg/`, `versammlung/`, …).
- MFA-Flow (TOTP-Enrolment + Verification — `tenant_admin` und
  `verwalter_mitarbeiter` pflicht, siehe `docs/03` §3.3).
- Streaming / Agent-Bridge-UI (Section 5.3 / 5.4).
- E2E-Tests (`@axe-core/playwright` als a11y-Gate).
