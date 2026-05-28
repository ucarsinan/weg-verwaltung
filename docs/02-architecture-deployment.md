# Section 2 — Architektur & Deployment

> **Status:** Section 2 von 6 fertig. Sections 3–6 folgen als sichtbare Commits.
> Diese Section legt die Service-Topologie, das Repo-Layout, die Deployment-Targets und den Identitäts-Fluss fest. Detail-Security folgt in Section 3, KI-Architektur in Section 4.

---

## 2.1 Service-Topologie

Drei Komponenten, zwei Code-Deployments, ein verwalteter Backend-Stack:

```text
                            ┌──────────────────────┐
                            │  Browser (Verwalter, │
                            │   Beirat, Eigentümer)│
                            └──────────┬───────────┘
                                       │ HTTPS + Supabase-Auth-Cookie
                                       ▼
                ┌──────────────────────────────────────────┐
                │  apps/web   ·  Next.js 16 (Vercel, EU)   │
                │  Server Components / Server Actions      │
                └─────┬───────────────────────────┬────────┘
                      │                           │
       User-JWT ──────┘    User-JWT ──────────────┘
       (direkter DB-Pfad)  (Bearer-Token an Agent)
                      │                           │
                      ▼                           ▼
       ┌──────────────────────────┐    ┌────────────────────────────┐
       │  Supabase Frankfurt      │◄───┤  apps/agent · FastAPI      │
       │  Postgres + Auth +       │    │  + LangGraph (Fly.io fra)  │
       │  Storage + RLS           │    │  PostgresSaver-Checkpoints │
       └──────────────────────────┘    └────────────┬───────────────┘
                                                    │
                                                    ▼
                                       ┌────────────────────────┐
                                       │  Langfuse (EU, Berlin) │
                                       │  + LLM-Provider(s)     │
                                       └────────────────────────┘
```

**Warum drei Komponenten, nicht eine:**

- **Domain-CRUD** ist synchron, transaktional, RLS-getrieben — gehört direkt an Postgres. Kein Vorteil durch eine API-Schicht dazwischen.
- **Agent-Runs** sind langlaufend (5–30 s), zustandsbehaftet (LangGraph-Checkpoints), brauchen Streaming und outbound Calls zu LLM-Providern. Sie würden Vercels Edge/Function-Modell sprengen.
- **Trennung der Compromise-Profile** — wenn der Agent kompromittiert wird (Prompt-Injection, exfil-Tool-Call), muss er trotzdem an der RLS scheitern. Architektur erzwingt das, nicht nur Code-Review.

**Warum nicht fünf Services** (Auth, Storage, API, Agent, Web getrennt): Supabase liefert Auth + Storage + DB als eine Plattform. Diese drei künstlich aufzuspalten würde Trust-Boundaries verschieben ohne Gewinn — und die Mandanten-Iso wäre schwerer zu beweisen.

---

## 2.2 Repo-Layout — Monorepo-Form ohne Monorepo-Tool

**Entscheidung:** pnpm-workspaces für die JS-Seite, `uv` für die Python-Seite, ein `justfile` an der Wurzel orchestriert. Kein Turborepo, kein Nx.

**Warum:**

- Turborepo bringt seine Stärke (Task-Graph-Caching, `turbo prune`) auf der JS-Seite. Bei *einer* Next.js-App und einem Python-Sibling überwiegt die Konfigurations-Last den Nutzen — Recruiter lesen es als Cargo-Cult.
- Nx mit `@nxlv/python` ist genuin polyglot, aber `project.json` + Generators + Executors sind solo Overkill und der Python-Plugin hängt der `uv`-Welle hinterher.
- pnpm-Workspaces sind 2026 die De-facto-Baseline für JS-Monorepos (`workspace:`-Protokoll, strenge Peer-Deps, disk-effizient). Python lebt sauber daneben.
- `just` über `make`: moderne Syntax, keine Tab-Fallen, Shebang-Recipes pro Sprache — passt zu polyglot.

**Tree** (Endzustand):

