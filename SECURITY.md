# Security Policy

## Status

This repository is in design-first phase — no deployed code, no users, no live data. The project nonetheless treats security as a first-class concern. This document explains the design-level posture and how to report security-relevant findings.

## Reporting a Vulnerability

If you find a security-relevant concern in the **design itself** (architecture, threat model, data flow, AI agent guardrails, RLS policies once they exist), please:

- Open a GitHub issue with the label `security`, **or**
- Contact the maintainer via the GitHub profile linked in [README.md](./README.md).

Please do not open public issues for findings that affect deployed instances (there are none yet) until a private channel exists.

## Design-Level Security Principles

The following principles are enforced at the **database level**, not in application code. Application bugs cannot bypass them.

1. **Multi-tenant isolation via Postgres Row Level Security (RLS).** Every table carries `tenant_id`; RLS policy requires `tenant_id = auth.jwt() ->> 'tenant_id'`. No code path — including the AI agent service — can read or write across tenants.
2. **AI agent has no service-role credentials.** Every database touch from the agent service uses the same user JWT that initiated the request. RLS continues to enforce isolation through the agent.
3. **AI agent cannot write to critical entities.** Database triggers reject inserts and updates with `actor_type = 'agent'` on `Vote`, `Resolution`, `Protocol.unterzeichnet`, and `BeschlussSammlungEntry`. The agent can only create `AgentSuggestion` records; a human user must adopt them explicitly.
4. **Append-only decision register** (`BeschlussSammlungEntry`, §24 Abs. 7 WEG). Triggers reject `UPDATE` and `DELETE`. Disputed resolutions are tracked as separate immutable follow-up events.
5. **Append-only audit log** (`AuditEvent`). Even tenant administrators cannot delete entries — the audit table's RLS policy permits `INSERT` only.
6. **External integrations are adapter slots.** eIDAS identity verification, SEPA payment, video streaming — all are explicit interface boundaries with no production integration in this portfolio piece.

See [docs/01-system-design.md](./docs/01-system-design.md), section 4.6, for the full invariant list.

## Data Handling

- **No real personal data** in this repository — ever. Test fixtures, when added, are synthetic.
- `.env.example` lists variable names only; no values, no secrets.
- Production credentials are never committed.
