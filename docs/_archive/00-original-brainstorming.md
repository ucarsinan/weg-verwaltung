# WEG-Verwaltungssoftware — System-Design (Brainstorming-Spec)

> Status: **In Arbeit (Brainstorming-Phase, Section 1 von 6 fertig)**.
> Dieser Spec ist die Vorstufe zum Implementierungsplan. Hier wird das System modelliert, NICHT implementiert.
>
> **Sofort-Aktion:** Repo public auf GitHub (siehe Section 10). Sections 2–6 werden DANACH als sichtbare Commits im Repo weiterentwickelt — Iterations-Historie ist Teil des Portfolio-Werts.

---

## 1. Context

**Anlass:** Sinan baut eine kleine, handliche, UI/UX-saubere Verwaltungssoftware für Wohnungseigentümergemeinschaften (WEG) — sicher von Anfang an: sicher in Verwendung, in Datenverwaltung, in KI-Integration.

**Problem:** Bestehende Verwalter-Software (Haufen Powerhaus, immoware24, Karthago, Domus) ist groß, kompliziert, UI/UX-technisch oft schwach, und KI nur als Aufsatz. Lücke: schlankes, modernes Profi-Tool mit KI-First-Design und kompromissloser Sicherheit.

**Zielergebnis:** Ein lauffähiges, in Profi-Qualität gebautes MVP — Portfolio-Piece, das gleichzeitig Sinans AI-Engineering-Lernpfad (Agents, RAG, LLMOps, Guardrails) konkret macht. Kein realer Produktverkauf, aber „so gebaut als würde es produktiv laufen".

---

## 2. Stand der Entscheidungen (aus Brainstorming Q&A)

| Dimension | Entscheidung |
|---|---|
| **Zielgruppe** | Profi-Hausverwalter (Multi-Tenant SaaS) |
| **MVP-Kern** | Versammlungsmanagement (Einladung → Tagesordnung → Abstimmung → Beschluss-Sammlung → KI-Protokoll) |
| **Versammlungs-Modi** | Alle 4: Präsenz, Hybrid, Virtuell, Umlaufbeschluss — **abstrakt modelliert** (eine Stimmabgabe ist eine Stimmabgabe, egal Quelle) |
| **KI-Rolle** | Voll-Agent: Tagesordnung-Vorschlag aus Vorjahres-Protokoll, Beschluss-Formulierungs-Prüfung (Bestimmtheitsgrundsatz), Fristen-Erinnerung, Protokoll-Entwurf |
| **Anspruch** | Portfolio-Piece in Profi-Qualität — echte DSGVO/Security-Pattern, externe Systeme (eIDAS, SEPA) als saubere **Adapter-Slots** ohne Vollintegration |
| **Stack** | Next.js 16 (App Router, Server Components) + FastAPI (LangGraph Agent) + Supabase Frankfurt (Postgres + Auth + Storage + RLS) + Resend für Mail + **Langfuse** für LLM-Observability + **RAGAS** für RAG-Eval |
| **Streaming** | Extern (Zoom/Webex), **nicht im MVP** |

---

## 3. Architektur-Ansatz: Modularer Monolith mit getrenntem Agent-Service

Ein Repo, zwei Deployments:

- **`apps/web`** — Next.js 16. UI + Domain-CRUD via Server Actions, die direkt mit Supabase sprechen (User-JWT, RLS macht Mandanten-Iso auf DB-Ebene).
- **`apps/agent`** — FastAPI. *Nur* der KI-Agent-Service (LangGraph-State-Machine, Tool-Calls zurück in Supabase **mit demselben User-JWT** — RLS wirkt auch durch den Agent). Langfuse für Trace + Eval, RAGAS für Retrieval-Qualität.

**Domain-Module innerhalb `apps/web`** (harte Interfaces zwischen Modulen, keine Cross-Imports):
- `modules/identity/` — Auth, Users, Rollen
- `modules/weg/` — Stammdaten: WEG, Wohnung, Eigentümer
- `modules/versammlung/` — Versammlung, TOP, Resolution, Vote, Vollmacht, Protokoll
- `modules/beschluss-sammlung/` — §24 Abs. 7 WEG, append-only
- `modules/dokumente/` — Storage, Versionierung, Signed-URLs
- `modules/audit/` — Append-only Audit-Log
- `modules/agent-bridge/` — Aufrufe an FastAPI-Agent-Service, Antworten ablegen

