# infra/supabase

**Status:** Placeholder.

Will contain:

- Migrations (`supabase migration new ...`)
- Row Level Security (RLS) policies — the **primary mechanism** for multi-tenant isolation. Every table carries `tenant_id`; the standard policy is `tenant_id = auth.jwt() ->> 'tenant_id'`.
- Database triggers enforcing security invariants:
  - `BeschlussSammlungEntry`: reject `UPDATE` and `DELETE` (append-only, §24 Abs. 7 WEG)
  - `AuditEvent`: reject `UPDATE` and `DELETE` (immutable audit trail)
  - `Vote`, `Resolution`, `Protocol.unterzeichnet`: reject inserts/updates where `actor_type = 'agent'` (AI must not write critical state)
- Seed data — **synthetic only**, no real WEGs, no real persons, ever.

See [`../../docs/01-system-design.md`](../../docs/01-system-design.md), section 4.6, for the full invariant list and the rationale behind each constraint.
