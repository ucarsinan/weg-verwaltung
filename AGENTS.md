# WEG-Verwaltung — Projekt-AGENTS.md

## Was ist das

Verwaltungssoftware für Wohnungseigentümergemeinschaften (WEG) — Multi-Tenant SaaS für Profi-Hausverwalter, KI-First, sicher von Anfang an. Portfolio-Piece in Profi-Qualität.

**Aktueller Stand (belegt, September 2026):** Cloud-DB-Ziel ist das lokal verlinkte Supabase-Frankfurt-Projekt. Lokal liegen Migrationen `0001–0078`: Dokumente/Personen/Eigentümerschaft bis `0033`, Audit-Hotfix/Forward-Repair und Least-Privilege-Hardening bis `0046`, Finance Lifecycle bis `0048`, Meeting/Resolution-Hardening in `0049`, Audit-Console-Read-API in `0050`, Actor-Guard-DELETE-Fix in `0051`, Vorgangszentrale-Foundation in `0052`, Settings-Audit-Trigger in `0053`, Agent-Suggestion-Vorgangsanker in `0054`, Advisor-Grant-/RLS-InitPlan-Hardening in `0055`, Finance-Allocation-Foundation in `0056`, Self-Managed-SaaS-Foundation in `0057`, Audit-Writer-Vault-Decrypt-Grant in `0058`, Tenant-Audit-Emitter-Repair in `0059`, Wirtschaftsplan-Positions-Allokation in `0060`, Zahlungseingänge und offene Posten in `0061`, Ausgaben und Erhaltungsrücklage in `0062`, Jahresabrechnung (§ 28 Abs. 2 WEG) in `0063`, NULL-sichere Writer-Guards in `0064`, Vermögensbericht (§ 28 Abs. 4 WEG) in `0065`, löschbarer Abrechnungsentwurf in `0066`, gemischte Verteilungsschlüssel mit HeizkostenV in `0067`, das NULL-sichere Forward-Fenster der Kettenprüfung in `0068`, die Dokumentenablage mit editierbaren Aufbewahrungsregeln in `0069`, die Bucket-Grenze `weg-docs` auf 10 MB angeglichen in `0070`, die eigenständige Rückfall-Sicht `aufbewahrung_effektiv` in `0071` und der Soft-Delete als geprüfte RPC samt Tenant-Abgleich im Join dieser Sicht in `0072` und die MEA-Vollständigkeit als Vorbedingung der Wirtschaftsplan-Aktivierung in `0073` und die Beschlussgrundlage als zweite Vorbedingung derselben Aktivierung in `0074` und die Sichtbarkeit je WEG als eigene Zuordnung in `0075` die Reparatur des Audit-Emitters der Vorgangszentrale in `0076` und die Grant-Härtung der Audit-Konsole und der Vorgangs-Tabellen in `0077` und Audit-Trail samt Agenten-Sperre für `weg_zugang` in `0078` (alle drei am 2026-10-02 ausgerollt). Damit ist die Pflichtkette aus § 28 WEG — Wirtschaftsplan, Jahresabrechnung, Vermögensbericht — im Datenmodell vollständig. **`0074` ist am 2026-09-29 ausgerollt** (`supabase db push`, eine Migration): Die Migration verlangt, dass ein Wirtschaftsplan vor der Aktivierung auf einen Eintrag der Beschluss-Sammlung verweist — nach § 28 Abs. 1 WEG begründet erst der Beschluss die Zahlungspflicht. Verwiesen wird bewusst auf `beschluss_sammlung_entry` und nicht auf `resolution`, weil `resolution.meeting_id` `not null` ist und den Umlaufbeschluss nach § 23 Abs. 3 WEG sonst strukturell ausschlösse. Das zugehörige Auswahlfeld liegt seit demselben Tag im Bearbeitungsformular des Entwurfs; es ist bewusst nicht pflichtig, weil geplant wird, bevor die Versammlung beschließt. Der Aktivieren-Knopf hängt am **gespeicherten** Stand — eine nur ausgewählte Zuordnung genügt nicht, und der Hinweis darunter führt auf `beschluss-sammlung/new`.