**Extraktions-Trigger** (Modul → eigener Service, später):
- Team > 5 Devs
- Modul mit anderem Scaling-Profil (z. B. Document-Indexing braucht GPU)
- Modul mit anderer Compliance-Anforderung (z. B. Payment im PCI-Scope)
- Stable-Modul + häufig wechselnder Rest

---

## 4. Section 1 — Domain-Modell

### 4.1 Hierarchie (Multi-Tenant)

```
Tenant (Verwalter-Kanzlei)
  └── WEG (Eigentümergemeinschaft)
        └── Unit (Wohnung / Sondereigentum, mit MEA-Anteil)
              └── Ownership (zeitliche Verknüpfung Person ↔ Unit)
                    └── Person (natürliche Person)
```

**Wichtige Trennung — Person vs. User vs. Owner:**
- **Person** = abstrakte natürliche Person (Name, Anschrift, Kontakt). Kein Login.
- **User** = Account mit Login. Verknüpft mit *einer* Person + *einer* Tenant-Rolle ODER Eigentümer-Rolle.
- **Ownership** = zeitgebundene Beziehung Person ↔ Unit (`von`, `bis`). Eigentümer können wechseln, historische Stimmen bleiben aber der damaligen Ownership zugeordnet.

Warum diese Trennung: Eigentümer haben oft keinen App-Zugang (alte Eigentümer). Verwalter-Mitarbeiter sind User ohne Owner-Status. Eine Person kann zwei Wohnungen besitzen → zwei Ownerships. Eigentumswechsel mitten in einer Versammlung muss historisch sauber sein.

### 4.2 Versammlungs-Kern

```
Meeting (Versammlung)
  ├── modus: praesenz | hybrid | virtuell | umlauf
  ├── status: entwurf | eingeladen | laufend | beendet | abgesagt
  ├── termin_von, termin_bis
  ├── frist_einladung_ok: boolean (§24 Abs. 4 WEG: 3 Wochen)
  │
  ├── AgendaItem (TOP, geordnet)
  │     ├── titel, beschreibung
  │     └── Resolution (Beschlussvorlage, optional pro TOP)
  │           ├── text (Beschlusswortlaut)
  │           ├── mehrheits_typ: einfach | qualifiziert | allstimmig
  │           ├── stimmprinzip: kopf | wert | objekt (§25 WEG)
  │           │
  │           ├── Vote (Stimme)
  │           │     ├── ownership_id (NICHT person_id, NICHT user_id!)
  │           │     ├── wert: ja | nein | enthaltung
  │           │     ├── quelle: praesenz | digital | umlauf
  │           │     ├── proxy_id (wenn per Vollmacht abgegeben)
  │           │     └── abgegeben_am
  │           │
  │           └── ResolutionResult (abgeleitet, gecached)
  │                 ├── ja_count, nein_count, enth_count
  │                 ├── mea_ja, mea_nein, mea_enth (für Wertprinzip)
  │                 ├── status: angenommen | abgelehnt
  │                 └── berechnet_am
  │
  ├── Proxy (Vollmacht)
  │     ├── vollmachtgeber: Ownership
  │     ├── vollmachtnehmer: Ownership | Verwalter | Beirat
  │     ├── umfang: gesamt | top_spezifisch
  │     ├── tops[]
  │     └── dokument_id → Document
  │
  └── Protocol (Protokoll)
        ├── status: ki_entwurf | verwalter_revision | unterzeichnet
        ├── text (Markdown)
        ├── generierungs_quelle: ki | manuell
        └── unterzeichnet_von, unterzeichnet_am
```

### 4.3 Beschluss-Sammlung (gesetzlich zwingend, §24 Abs. 7 WEG)

Eigene Entität, **append-only**, gehört zur WEG (nicht zum einzelnen Meeting):

```
BeschlussSammlungEntry
  ├── weg_id
  ├── lfd_nr (fortlaufend pro WEG, Lücken nur durch Stornierung)
  ├── beschluss_text
  ├── meeting_id (woher kommt der Beschluss)
  ├── resolution_id
  ├── datum
  ├── typ: positiv_beschluss | negativ_beschluss | umlaufbeschluss
  ├── anfechtungsstatus: keine | angefochten | unwirksam_erklaert
  └── erstellt_durch (User — niemals Agent direkt!)
```

### 4.4 Querschnitts-Entitäten

- **Document** — Tenant + (optional WEG + Meeting). Typ: einladung | protokoll | beschluss | vollmacht | sonst. Storage-Pfad in Supabase + SHA-256-Hash für Tamper-Detection.
- **AuditEvent** — Append-only. `actor_type: user | agent`, `aktion`, `entity_typ`, `entity_id`, `before`, `after`, `ip`, `user_agent`, `langfuse_trace_id` (bei Agent-Aktion).
- **AgentSuggestion** — Vorschläge der KI, *getrennt von echten Beschlüssen*. Status: `vorschlag | uebernommen | verworfen`. Verwalter muss aktiv übernehmen. Niemals Auto-Apply.

