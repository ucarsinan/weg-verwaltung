# apps/web — Next.js 16 Frontend

**Status:** Placeholder. Implementation not started.

Planned content:

- Next.js 16 with App Router and Server Components
- Domain modules under `modules/` with hard interfaces (no cross-module imports):
  - `identity/` · `weg/` · `versammlung/` · `beschluss-sammlung/` · `dokumente/` · `audit/` · `agent-bridge/`
- Server Actions calling Supabase **with the user JWT** — RLS enforces tenant isolation on the database level
- Tailwind CSS + shadcn/ui for the UI layer (planned)

See [`../../docs/01-system-design.md`](../../docs/01-system-design.md), section 3, for the module structure.