**Rollenmodell (Stand 2026-09-29):** *Korrektur einer frueheren Fassung vom selben Tag, die hier stand: Sie behauptete, `public.has_role()` werde „nur in `tenant_member` und der Audit-Konsole" ausgewertet — das war falsch. Nachgezählt sind es **elf SELECT-Policies** (dazu die Vorgangszentrale `0052` mit sieben und die Einladungen `0057:99`) plus 41 Schreib-Policies.* Richtig ist die engere Aussage: Auf den **Kern-Fachtabellen** trennte keine Lesepolicy nach Rolle. **Seit `0075` trifft sie die Unterscheidung für `eigentuemer`** — über `public.weg_zugang`, eine explizite Zuordnung Nutzer → WEG, nicht über die Eigentümerkette (die trägt keine Sicherheitsgrenze; vier Befunde im Kopf von `0075`). Erzwungen auf `weg`, `unit`, `ownership` und `beschluss_sammlung_entry`. `weg_zugang` startet leer, es gibt noch keine Oberfläche zum Vergeben (jede Vergabe und jeder Entzug erzeugt seit `0078` eine `audit_event`-Zeile, und ein Agent wird mit 42501 abgewiesen), und `person` sowie die Finanztabellen sind bewusst ausgespart. `verwalter_mitarbeiter`, `beirat` und `eigentuemer` existieren im Enum (`0002`), haben aber keine eigene Zeilenfilterung und keine eigene Ansicht. `eigentuemer` war bis zum 2026-09-29 die **Voreinstellung** im Einladungsformular — wer so eingeladen wurde, bekam das vollstaendige Verwalter-Dashboard fuer alle WEGs des Mandanten, lesend und schreibend. Seither weist `(dashboard)/layout.tsx` die Rolle nach `/kein-zugang` ab, und `createTenantInvitationAction` lehnt sie ab. **Bewusst als Sperrliste gebaut:** abgewiesen wird genau diese eine Rolle, eine fehlende Rolle kommt durch — eine Positivliste wuerde bei nicht registriertem Access-Token-Hook jeden aussperren. `docs/03-security-model.md` beschrieb die Rollenrechte bis dahin als Stand und traegt jetzt einen Warnblock. Details: `docs/agent-reports/2026-09-29-eigentuemerrolle-ohne-schranke.md`.