### 4.5 Aggregate-Grenzen (DDD)

| Aggregate | Root | Mutation-Regel |
|---|---|---|
| **Meeting** | `Meeting` | Bis `status=beendet` mutabel. Danach append-only (Protokoll-Edit nur als versionierte Revision). |
| **WEG** | `WEG` | Stammdaten-Änderungen mit Audit, Eigentumswechsel als Ownership-Schluss + neuer Ownership. |
| **BeschlussSammlung** | `WEG` (parent) | Append-only. Anfechtungs-Status ist eine separate immutable Folge-Event-Kette. |
| **Document** | `Document` | Immutabel nach Upload. Neue Version = neues Dokument mit `vorgaenger_id`. |
| **AuditEvent** | — | Niemals mutabel. Niemals löschen (auch nicht durch Tenant-Admin). |

### 4.6 Harte Invarianten (datenbankseitig erzwingen via Constraints + RLS)

1. **Mandanten-Iso**: Jede Tabelle hat `tenant_id`. RLS-Policy: `tenant_id = auth.jwt() ->> 'tenant_id'`. Kein Code-Pfad kann das umgehen.
2. **Stimmrecht**: Eine `Vote` ist nur gültig, wenn `Ownership` zur WEG des `Meeting` gehört UND zum Versammlungs-Zeitpunkt aktiv war.
3. **KI = nur Vorschläge**: Trigger auf `BeschlussSammlungEntry`, `Vote`, `Protocol.unterzeichnet`, `Resolution` lehnt `actor_type=agent` ab. Erzwungen in DB, nicht nur in App.
4. **Append-only Beschluss-Sammlung**: Trigger verhindert UPDATE/DELETE auf `BeschlussSammlungEntry` (nur INSERT). Anfechtung = eigene Event-Tabelle.
5. **Audit-Log unverletzlich**: Eigene Tabelle, RLS erlaubt nur INSERT (auch Tenant-Admin kein DELETE).
6. **Einladungs-Frist**: `Meeting.frist_einladung_ok` ist berechnet (`termin_von - einladungs_versand_am >= 21 days` außer bei Notfall-Beschluss).

---

## 5. Section 2 — Architektur & Deployment

> **TODO** — als Nächstes ausarbeiten.

## 6. Section 3 — Sicherheitsmodell

> **TODO**

## 7. Section 4 — KI-Architektur (Agent, Tools, Guardrails, LLMOps)

> **TODO**

## 8. Section 5 — UX-Leitprinzipien

> **TODO**

## 9. Section 6 — End-to-End-Workflow + Out-of-Scope + Risiken

> **TODO**

---

## 10. Repo-Setup & Public-Publishing (Sofort-Aktion nach ExitPlanMode)

### 10.1 Ziel

Aktueller Stand als public GitHub-Repo, primär als **Bewerbungs-Portfolio**. Sections 2–6 werden DANACH **im Repo** als sichtbare Commits weiterentwickelt — Iterations-Historie ist Teil des Portfolio-Werts.

### 10.2 Strategie

- **Repo-Inhalt:** Plan + Minimal-Skeleton (Mono-Repo-Form mit leeren `apps/web` + `apps/agent`-Stubs, Plan unter `docs/01-system-design.md`). Zeigt Recruitern Architektur-Form ohne halbgare Code-Schulden.
- **Visibility:** Public.
- **License:** Proprietary — „All Rights Reserved" (User-Entscheidung: Lesen erlaubt, Forken/Nutzen nicht).
- **Repo-Name:** `weg-verwaltung` (deutsch, präzise; verhandelbar).
- **Standort:** `~/Development/weg-verwaltung/`.

### 10.3 Repo-Struktur beim ersten Commit

```text
weg-verwaltung/
├── README.md             # Problem, Lösungs-Idee, Status, Stack, Roadmap
├── LICENSE               # Proprietary, All Rights Reserved
├── SECURITY.md           # Sicherheits-Disclosure-Policy
├── CLAUDE.md             # Projekt-Hub für Claude Code
├── .gitignore            # vollständig, vor erstem Commit
├── .env.example          # Stub-Variablen, keine Werte
├── docs/
│   └── 01-system-design.md   # dieser Spec (umbenannt, WIP-Marker, lint-clean)
├── apps/
│   ├── web/                  # Next.js 16 — Stub mit package.json + README
│   └── agent/                # FastAPI — Stub mit pyproject.toml + README
├── packages/
│   └── shared-types/         # Stub mit package.json
└── infra/
    └── supabase/             # README zur geplanten RLS-Strategie
```

