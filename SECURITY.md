# Security Policy

## Status

This repository contains runnable local code for a Next.js 16 web app, a FastAPI/LangGraph agent service, and Supabase migrations. The database target is a remote-only Supabase Frankfurt project; the current cloud migration state was not re-verified in this audit. Do not put real personal data into local fixtures, tests, generated seed data, or documentation.

## Reporting a Vulnerability

If you find a security-relevant concern in the architecture, data flow, AI agent guardrails, RLS policies, migrations, application code, or test fixtures, please:

- Open a GitHub issue with the label `security`, **or**
- Contact the maintainer via the GitHub profile linked in [README.md](./README.md).

Do not include secrets, live tenant data, JWTs, or Supabase project credentials in public issues.

## Security Principles

The following principles are intended to be enforced primarily at the **database level**, not only in application code. Cloud state must be checked directly before making production claims.

1. **Multi-tenant isolation via Postgres Row Level Security (RLS).** Tenant-scoped tables carry `tenant_id`; policies use the tenant from the authenticated JWT via project helpers such as `public.tenant_id()`.
2. **AI agent has no service-role credentials.** Every database touch from the agent service uses the same user JWT that initiated the request. RLS continues to enforce isolation through the agent.
3. **AI agent cannot write to critical entities.** Database triggers reject critical `actor_type = 'agent'` writes such as votes, resolutions, signed protocols, and Beschluss-Sammlung entries. The agent is treated as suggestion-only.
4. **Append-only decision register** (`BeschlussSammlungEntry`, §24 Abs. 7 WEG). Triggers reject `UPDATE` and `DELETE`. Disputed resolutions are tracked as separate immutable follow-up events.
5. **Append-only audit log** (`AuditEvent`). Even tenant administrators cannot delete entries — the audit table's RLS policy permits `INSERT` only.
6. **External integrations are adapter slots.** eIDAS identity verification, SEPA payment, video streaming — all are explicit interface boundaries with no production integration in this portfolio piece.

See [docs/01-system-design.md](./docs/01-system-design.md), section 4.6, for the invariant list.

## Data Handling

- **No real personal data** in this repository — ever. Test fixtures and generated fake data must be synthetic.
- `.env.example` lists variable names only; no values, no secrets.
- Production credentials are never committed.
- Generated auth state, Playwright output, coverage, caches, logs, and local Supabase temp files are not product artifacts.

## Agent Safety Rules

- Agenten duerfen keine produktiven Daten, JWTs, Service-Role-Keys, Supabase-Credentials oder echte personenbezogene Daten ausgeben.
- Agenten duerfen keine Remote-Supabase-Kommandos ausfuehren, solange der Nutzer das nicht ausdruecklich freigibt.
- `just db-migrate`, `supabase db push`, `just seed-admin` und Cloud-E2E gegen das Frankfurt-Projekt sind freigabepflichtig.
- Aenderungen an RLS, Audit, HMAC, Append-only-Triggern, Agent-Write-Guards und Migrationen brauchen explizite Risiko- und Testdokumentation.
- Testdaten muessen synthetisch bleiben und duerfen keine echten Namen, Adressen, E-Mail-Adressen, Wohnungsdaten oder Zahlungsdaten enthalten.