**Dokumentenablage (seit 2026-09-23):** Der Verwalter legt Unterlagen je WEG ab (`/wegs/[id]/dokumente`), versioniert sie und sieht die geltende Aufbewahrungsfrist samt Herkunft (Mandantenregel oder gesetzlicher Rückfall), einstellbar unter `/einstellungen/aufbewahrung`. Modul `modules/dokumente`. **Kein Eigentümerportal** — Eigentümer haben keine Logins, und die Ablage ist Komfort für die Verwaltung, kein Erfüllungsweg für das Einsichtsrecht nach § 18 Abs. 4 WEG (Rechtsprechung: Einsicht beim Verwalter, keine Pflicht zur digitalen Übersendung). Das Entfernen aus der Liste läuft seit `0072` über die RPC `public.dokument_entfernen` statt über ein direktes UPDATE: die SELECT-Policy aus `0015` filtert `deleted_at is null`, und PostgreSQL lehnt jedes UPDATE ab, dessen neue Zeile unter der eigenen SELECT-Policy unsichtbar wäre — der Soft-Delete war damit strukturell unmöglich, nicht nur fehlerhaft. Die Policy bleibt unverändert; die Funktion löst den Mandanten selbst über `public.tenant_id()` auf, verlangt weiterhin die `weg_id`, meldet ehrlich, ob eine Zeile getroffen wurde, und sperrt Agenten selbst (`public.document` trägt keinen `*_block_agent_writes`-Trigger). **Der Kommentar in `0015` („No DELETE policy → hard delete blocked. Use UPDATE `deleted_at = now()` (soft delete)") ist damit überholt** — er weist einen Weg an, den die SELECT-Policy derselben Migration versperrt. Wer ein Dokument entfernen will, ruft `public.dokument_entfernen(p_dokument_id, p_weg_id)`; ein direktes UPDATE scheitert immer. Details und Produktgrenzen: `docs/specs/2026-09-22-dokumentenablage-design.md`. Der zugehörige E2E-Spec `apps/web/e2e/dokumente.spec.ts` ist am 2026-09-25 erstmals gelaufen (Teil des Gesamtlaufs, siehe unten): Test 18 (Upload), Test 19 (neue Version **und** Entfernen aus der Liste — der einzige Pfad, der `public.dokument_entfernen` über die echte Oberfläche ausübt) und Test 20 (eine geänderte Aufbewahrungsregel wirkt sich auf die Liste aus) haben alle drei bestanden. **Ein Lauf hinterlässt permanentes Datenresiduum, nicht behebbar per Skript — seit dem 2026-09-25-Lauf real im Cloud-Tenant, nicht mehr nur Designbeschreibung:** pro vollständigem Lauf 3 `weg`-Zeilen, 3 `document`-Zeilen (eine davon soft-gelöscht, bleibt aber stehen), 4 `document_version`-Zeilen und 4 Storage-Objekte in `weg-docs` — `document_version` ist append-only (Trigger, 0015) und `document_version_document_fk`/`document_weg_fk` stehen auf `on delete restrict`, also werden auch die betroffenen `document`- und `weg`-Zeilen unlöschbar, selbst für `service_role`. Dieses Residuum liegt seit dem 2026-09-25-Lauf tatsächlich im Tenant und wächst mit jedem künftigen Lauf weiter. Reiht sich ein in den 331-unlöschbare-E2E-WEGs-Befund aus `docs/agent-reports/2026-07-14-worker-general-cloud-e2e-first-run.md`. `apps/web/scripts/cleanup-e2e-residue.mjs` versucht seit kurzem `document` zu löschen (`bulkStep`), scheitert damit aber an genau dieser Sperre für jedes hier erzeugte Dokument — `document_version` und die Storage-Objekte versucht es gar nicht erst. Details: Kopfkommentar von `apps/web/e2e/dokumente.spec.ts`. Kein Cleanup-Mechanismus vorgesehen — er würde die von `0015` bewusst durchgesetzte Sicherheitseigenschaft umgehen müssen. Sicherheitsbegründung, Nutzerentscheidung und Beweisführung (einzeln rot gesehene Zusicherungen) zur `dokument_entfernen`-Funktion: `docs/agent-reports/2026-09-23-worker-general-dokument-entfernen-definer-rpc.md`.

**Der Cloud-Migrationsstand ist seit dem 2026-09-25 verifiziert:** `0068`–`0072` wurden an diesem Tag per `just db-migrate` ausgerollt; ein anschließendes `supabase migration list --linked` zeigt die `Remote`-Spalte gefüllt für `0067` bis `0072` (die frühere Ausrollung von `0061`–`0067` am 2026-09-20 eingeschlossen). **`0075` ist am 2026-09-30 ausgerollt** (`just db-migrate`, eine Migration): Der Guard bestätigte `HEAD` gleich `origin/main` (2fb6080) und ein sauberes Migrationsverzeichnis, der Dry Run listete genau `0075_weg_zugang.sql`, und `supabase db push` meldete `Applying migration 0075_weg_zugang.sql` gefolgt von `Finished supabase db push`. Dass der Push nur diese eine Migration enthielt, belegt zugleich, dass `0073` und `0074` bereits in der Cloud lagen. Der Nachweis über die `Remote`-Spalte folgte am 2026-10-01: `supabase migration list --linked` zeigt sie bis `0075` gefüllt. Damit greift die Rollentrennung aus `0075` erstmals auch über `/rest/v1/*`, nicht nur im Dashboard-Riegel aus PR #37. **`0076`–`0078` sind am 2026-10-02 ausgerollt** (`just db-migrate`, drei Migrationen in einem Lauf): Der Guard bestätigte `HEAD` gleich `origin/main` (7de4e5e) und ein sauberes Migrationsverzeichnis, der Dry Run listete genau diese drei Dateien, und `supabase db push` meldete `Applying migration` für `0076`, `0077` und `0078` gefolgt von `Finished supabase db push`; die zwei `NOTICE`-Zeilen bei `0078` melden nur, dass die Trigger vorher nicht existierten (`drop trigger if exists`). **Nachweis per read-only `supabase migration list --linked` und Katalog-Abfragen** (`supabase db query --linked`, keine Nutzdaten, nichts geschrieben): `Remote` ist bis `0078` gefüllt; `audit_writer` hat weiter kein `USAGE` auf `auth`, der Vorgangs-Emitter ruft aber kein `auth.uid()` mehr auf und liest die JWT-Einstellungen; `anon` hat keine Rechte auf den `vorgang*`-Tabellen, `authenticated` SELECT/INSERT/UPDATE (die Timeline nur SELECT/INSERT); `audit_event_feed` und `audit_reveal_event_payload` sind nur für `authenticated` ausführbar; `audit_payload_reveal` (INSERT, SELECT) und `audit_integrity_check` (SELECT) sind auf das Vertragsmaß verengt; `weg_zugang` trägt `weg_zugang_audit_emit` und `weg_zugang_block_agent_writes`. **Nicht belegt:** ob die App einen Vorgang in der Cloud tatsächlich anlegen kann — das würde schreiben und wurde nicht ausgeführt; der Nachweis ist strukturell plus der grüne Vertrag `0054` im CI-Gate. Next.js-16-Web-App und FastAPI/LangGraph-Agent sind vorhanden. RAG-Retrieval ist Scaffold und liefert bewusst `[]`, bis Embedding-Datenpipeline und Eval-Gates stehen. Die E2E-Suite umfasst 22 Specs, davon acht für den Finanzbereich (`finanzen`, `-positionen`, `-zahlungen`, `-ausgaben`, `-abrechnung`, `-vermoegensbericht`, `-gemischter-schluessel`, `-beschlussgrundlage`), einer für die Dokumentenablage (`dokumente`, am 2026-09-25 erstmals gelaufen, siehe oben) und seit dem 2026-09-28 `selbstverwaltung` — die durchgehende Reise einer WEG mit sechs Einheiten samt zwei Charakterisierungstests, die zwei stille Rechenfehler festhalten (`docs/agent-reports/2026-09-28-selbstverwaltungs-slice-verifikation.md`). **Der Gesamtlauf vom 2026-09-25 liegt jetzt vor, in zwei Teilen:** Teil 1 (`just e2e`, volle Suite) deckte Tests 1 bis 83 von 100 ab — 81 bestanden, 2 übersprungen (`test.skip` im Quellcode: `finanz-wp-zero-mea`, `sollstellung-unit-no-mea`), 0 fehlgeschlagen —, dann brach der Prozess mit `ENOSPC` ab (Node-Absturz mangels Plattenspeicher, kein Testfehler). Teil 2 (die drei restlichen Spec-Dateien `scenarios`, `versammlungen`, `wegs`, direkt per Playwright nach Freigabe von Plattenspeicher) lief vollständig: 19 Tests, alle bestanden. Zusammen: **98 bestanden, 2 übersprungen, 0 fehlgeschlagen von 100.** Die volle RLS-Suite (Tests 71–80) lief dabei gegen die migrierte Cloud grün. **Seit dem 2026-09-28 liegt ein vollständiger Lauf in einem Stück vor:** `just e2e` mit 103 Tests — 101 bestanden, 2 übersprungen (dieselben `test.skip`-Fälle), 0 fehlgeschlagen, 7,6 Minuten, kein Abbruch. Der Split vom 2026-09-25 ist damit Geschichte, nicht mehr die aktuelle Beleglage. Produktives Hosting für Web-App und Agent ist aus dem Repo nicht belegt. Vote referenziert `ownership_id`, niemals `person_id` oder `user_id`; Co-Eigentümer zählen als eine Stimme pro Ownership.

## Stack

- Next.js 16 (App Router, Server Components) — `apps/web/`
- FastAPI + LangGraph — `apps/agent/`
- Supabase Frankfurt (Postgres + Auth + Storage + RLS)
- Langfuse (LLM-Observability) + RAGAS (RAG-Eval), derzeit noch nicht als produktives Gate belegt
- Resend (Mail)

## Architektur

Modularer Monolith mit getrenntem Agent-Service (ein Repo, zwei Deployments). Domain-Module mit harten Interfaces innerhalb `apps/web/modules/`:

- `identity/` · `weg/` · `versammlung/` · `beschluss-sammlung/` · `dokumente/` · `audit/` · `agent-bridge/` · `finanzen/`

## Sicherheits-Invarianten (immer einhalten)

1. Mandanten-Iso via RLS (`tenant_id = (select public.tenant_id())`). Helper `public.tenant_id()` extrahiert aus JWT — siehe 0001. Builtins `auth.jwt()`/`auth.uid()` bleiben in `auth` Schema; user-defined Helpers liegen in `public` (hosted-Supabase blockt CREATE auf `auth`).
2. KI = nur Vorschläge — DB-Trigger blockiert `actor_type=agent` auf `Vote`, `BeschlussSammlungEntry`, `Protocol.unterzeichnet`, `Resolution`.
3. `BeschlussSammlungEntry` ist append-only (Trigger lehnt UPDATE/DELETE ab).
4. `AuditEvent` ist unlöschbar — auch für Tenant-Admin.
5. Stimmen referenzieren `ownership_id`, niemals `person_id` oder `user_id` (historische Korrektheit bei Eigentumswechsel).

## Commands

```bash
just dev-web       # Next.js dev (Port 3000) — gegen Cloud-DB (Frankfurt)
just dev-agent     # FastAPI dev (Port 8000, uv-managed venv)
just test          # alle Tests (web + agent)
just test-web      # Vitest unit + jest-axe
just typecheck     # tsc + mypy --strict
just lint          # eslint + ruff
just test-db-all   # alle gruenen pgTAP-Vertraege gegen eine ephemere lokale DB (das CI-Gate)
just test-security-db # nur der katalogweite RLS-Vertrag (0000_rls_katalog), fixture-frei
just test-audit-db # nur die Audit-Vertraege (0002, 0046, 0050, 0052, 0054, 0055, 0058, 0059, 0068, 0069, 0071); 0069/0071 decken auch 0072 ab
just test-finance-db # nur die Finance-Vertraege (0056, 0060-0067), nicht Cloud
just e2e           # Playwright/Chromium — Login-Flow gegen Cloud; nicht ohne explizite Freigabe im Audit laufen lassen
just seed-admin    # Tenant + tenant_admin via Supabase Admin-API (idempotent)
just codegen       # OpenAPI → packages/shared-types (agent muss laufen)
just db-migrate    # supabase db push --workdir infra (gegen Cloud!)
just db-dump-local # logischer Export der lokalen DB (Uebung, harmlos)
just db-dump       # logischer Export der CLOUD-DB (Freigabe! echte Daten auf Platte)
```

Kein manuelles `supabase start` / Remote-`db-reset` mehr — das Projekt ist im Entwicklungsbetrieb **remote-only** gegen Frankfurt. Ausnahme sind die lokalen pgTAP-Rezepte (`just test-db-all` sowie die fokussierten `test-audit-db`/`test-finance-db`/`test-saas-db`); sie nutzen eine ephemere lokale Supabase-Testdatenbank ohne `--linked` und brauchen deshalb eine lokale Container-Runtime. Welche Vertraege laufen, steht ausschliesslich im justfile (`AUDIT_DB_TESTS`/`FINANCE_DB_TESTS`/`SAAS_DB_TESTS`) — der CI-Job ruft `just test-db-all` auf und fuehrt bewusst keine zweite Liste. Cloud-Credentials liegen ausschließlich in lokaler Secret-Konfiguration.

## Konventionen

- Commits: Conventional Commits, Englisch
- Sprache: Deutsch für Docs/Diskussion, Englisch für Code
- Server-first: Server Components als Default, `use client` nur wenn nötig
- Typsicher, modular, keine Secrets im Code

## Offene Aufgaben (Brainstorming)

- [x] Section 2 — Architektur & Deployment ([docs/02-architecture-deployment.md](./docs/02-architecture-deployment.md))
- [x] Section 3 — Sicherheitsmodell ([docs/03-security-model.md](./docs/03-security-model.md))
- [x] Section 4 — KI-Architektur ([docs/04-ai-architecture.md](./docs/04-ai-architecture.md))
- [x] Section 5 — UX-Leitprinzipien ([docs/05-ux-principles.md](./docs/05-ux-principles.md))
- [x] Section 6 — End-to-End-Workflow + Risiken ([docs/06-workflows-and-risks.md](./docs/06-workflows-and-risks.md))

## Backlog (Security-Hygiene, nicht blocking)

- ~~`function_search_path_mutable`~~ — erledigt in 0019
- ~~`extension_in_public` für `pg_net`, `pgaudit`, `vector`~~ — lokal durch 0022/0023/0024 abgebildet (DROP+CREATE WITH SCHEMA `extensions`; `ALTER EXTENSION … SET SCHEMA` schlug laut früheren Cloud-Notizen mit SQLSTATE 42501 fehl, weil `supabase_admin` Owner ist). Frühere Cloud-Advisor-Schließung ist dokumentiert, aber in diesem Audit nicht erneut geprüft. Schließt zusätzlich die 4 pgaudit-RPC-Advisors strukturell. Vorbedingung war `public.embedding` leer — bei zukünftigen Daten via Snapshot/Restore oder Supabase-Support neu lösen.
- Audit Forward-Repair `0045`/`0046` lokal vorhanden; frühere Cloud-/Runtime-Validation ist dokumentiert, aber in diesem Audit nicht erneut geprüft.
- ~~`rls_disabled_in_public` auf `embedding_p0`~~ — temporäre Regression durch 0024-Rebuild, gefixt in 0025
- ~~pgTAP-Verträge `0050`, `0052`, `0054` rot~~ — erledigt (Stand 2026-10-02), alle drei laufen im CI-Gate (`just test-db-all`: 26 Verträge, 523 Zusicherungen). Die frühere Annahme „Lücke im lokalen Bootstrap" war falsch. `0054`/`0052`: Produktfehler, `audit_writer.tg_emit_vorgang_audit_event` rief `auth.uid()` als `audit_writer` auf, der nie `USAGE` auf `auth` bekommen kann (Kopf von `0028`) → `0076`. `0050` (Tests 38/39/41/42/45/46) und `0052` (Tests 6–8): Default-Grants an `anon`/`authenticated`/`service_role`, die `revoke … from public` nicht entzieht → `0077`; kein Datenleck, weil RLS erzwungen ist, keine DELETE-Policy existiert und die Timeline-Trigger UPDATE/DELETE ablehnen. `0050` Tests 52–54, `0052` 19/22–25 und `0054` 6–7 waren Test-Autorenfehler (`throws_ok` bekam die Beschreibung als erwartete Meldung; Fehlercode bleibt geprüft). **Ausgerollt am 2026-10-02:** `0076`–`0078` liegen seit diesem Tag in der Cloud (siehe Absatz zum Cloud-Migrationsstand). Befund vor dem Rollout (2026-10-01, read-only): Alle Defekte bestanden dort — `audit_writer` ohne `USAGE` auf `auth` bei einem Vorgangs-Emitter, der `auth.uid()` aufrief, sodass jeder Schreibzugriff auf die sieben `vorgang*`-Tabellen mit `42501` scheiterte; `anon`/`authenticated` mit allen vier Rechten auf den `vorgang*`-Tabellen; `anon` und `service_role` konnten `audit_event_feed` und `audit_reveal_event_payload` ausführen; `weg_zugang` ohne Trigger. Kein Drift zum lokalen Stand. Nach dem Rollout sind sie behoben (Nachweis im Absatz zum Cloud-Migrationsstand).
- `embedding`-Repartitionierung (siehe 0010 Header) — beim Skalieren über 1 Tenant hinaus
- `audit_event` Cold-Storage: Tenant-UI bleibt nicht-destruktiv; detach/drop erst nach privilegiertem Export + Manifest + HMAC-Verify-Job.
- Agent-Write-Header TODO: nicht in diesem Sprint implementieren; nur als Risiko dokumentieren.
- Next-16 Deprecations/Workarounds: nicht in diesem Sprint migrieren; nach sauberem Build/Test separat triagieren.
- `auth_leaked_password_protection` — Supabase-Advisor-WARN, verifiziert 2026-07-14: Projekt läuft auf dem Free-Plan, der HaveIBeenPwned-Toggle (Auth → Settings) ist laut Supabase-Doku erst ab Pro-Plan verfügbar. Aktuell nicht schließbar ohne Plan-Upgrade — keine offene Aufgabe, sondern eine Plan-Grenze. Bei Upgrade: Toggle aktivieren und danach `just seed-admin` + `just e2e` laufen lassen, da Seed-/E2E-Passwort `admin1` (`seed-admin.mjs`, `auth.setup.ts`) mit Sicherheit in der HIBP-Liste steht.
- `rls_enabled_no_policy` (17× INFO) — alle `audit_event_*`-Partitions + `embedding_p0`: 0014-Pattern „RLS enabled, keine partition-spezifischen Policies" (zugriff geht über Parent-Tabelle, deren Policies via Partition-Routing greifen — siehe 0014-Header). Linter sieht das nicht, daher INFO-Rauschen.
- `auth_rls_initplan` (7× WARN, Supabase-Advisor, verifiziert 2026-07-13 per read-only MCP-Check gegen Cloud) — RLS-Policies auf `audit_event` (`audit_event_chain_read_for_audit_writer`), `embedding` (`embedding_select_own_tenant`, `_insert_own_tenant`, `_update_own_tenant`, `_delete_own_tenant`), `sollstellung` (`sollstellung_insert_generated`) und `audit_integrity_check` (`audit_integrity_check_insert_internal`) werten `auth.*()`/`current_setting()` pro Zeile statt einmal pro Query aus. Durch die 0055-Hardening nicht vollständig abgedeckt. Reine Performance-Optimierung (Policy-Ausdrücke in `(select ...)` wrappen), nicht sicherheitskritisch; noch keine Migration dafür.
- `duplicate_index` (1× WARN, Supabase-Advisor, verifiziert 2026-07-13) — `public.tenant` hat zwei identische Indizes (`tenant_pkey`, `tenant_tenant_id_id_uk`); einer kann per Migration entfernt werden.
- `authenticated_security_definer_function_executable` (11× WARN, Supabase-Advisor, verifiziert 2026-07-13; seit `0072` kommt `dokument_entfernen` als zwölfte hinzu — vom Nutzer ausdrücklich freigegeben, mit Tenant-Abgleich, `weg_id`-Pflicht und Agenten-Sperre im Funktionskörper, zugesichert im `0069`-Vertrag) — u. a. `create_self_managed_weg_trial`, `create_tenant_invitation`, `accept_tenant_invitation`, `activate_wirtschaftsplan`, `archive_wirtschaftsplan`, `create_nachtragsplan`, `audit_integrity_status`, `audit_verify_chain`, `check_partition_archivable`, `get_archivable_partitions`, `is_partition_detached` sind als `SECURITY DEFINER`-RPCs für `authenticated` aufrufbar. Das ist die vorgesehene App-API-Oberfläche und vermutlich beabsichtigt, war aber bisher nicht als „geprüft und beabsichtigt" dokumentiert — vor einer echten Sicherheitsfreigabe einmal pro Funktion gegenprüfen, ob der jeweilige Business-Guard (Tenant-Check, Rollen-Check) tatsächlich im Funktionskörper sitzt. Kein katalogweiter Guard gegen weiteres Wachstum dieser Liste existiert — `infra/supabase/tests/0055_advisor_hardening.sql` zählt jede Funktion einzeln per `has_function_privilege`-Zusicherung auf, eine dreizehnte fiele keinem Vertrag auf. Details zu `dokument_entfernen`: `docs/agent-reports/2026-09-23-worker-general-dokument-entfernen-definer-rpc.md`.

## Referenzen

- System-Design: [docs/01-system-design.md](./docs/01-system-design.md)
- Architektur & Deployment: [docs/02-architecture-deployment.md](./docs/02-architecture-deployment.md)
- Sicherheitsmodell: [docs/03-security-model.md](./docs/03-security-model.md)
- KI-Architektur: [docs/04-ai-architecture.md](./docs/04-ai-architecture.md)
- UX-Leitprinzipien: [docs/05-ux-principles.md](./docs/05-ux-principles.md)
- Workflows + Risiken: [docs/06-workflows-and-risks.md](./docs/06-workflows-and-risks.md)
- Projektstatus: [PROJECT.md](./PROJECT.md)
- Test-Infrastruktur: [TEST_INFRA.md](./TEST_INFRA.md)
- Finance Lifecycle: [docs/07-finance-lifecycle.md](./docs/07-finance-lifecycle.md)
- Finance-Domänenmodell: [docs/08-finance-domain-model.md](./docs/08-finance-domain-model.md)
- TOM nach Art. 32 DSGVO: [docs/09-tom-art32.md](./docs/09-tom-art32.md)
- Backup und Wiederherstellung: [docs/10-backup-und-wiederherstellung.md](./docs/10-backup-und-wiederherstellung.md)
- Betriebsmodell und Anbieterwahl: [docs/11-betriebsmodell.md](./docs/11-betriebsmodell.md)

## Agentic-Arbeitsregel

Auch wenn der Nutzer eine Aufgabe kurz, unvollstaendig oder unstrukturiert formuliert, arbeitest du immer nach diesem Repository-Prozess:

1. Kontext lesen.
2. Ziel und Nicht-Ziele ableiten.
3. Architektur-, Datenschutz- und Sicherheitsrisiken pruefen.
4. Betroffene Dateien, Migrationen, RLS-Policies und Tests identifizieren.
5. Einen kleinen, nachvollziehbaren Plan erstellen.
6. Nur notwendige Aenderungen umsetzen.
7. Pflicht-Checks ausfuehren.
8. Ergebnis als handfesten Fahrplan berichten.

Wenn etwas riskant oder fachlich unklar ist, triff keine gefaehrliche Annahme. Frage gezielt nach oder waehle die sicherste kleine Umsetzung.

## Vor fachlichen, architektonischen oder sicherheitsrelevanten Aenderungen lesen

- `PROJECT_CONTEXT.md`
- `WORKFLOW.md`
- `TESTING.md`
- `SECURITY.md`
- `docs/01-system-design.md`
- `docs/02-architecture-deployment.md`
- `docs/03-security-model.md`
- `docs/04-ai-architecture.md`
- `docs/06-workflows-and-risks.md`
- `TEST_INFRA.md`
- `PROJECT.md`

## WEG-Verwaltung Safety Rules

- Keine Aenderung an RLS-Policies ohne expliziten Auftrag und Risikoanalyse.
- Keine Aenderung an Audit-Chain, HMAC, Audit-Partitionen oder Append-only-Logik ohne klare Begruendung.
- Keine Migration ohne Zweck, Risiko, betroffene Tabellen, RLS-Auswirkung, Teststrategie und Rollback-/Forward-Fix-Hinweis.
- Keine Supabase-Remote-Aktion ohne ausdrueckliche Freigabe.
- Kein `just db-migrate`, `supabase db push`, `seed-admin`, `just db-dump` oder Cloud-E2E ohne ausdrueckliche Freigabe.
- Ein Datenbank-Export enthaelt personenbezogene Daten. Er gehoert nie in einen Commit, nie in eine Fixture und nie in einen Bericht.
- Tenant-Isolation ist nicht verhandelbar.
- **Keine echten Eigentümerdaten in die Cloud-Datenbank, solange kein Backup existiert.** Das Projekt läuft auf dem Supabase-Free-Plan, der keine automatischen Backups enthält. Nur Demo- und Testdaten. Bedingung und Hintergrund: `docs/11-betriebsmodell.md` § 11.3.
- KI-Agenten bleiben suggestion-only; kritische Writes duerfen nicht durch Agenten ermoeglicht werden.
- Vote-Logik referenziert `ownership_id`, niemals `person_id` oder `user_id`.
- Echte personenbezogene Daten, Cloud-Secrets, JWTs und Supabase-Credentials duerfen nicht gelesen, ausgegeben oder in Fixtures uebernommen werden.

## Pflicht-Checks

Der bevorzugte Abschlussbefehl ist:

```bash
./scripts/verify.sh
```

Wenn der volle Check nicht laufen kann, dokumentiere warum und fuehre eine kleinere passende Ersatzpruefung aus.

Remote-/Cloud-nahe Checks wie `just e2e`, `just db-migrate`, `just db-dump`, `just seed-admin` und Supabase-Linked-Kommandos laufen nur mit ausdruecklicher Freigabe.

## PROJECT_REALITY.md aktuell halten

`PROJECT_REALITY.md` ist das massgebliche Audit-Dokument fuer den realen
Projektstand und darf nicht hinter dem tatsaechlichen Code zurueckfallen.
`scripts/check-project-reality-freshness.sh` prueft deterministisch (git-only,
keine Secrets, keine Cloud-Aufrufe), wie viele Produktcode-Commits seit dem
letzten Refresh-Commit gelandet sind, und listet sie auf. Der Check laeuft:

- informativ als Teil von `./scripts/verify.sh` (blockiert nie),
- als eigener, nicht-blockierender CI-Job `PROJECT_REALITY Freshness`
  (`.github/workflows/project-reality-freshness.yml`) auf PRs, die
  `apps/`, `infra/supabase/migrations/` oder `packages/` aendern.

Der Check schreibt PROJECT_REALITY.md nicht automatisch neu — die inhaltliche
Bewertung (Implemented / Partially implemented / Not verified / Next Logical
Step) bleibt bewusst Menschen-/Agentenurteil und damit an die normalen
Git-Freigaberegeln gebunden. Wenn der Check „STALE" meldet, ist das
Aktualisieren von `PROJECT_REALITY.md` nach derselben Methode Teil der
naechsten groesseren oder riskanten Aufgabe, bevor neue Breite angegangen
wird.

## Git-Regeln

Git-Aktionen sind Teil des kontrollierten Agentenprozesses, aber nicht autonom.

- Keine Commits ohne ausdrueckliche Freigabe des Nutzers.
- Kein Push ohne ausdrueckliche Freigabe des Nutzers.
- Vor jedem Commit oder Push immer `git status` und relevante `git diff`-Ansichten pruefen.
- Nur Dateien stagen, die eindeutig zur freigegebenen Aufgabe gehoeren.
- Fremde, alte oder unklare Worktree-Aenderungen nicht stagen und nicht bereinigen.
- Keine destruktiven Git-Befehle wie `git reset`, `git checkout --`, `git clean` oder Rebase ohne ausdrueckliche Freigabe.
- Vor Commit muss `./scripts/verify.sh` erfolgreich laufen oder das verbleibende Risiko transparent berichtet werden.
- Commit-Message muss Zweck und Scope der Aenderung beschreiben.
- Vor Push muss klar sein, welcher Branch und welches Remote-Ziel verwendet werden.
- Wenn ein PR vorbereitet wird, muss der Agent Zusammenfassung, Tests, Risiken und bewusst nicht enthaltene Aenderungen dokumentieren.

## PR-Fluss (Stand 2026-10-02)

Entstanden aus der Auswertung des Staus bei `0076`-`0078`: drei gestapelte PRs, ein Squash auf einem Stapel, vier Force-Pushes, die der Agent nicht ausfuehren darf, und je Schritt eine eigene Freigabe. Ziel: ein PR ist nach dem Abschluss so schnell wie moeglich geprueft, gemergt und aufgeraeumt.

**Regeln**

1. **Serien statt Stapel.** Abhaengige Aenderungen (etwa Migrationen, die lueckenlos nummeriert sein muessen) gehen in **einen** PR, die Commits bleiben getrennt. Alternativ strikt seriell: PR, CI gruen, Squash-Merge, erst dann der naechste Branch von `main`. Nie auf einem ungemergten Branch aufbauen. Grund: Ein Squash erzeugt neue Hashes, ein gestapelter Folge-PR traegt die alten Commits weiter und wird `CONFLICTING`; die Reparatur ist ein Rebase mit Force-Push.
2. **Vor dem Push lokal pruefen:** `./scripts/verify.sh`, bei SQL zusaetzlich `just test-db-all` (danach `colima stop`).
3. **Eine Aufgabe, ein durchgehender Ablauf:** committen, PR oeffnen, CI abwarten, per Squash mergen, Branch loeschen. Das bleibt an die Git-Regeln unten gebunden: Der Nutzer kann dafuer pro Aufgabe eine Pauschalfreigabe ("committen, PR oeffnen, bei gruen squash-mergen") erteilen; sie gilt nur fuer die genannte Aufgabe und nicht fuer die naechste.
4. **Nie ein Force-Push durch den Agenten** (globale `deny`-Liste). Ein Rebase auf einem veroeffentlichten Branch vermeiden (Regel 1); ist er unvermeidlich, gibt der Agent dem Nutzer genau einen Befehl, den der Nutzer in der Eingabezeile der App ausfuehrt, damit die Ausgabe im Chat ankommt. Der Terminal-Tab ist dafuer nicht verlaesslich lesbar.
5. **`just db-migrate` bleibt Handarbeit** (getipptes `push`) und laeuft nur auf `main` mit `HEAD == origin/main`. Der Rollout-Nachweis (`migration list --linked` plus Katalog-Abfragen, nur Lesen) kommt in den Report derselben Aenderung oder in genau einen Nachtrags-PR, nie in mehrere.
6. **Nach dem Merge aufraeumen:** Branch loeschen (lokal und auf dem Server), `main` per `--ff-only` aktualisieren.
7. **Nach dem Merge den CI-Stand lesen, nicht abfragen.** Die App meldet nur CI-Fehler, nie Erfolg. Der Agent liest den Stand deshalb einmal auf Zuruf und pollt nicht (`gh`-Schleifen, `ScheduleWakeup`, `/loop` sind untersagt).

**Voraussetzungen im Repo, nicht erfuellt (Stand 2026-10-02, gelesen per `gh api`)**

- `allow_auto_merge` ist aus. Mit Auto-Merge muss nicht mehr auf "gruen" gewartet werden.
- Es gibt keinen Branch-Schutz und keine Pflicht-Checks. Ohne Pflicht-Checks mergt Auto-Merge sofort, also vor dem Test. Pflicht-Checks sind daher die Bedingung fuer Auto-Merge, nicht Beiwerk.
- `delete_branch_on_merge` ist aus. Erledigte Branches bleiben liegen.
- `.github/workflows/ci.yml` startet `web`, `agent`, `codegen-drift` und `db-regression` nur fuer PRs gegen `main` (Zeile 20-22). Gestapelte PRs bekommen deshalb nur `link-check` und `freshness-check`. Mit Regel 1 entfaellt das Problem.

Das sind Repo-Einstellungen und damit Sicherheits-/Prozesseinstellungen: Sie setzt der Nutzer oder gibt sie dem Agenten ausdruecklich frei.

**Offene Verbesserung (nicht umgesetzt):** Der Statusabsatz in den Zeilen 7 und 13 dieser Datei und `TEST_INFRA.md` Zeile 22 sind lange Monolithe, die fast jeder PR aendern muss. Sie sind der haeufigste Konfliktherd. Sie gehoeren nach `PROJECT_REALITY.md`, hier bleibt ein Zeiger.

## Verstaendliche Abschlussberichte

Berichte muessen fuer Menschen entscheidungsfaehig sein. Ein technisches Finding allein reicht nicht.

Jeder Abschlussbericht muss enthalten:

- Kurzfazit: erledigt, teilweise erledigt oder blockiert.
- Was bedeutet das? Eine einfache Erklaerung in 1-3 Saetzen.
- Einen handfesten Fahrplan mit konkreten naechsten Schritten in Reihenfolge.
- Pro Schritt: Datei/Bereich, Aktion, kurze Begruendung und ob Freigabe noetig ist.
- Eine empfohlene Entscheidung fuer den Nutzer: freigeben, nicht freigeben oder erst klaeren.
- Git-Status: gestaged, committed, gepusht, naechste Freigabe.
- Wenn nicht gepusht wurde, klar sagen: `Es wurde nichts gepusht.`

Findings muessen dieses Format haben:

- Status: `SUPPORTED`, `PARTIALLY_SUPPORTED`, `INSUFFICIENT_EVIDENCE`, `CONFLICTING` oder `NOT_FOUND`.
- Prioritaet: `P1`, `P2` oder `P3`.
- Problem: Was ist konkret falsch oder unklar?
- Auswirkung: Warum ist das wichtig?
- Naechster Schritt: Was soll konkret getan werden?
- Begruendung: Warum ist dieser Schritt sinnvoll?