### 10.4 README-Outline (kritisch für Bewerbungs-Optik)

1. **Was ist das** — 2 Sätze, klar (WEG-Verwaltungssoftware, design-first portfolio piece).
2. **Status** — Brainstorming-/Design-Phase, kein lauffähiger Code, Iteration im Repo sichtbar.
3. **Architektur-Diagramm** — ASCII oder Mermaid, klein.
4. **Stack** — Next.js 16 + FastAPI + Supabase Frankfurt + LangGraph + Langfuse + RAGAS.
5. **Sicherheits-Prinzipien** — Multi-Tenant via RLS, KI-Schreibsperre auf DB-Ebene, append-only Audit, append-only Beschluss-Sammlung.
6. **Roadmap** — MVP = Versammlungsmanagement, später Hausgeld / Dokumente / Tickets.
7. **Lizenz** — Proprietary, kurze Begründung.
8. **Kontakt** — GitHub-Handle (keine Privatadresse / Telefon).

### 10.5 LICENSE-Wortlaut (Proprietary)

```text
Copyright (c) 2026 Sinan Ucar

All rights reserved.

This source code is made publicly visible for portfolio review purposes only.
No license is granted to use, copy, modify, merge, publish, distribute,
sublicense, or sell copies of the software, in whole or in part, without
prior written permission of the copyright holder.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED.
```

### 10.6 .gitignore (Min-Set, MUSS vor erstem Commit existieren)

```text
.env
.env.*
!.env.example
node_modules/
__pycache__/
*.pyc
.next/
dist/
build/
.vscode/
.idea/
.DS_Store
*.log
coverage/
.pytest_cache/
.ruff_cache/
.venv/
venv/
```

### 10.7 Sicherheits-Checks vor `git push`

- Keine echten Daten in irgendeinem File (auch nicht in `apps/*/README.md`)
- Keine API-Keys, Tokens, Secrets, Passwörter
- `.env.example` enthält nur Variable-Namen, keine Werte
- Persönliche Identifizierungs-Daten (Adresse, Telefon) **nicht** im README — nur GitHub-Handle + ggf. öffentliche Mail
- `.gitignore` testen: `git status` darf keine sensitiven Files zeigen

### 10.8 Ausführungsplan (nach ExitPlanMode)

1. Verzeichnis-Struktur anlegen (`mkdir -p`).
2. Top-Level-Files schreiben: `README.md`, `LICENSE`, `SECURITY.md`, `CLAUDE.md`, `.gitignore`, `.env.example`.
3. Spec aus `~/.claude/plans/…compressed-flask.md` kopieren nach `docs/01-system-design.md`, Titel + WIP-Marker setzen, Lints fixen.
4. Stub-Files für `apps/web` (package.json + README), `apps/agent` (pyproject.toml + README), `packages/shared-types`, `infra/supabase`.
5. `git init -b main`, `git add .`, ersten Commit (Conventional Commit, Englisch).
6. `gh repo create weg-verwaltung --public --source=. --remote=origin --push --description "WEG-Verwaltung — design-first portfolio piece (Next.js + FastAPI + Supabase + LangGraph)"`.
7. Im neuen Repo: `.claude/settings.local.json` mit `permissions.defaultMode: "bypassPermissions"` anlegen (per globaler Hub-Regel).
8. `~/Development/personal-assistant/memory/projects-status.md` aktualisieren — neues Projekt aktiv, in `weekly-focus.md` aufnehmen falls passend.
9. **NACH Push:** Brainstorming-Sections 2–6 als sichtbare Commits unter `docs/` weiterentwickeln (jede Section = eigener Commit für lesbare Historie).

---

## Verification (am Ende, nach Implementierungs-Plan)

- Sections 2–6 stehen vollständig im Repo (Architektur, Security, KI, UX, End-to-End).
- README, LICENSE, SECURITY.md vorhanden und lint-clean.
- `git log` zeigt saubere Conventional-Commit-Historie.
- `gh repo view weg-verwaltung --web` öffnet öffentlich sichtbares Repo.
- `.env.example` enthält keine Secrets, `.gitignore` deckt alle sensitiven Pfade.
- Wird als Teil des späteren Implementierungsplans erweitert (Code-Tests etc.).