```text
weg-verwaltung/
├── package.json          # workspace-anchor, "private": true, packageManager: pnpm@9
├── pnpm-workspace.yaml   # ["apps/web", "packages/*"]
├── justfile              # dev | build | test | lint | typecheck | codegen | db-migrate
├── .env.example          # canonical schema (keine Werte)
├── docs/
│   ├── 01-system-design.md
│   ├── 02-architecture-deployment.md  (hier)
│   └── _archive/
├── apps/
│   ├── web/              # Next.js 16, eigenes package.json
│   └── agent/            # FastAPI + LangGraph, eigenes pyproject.toml (uv)
├── packages/
│   └── shared-types/     # OpenAPI-generierte TS-Typen, eigenes package.json
└── infra/
    └── supabase/         # migrations/, seed/, RLS-Policies, fly.toml-equivalent
```

**Shared-Types — OpenAPI als Source-of-Truth:**

- FastAPI emittiert OpenAPI kostenlos (Pydantic-Modelle → Schema).
- `just codegen` ruft [`@hey-api/openapi-ts`](https://github.com/hey-api/openapi-ts) auf und schreibt TS-Typen nach `packages/shared-types/`.
- `apps/web` importiert daraus, `apps/agent` arbeitet nativ mit Pydantic — keine zweite Quelle.
- Domain-Enums und gebrandete IDs, die nicht über die HTTP-Schicht laufen, leben handgepflegt in `shared-types/` und werden in Python bewusst gespiegelt (solo: Disziplin > Codegen-Layer für drei Konstanten).

---

## 2.3 Deployment-Topologie

| Service | Provider | Region | EU-Story | Größenordnung Kosten (idle) |
| --- | --- | --- | --- | --- |
| `apps/web` | **Vercel** | EU (Frankfurt-Edge, Functions in `fra1`) | Vercel Inc. (US), EU-Region ja | $0 Hobby / $20 Pro |
| `apps/agent` | **Fly.io** | `fra` (Frankfurt) | Fly.io Inc. (US), Firecracker-microVMs in EU | $2–5/mo dank Scale-to-Zero |
| Postgres + Auth + Storage | **Supabase** | Frankfurt (eu-central-1) | Supabase Inc. (US), EU-Region | $0 Free / $25 Pro |
| LLM-Observability | **Langfuse** | `cloud.langfuse.com` (EU) | Langfuse GmbH (Berlin) | $0 Hobby |
| Mail | **Resend** | EU-Region (`eu-west`) | Resend Inc. (US), EU-Region | $0 Free |

**Latenz-Begründung:** Der Agent macht viele kleine Calls an Supabase. Same-Region (`fra` ↔ `eu-central-1`) bringt das Roundtrip auf einstellige ms. Vercel-Functions in `fra1` ebenfalls. Eine US-Region irgendwo in der Kette würde 80–120 ms pro Hop kosten und das Agent-Streaming spürbar zähflüssig machen.

### CLOUD-Act-Caveat (ehrlich)

Vercel, Fly.io und Supabase sind US-inkorporiert. Die EU-Region gibt **Daten-Residency** (Bytes liegen in Frankfurt), aber keine **Daten-Sovereignty** — der US CLOUD Act kann theoretisch Herausgabe verlangen, unabhängig vom physischen Ort. Für ein Portfolio-Piece ohne reale Mandanten ist das akzeptabel und offengelegt. Section 3 (Sicherheitsmodell) zeigt das Threat-Model im Detail.

**Migrationspfad — wann der Wechsel kommt:** Sobald der erste zahlende Verwalter einen Auftragsverarbeitungs-Vertrag (AVV) unterschreibt, wandert `apps/agent` auf **Hetzner Falkenstein + Coolify** (deutsche GmbH, EU-Recht). Web kann bei Vercel bleiben oder ebenfalls auf Hetzner umziehen. Supabase wäre auf **self-hosted Postgres + GoTrue** zu prüfen (deutlich mehr Ops-Last). Der Trigger ist nicht „ab Tag 1" — er ist „ab erstem Vertrag".

---

## 2.4 Identity & JWT-Pass-Through

Der zentrale Sicherheits-Mechanismus ist, dass **dasselbe User-JWT** durch alle Code-Pfade fließt und Postgres-RLS jeden Zugriff filtert. Hier nur die Architektur — die Policies kommen in Section 3.

**Token-Form:**

- **ES256 asymmetric** signiert (Supabase-Default für neue Projekte seit Oktober 2025; HS256 ist Legacy). Verifikation gegen JWKS-Endpoint, keine geteilten Secrets.
- **Custom Claim** `tenant_id` wird über einen **Custom Access Token Hook** (Postgres-Funktion) bei Token-Ausgabe in `app_metadata.tenant_id` geschrieben — server-controlled, vom Client nicht manipulierbar (anders als `user_metadata`).

**Flow:**

```text
1. User login                → Supabase Auth gibt JWT aus
                                (ES256, app_metadata.tenant_id gesetzt)

2. Next.js Server Action     → liest session.access_token via @supabase/ssr
                              → ruft FastAPI auf, Header: Authorization: Bearer <jwt>

3. FastAPI verifiziert       → PyJWT + PyJWKClient gegen
                                https://<ref>.supabase.co/auth/v1/.well-known/jwks.json
                              → algorithms=["ES256"], audience="authenticated"

4. FastAPI ruft Supabase auf → per-Request supabase-py-Client, anon key,
                                Header Authorization: Bearer <user_jwt>
                              → Postgres-Role wechselt von anon zu authenticated

5. Postgres RLS-Policy       → using ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')
                                       = tenant_id::text)
```

**FastAPI-Dependency-Skizze** (15 Zeilen — der echte Code lebt später in `apps/agent/`):

```python
JWKS = jwt.PyJWKClient(f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json")

def get_user_supabase(authorization: str = Header(...)) -> tuple[Client, dict, UUID]:
    token = authorization.removeprefix("Bearer ").strip()
    key = JWKS.get_signing_key_from_jwt(token).key
    claims = jwt.decode(token, key, algorithms=["ES256"],
                       audience="authenticated",
                       issuer=f"{SUPABASE_URL}/auth/v1")
    tenant_id = claims.get("app_metadata", {}).get("tenant_id")
    if not tenant_id:
        raise HTTPException(403, "no tenant")
    client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY,
        ClientOptions(headers={"Authorization": f"Bearer {token}"}))
    return client, claims, UUID(tenant_id)
```

**Anti-Pattern, die Section 3 nochmal ausführt:**

1. **`service_role` auf request-scoped Pfaden** — umgeht RLS vollständig. Nur für System-Jobs, nie für User-Calls.
2. **Geteilter `supabase-py`-Client über Requests** — leakt Auth-Header zwischen Usern. Pro Request neu instanziieren.
3. **JWT-Ablauf in langen Agent-Runs** — Token läuft nach ~1 h ab. Lange Runs müssen entweder gechunked werden oder das Bridge-Modul kümmert sich um Refresh. Keine selbstgeminteten Long-Lived-Tokens.

> **Hinweis zu Section 1, §4.6 Invariante 1:** Dort steht als Kurzschreibweise `tenant_id = auth.jwt() ->> 'tenant_id'`. Die kanonische Form bei Supabase mit Custom-Claim-Hook ist `(auth.jwt() -> 'app_metadata' ->> 'tenant_id')`. Beide Section 3 Policies werden in der kanonischen Form geschrieben.

---

## 2.5 LangGraph: Embedded, nicht Platform

**Entscheidung:** Das `langgraph`-Paket läuft *in-process* in der FastAPI-App. Checkpoints in derselben Supabase-Postgres-Instanz via `AsyncPostgresSaver` (separates Schema `agent`). Kein LangGraph Platform / LangSmith Deployment.

**Warum:**

- **EU-Residency ohne Verhandlung.** Agent-State landet in derselben DB unter derselben RLS-Posture wie Domain-Daten. LangGraph Platform Cloud (selbst mit EU-Region) wäre eine zweite Data-Plane mit eigenem DPA und eigener Audit-Story.
- **Kosten = $0** im Portfolio-Scale. Der Developer-Tier von Platform ist „free self-hosted" bis 100k Node-Executions/Monat, danach $0.001/Node — ohne Umsatz nicht zu rechtfertigen.
- **Kein Feature-Verlust für die Roadmap.** Streaming (`graph.astream_events` → SSE), `PostgresSaver`-Checkpoints, `interrupt()` für Human-in-the-Loop, Time-Travel via Replay/Fork — alles im OSS-Paket. Genau die Primitive, die Section 4 (KI-Architektur) braucht.
- **Recruiter-Optics.** „LangGraph-State-Machine, Postgres-Checkpoints, Langfuse-Traces, RLS-Mandanten-Iso, eigene FastAPI" liest als Production-Thinking. Platform würde lesen als „delegiert die Operations-Komplexität, die das Portfolio gerade zeigen soll".

**Langfuse-Kompatibilität:** Wird als `CallbackHandler` an den Graph gehängt (`graph.with_config({"callbacks": [langfuse_handler]})`) — funktioniert identisch ob embedded oder auf Platform. Langfuse-EU-Cloud ist `cloud.langfuse.com` (Berliner GmbH).

**Migrationstrigger zu Platform:** ≥3 zahlende Mandanten + Bedarf an gemanagtem Autoscaling/Cron/Threads-UI als Produkt-Surface — nicht vorher.

---

## 2.6 Env-Trennung — Dev, Preview, Production

Drei Umgebungen, jede mit eigenem Supabase-Projekt (oder Branch), eigenem Vercel-Environment, eigener Fly-App.

| Env | Web | Agent | DB / Auth | Daten |
| --- | --- | --- | --- | --- |
| **local** | `pnpm dev` (Next.js) | `uv run uvicorn` | `supabase start` (lokaler Stack) | Seed-Daten, niemals echte |
| **preview** | Vercel Preview pro PR | Fly Preview App `weg-agent-preview-pr-N` | Supabase Branch (oder dediziertes Preview-Projekt) | Anonymisierte Snapshots |
| **production** | Vercel `production` | Fly App `weg-agent` (`fra`) | Supabase Prod (Frankfurt) | Reale Mandanten-Daten |

**Secrets-Verwaltung:**

- Vercel: Environment Variables pro Env (Dashboard).
- Fly.io: `fly secrets set` pro App.
- Supabase: Vault für DB-seitige Secrets (Webhook-Signaturen etc.).
- `.env.example` im Repo: **nur Schema, keine Werte** — Referenz für lokales Setup.
- Niemals: Secrets in Git, auch nicht in privaten Branches.

**Branching-Modell:**

- `main` → Production-Deploy (Vercel + Fly).
- Feature-Branches → Preview-Deploy automatisch.
- Hotfix-Tags: Conventional-Commit `fix:` + manueller Promote.

---

## 2.7 Lokale Entwicklung — Ein Befehl

```bash
just dev
```

Startet parallel:

1. `supabase start` (lokaler Stack: Postgres + Auth + Storage in Docker)
2. `pnpm --filter web dev` (Next.js auf `:3000`)
3. `uv run --project apps/agent uvicorn main:app --reload` (FastAPI auf `:8000`)

Weitere `justfile`-Recipes (alphabetisch):

- `just codegen` — OpenAPI → `packages/shared-types/`, Supabase-CLI → DB-Types
- `just db-migrate` — Supabase-Migrationen anwenden
- `just db-reset` — Lokale DB zurücksetzen + Seed
- `just lint` — eslint + ruff + sqlfluff
- `just test` — `pnpm --filter web test` + `uv run pytest apps/agent`
- `just typecheck` — `tsc --noEmit` + `mypy apps/agent`

---

## 2.8 CI / CD — skizzenhaft

**Push auf `main`:**

- Vercel deployed `apps/web` automatisch (Vercel-GitHub-App).
- Fly.io deployed `apps/agent` via GitHub Action `fly deploy --remote-only` (Token in GH-Secrets).
- Supabase-Migrationen: Action ruft `supabase db push` mit Service-Role-Key gegen Prod-Projekt.

**PRs:**

- Vercel Preview-URL pro PR automatisch.
- Fly-Preview-App optional (`fly launch --copy-config`), default aus.
- CI-Checks: `just lint`, `just typecheck`, `just test`. Rotes CI blockt Merge.

**Was bewusst nicht in der MVP-Pipeline ist:**

- Canary-Deploys / Blue-Green (Single-Tenant-Demo braucht das nicht).
- Lasttests / Chaos-Engineering (kommt mit ersten Real-Tenants).
- E2E-Tests (Section 5 nimmt UX-Pfade auf, dann mit Playwright).

---

## 2.9 Out-of-Scope für Section 2

Bewusst hier nicht behandelt — verweist auf spätere Sections:

- **Detail-RLS-Policies, Audit-Trigger, DSGVO-Threat-Model** → Section 3 (Sicherheitsmodell).
- **LangGraph-Graph-Definition, Agent-Tools, Guardrails, Prompt-Injection-Schutz, RAGAS-Setup** → Section 4 (KI-Architektur).
- **UI-Patterns, sichere Defaults, Undo, A11y, Tastatur-First** → Section 5 (UX-Leitprinzipien).
- **Konkrete End-to-End-Workflows (Einladung → Versammlung → Protokoll), Risiken, Out-of-Scope-Adapter** → Section 6.

---

**Nächster Commit:** `docs: add section 3 — security model`.
