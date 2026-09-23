# Section 9 — Technische und organisatorische Maßnahmen (Art. 32 DSGVO)

> **Zweck.** Dieses Dokument ist die Anlage, die ein Auftragsverarbeitungsvertrag
> nach Art. 28 Abs. 3 lit. c i. V. m. Art. 32 DSGVO verlangt. Es beschreibt die
> Maßnahmen, die **in diesem Repository nachweisbar umgesetzt** sind — und
> trennt sie von denen, die geplant, aber nicht belegt sind.
>
> **Warum diese Trennung so hart gezogen wird.** Eine TOM-Liste wird Vertrags­
> bestandteil. Eine Maßnahme, die darin steht und nicht existiert, ist keine
> Lücke mehr, sondern eine Falschangabe gegenüber dem Verantwortlichen. Deshalb
> trägt jede Zeile einen Nachweis, und alles ohne Nachweis steht in Abschnitt 9.7.
>
> **Stand:** 20. September 2026, Migrationsstand `0067`.
> **Nicht Gegenstand dieses Dokuments:** der AVV selbst, das Verzeichnis von
> Verarbeitungstätigkeiten (Art. 30) und die Frage, ob die GdWE oder der
> Verwalter Verantwortlicher ist (§ 9a WEG, siehe `03-security-model.md` 3.2).

## Statusraster

| Status | Bedeutung |
| --- | --- |
| **belegt** | Im Repository umgesetzt und durch einen ausführbaren Test oder Migrationstext nachweisbar |
| **teilweise** | Umgesetzt, aber ohne automatisierte Absicherung — hält, solange niemand es bricht |
| **offen** | Nicht umgesetzt oder aus diesem Repository nicht belegbar |

---

## 9.1 Trennungskontrolle — Mandantentrennung

Die zentrale Maßnahme dieser Anwendung. Jede WEG gehört zu genau einem
Mandanten, und kein Datensatz verlässt seinen Mandanten.

| Maßnahme | Umsetzung | Nachweis | Status |
| --- | --- | --- | --- |
| Mandantenschlüssel auf jeder Tabelle | `tenant_id uuid not null default public.tenant_id()` | Migrationen `0001` ff., durchgängig in `infra/supabase/migrations/` | belegt |
| Row Level Security je Tabelle | `enable row level security` + Policy `tenant_id = (select public.tenant_id())` | jede Tabellenmigration, katalogweit zugesichert in `infra/supabase/tests/0000_rls_katalog.sql` | belegt |
| Owner-Bypass geschlossen | `force row level security` | dito | belegt |
| Keine Tabelle mit RLS ohne Policy | mindestens eine Policy je Nicht-Partition | `infra/supabase/tests/0000_rls_katalog.sql` | belegt |
| Schema `private` traegt keine Daten | nur Helferfunktionen, keine Tabellen | dito | belegt |
| Mandant stammt aus dem Token, nicht aus der Eingabe | `public.tenant_id()` liest den JWT-Claim; die Anwendung liest ihn über `getClaims()` | `0001`, `apps/web/src/lib/supabase/` | belegt |
| Strukturelle Sperre gegen mandantenübergreifende Verknüpfung | Composite Foreign Keys `(tenant_id, id)` statt `(id)` | z. B. `0061`, `0065`, `0067` | belegt |
| Views umgehen RLS nicht | `with (security_invoker = on)` | `0061` `offener_posten`, `0062` `ruecklage_entwicklung`, `0063` `abrechnung_spitze` | belegt |
| Audit-Tabelle und alle Partitionen isoliert | RLS + FORCE RLS auf Eltern und jeder Partition | `infra/supabase/tests/0046_least_privilege.sql` | belegt |

**Von „teilweise" auf „belegt" — und warum das ein Unterschied ist.**

In der Erstfassung dieses Dokuments stand die Trennungskontrolle auf
„teilweise". Der Zustand war vollständig, die Absicherung fehlte: gegen die
lokale Datenbank auf Migrationsstand `0067` gemessen trugen **61 von 61
Tabellen** in `public` `relrowsecurity` und `relforcerowsecurity` — aber kein
Test ging den Katalog durch. `0046` prüft es für `audit_event` und dessen
Partitionen, `0055` prüft EXECUTE-Grants auf Wrapper-Funktionen. Beides greift
nicht für Tabelle 62.

Seit dem 22. September 2026 schließt `infra/supabase/tests/0000_rls_katalog.sql`
diese Lücke. Der Vertrag ist bewusst strenger als der ursprüngliche Vorschlag in
9.7:

- Er prüft `relkind in ('r','p')` statt nur `'r'` und erfasst damit auch die
  **partitionierten Elterntabellen**. Deren Policies schützen den Zugriff über
  das Partition-Routing — sie dürfen am wenigsten fehlen. Die Messung wuchs
  dadurch von 61 auf **63 von 63 Tabellen**.
- Er prüft zusätzlich, dass jede Nicht-Partition **mindestens eine Policy** hat.
  Eingeschaltetes RLS ohne Policy ist eine verschlossene Tür ohne Schloss.
- Er prüft, dass im Schema `private` **keine Tabelle** liegt. `private` ist für
  PostgREST nicht erreichbar und trägt deshalb keine Policies; eine Tabelle dort
  wäre für jede Mandantenprüfung unsichtbar.
- Er prüft **zuerst**, dass die Katalogabfrage überhaupt Tabellen sieht
  (mindestens 60). Alle anderen Zusicherungen zählen Verstöße und erwarten `0` —
  eine Abfrage, die ins Leere läuft, lieferte ebenfalls `0` und wäre still grün.
  Ohne diese Untergrenze wäre der Vertrag genau der Schein-Test, den er
  verhindern soll.

Der Vertrag wurde gegen einen echten Verstoß geprüft, nicht nur gegen den
Gutfall: eine testweise in `public` angelegte Tabelle ohne RLS ließ drei der
fünf Zusicherungen fallen (RLS, FORCE RLS, fehlende Policy). Ein Test, der nie
rot wird, ist Dekoration.

Damit ist aus einer Konvention eine Invariante geworden: eine neue Tabelle ohne
RLS macht die Suite rot, bevor sie ausgerollt werden kann.

---

## 9.2 Zugriffskontrolle — wer darf was

| Maßnahme | Umsetzung | Nachweis | Status |
| --- | --- | --- | --- |
| Rollenmodell in der Datenbank | `tenant_admin`, `verwalter_mitarbeiter` u. a., geprüft über `public.has_role()` in jeder Policy | Policies in allen Tabellenmigrationen | belegt |
| Eine Policy je Kommando statt `for all` | getrennte `select`/`insert`/`update`/`delete`-Policies mit explizitem `with check` | dito | belegt |
| Anonyme Rolle hat keine Rechte | `revoke all … from public, anon, authenticated, service_role`, danach gezielte Grants | jede Tabellenmigration | belegt |
| SECURITY-DEFINER-Wrapper nur für angemeldete Nutzer | `anon` besitzt kein EXECUTE auf den Audit-Wrappern | `infra/supabase/tests/0055_advisor_hardening.sql` | belegt |
| Interne Hilfsfunktionen sind nicht aufrufbar | `revoke all on function private._… from public, anon, authenticated, service_role` | `0060`, `0065`, `0067` | belegt |
| Passwortrichtlinie, MFA, Schutz vor geleakten Passwörtern | Supabase Auth | — | offen |

**Zur Authentifizierung.** Die Anmeldung läuft über Supabase Auth. Welche
Passwortrichtlinie, welcher Schutz gegen bekannte geleakte Passwörter und ob
Mehrfaktor-Authentifizierung aktiv ist, ist **Konfiguration im Supabase-Projekt
und aus diesem Repository nicht belegbar**. Vor dem ersten AVV ist der Stand dort
zu erheben und hier einzutragen.

---

## 9.3 Eingabekontrolle — Nachvollziehbarkeit von Änderungen

Art. 32 verlangt, nachträglich feststellen zu können, wer welche Daten wann
eingegeben, verändert oder entfernt hat. Dafür gibt es drei Schichten.

| Maßnahme | Umsetzung | Nachweis | Status |
| --- | --- | --- | --- |
| Lückenloses Ereignisprotokoll | `audit_event`, befüllt per `after`-Trigger auf jeder fachlichen Tabelle | `audit_writer.tg_emit_audit_event()`, eingehängt in `0061`–`0067` | belegt |
| Protokoll ist nur anfügbar | drei Schichten: entzogene Rechte, `before update/delete/truncate`-Trigger mit `raise exception`, RLS ohne Update-/Delete-Policy | `infra/supabase/tests/0046_least_privilege.sql` | belegt |
| Manipulation erkennbar | HMAC-Hash-Kette je Zeile, Schlüssel im Supabase Vault | `0045`, `0046`; Vertrag `0002_audit_chain.sql` | belegt |
| Doppelte Identität je Ereignis | App-Identität (`actor_user_id`) **und** Datenbank-Identität (`db_role`) | `03-security-model.md` 3.5 | belegt |
| Regelmäßige Prüfung der Kette | nächtlicher `verify_chain()`-Lauf | — | offen |

**Zur Hash-Kette.** Sie schützt nicht gegen Löschen der ganzen Tabelle, sondern
macht **Veränderung einzelner Zeilen erkennbar**: ohne den Vault-Schlüssel kann
niemand eine gültige Fortsetzung berechnen. Historische Zeilen vor dem
Checkpoint aus `0045` gelten ausdrücklich nicht als v2-verifiziert — siehe die
Incident-Dokumentation in `03-security-model.md` 3.5.

**Der nächtliche Prüflauf ist nicht eingerichtet.** Die Kette ist damit
prüf**bar**, aber nicht laufend geprüft. Eine Manipulation fiele erst bei einer
manuellen Prüfung auf.

---

## 9.4 Kontrolle der Verarbeitung durch die KI

Der Anwendung ist ein KI-Agent beigestellt. Für den AVV ist die entscheidende
Zusage: **er schlägt vor, er schreibt nicht.**

| Maßnahme | Umsetzung | Nachweis | Status |
| --- | --- | --- | --- |
| Agent ist keine Datenbankrolle | Agentenrechte sind ein `actor_type`/GUC, keine Rolle mit Grants | `0046_least_privilege.sql`: „agent is not a DB role" | belegt |
| Schreibsperre auf allen Finanztabellen | `tg_finance_allocation_block_agent_writes()` wirft `42501` | `0061`–`0067`, je ein pgTAP-Fall pro Vertrag | belegt |
| Lebenszyklus-Aktionen für Agenten gesperrt | `erstelle_abrechnung`, `beschliesse_abrechnung`, `erstelle_vermoegensbericht` u. a. prüfen `app.actor_type` | `0063`, `0065` | belegt |
| Pseudonymisierung vor Übergabe an ein Sprachmodell | Klarnamen durch stabile Hash-IDs ersetzen | — | offen |

**Die Pseudonymisierung ist geplant, nicht umgesetzt.** `03-security-model.md`
3.8 beschreibt sie als Zielzustand. Solange sie fehlt, darf kein Prompt mit
Klarnamen von Eigentümern an einen externen Anbieter gehen — das ist eine
**organisatorische** Maßnahme, die der Betreiber einhalten muss, bis die
technische existiert.

---

## 9.5 Verschlüsselung und Weitergabekontrolle

| Maßnahme | Umsetzung | Nachweis | Status |
| --- | --- | --- | --- |
| Verschlüsselung im Transport | TLS zwischen allen Komponenten | Anbieter-Default, Konfiguration nicht aus diesem Repo belegbar | teilweise |
| Verschlüsselung im Ruhezustand | AES-256 auf Speicherebene (Supabase) | Anbieterzusage | teilweise |
| Schlüsselverwaltung | Supabase Vault für den Hash-Ketten-Schlüssel, rotierbar | `0045` | belegt |
| Keine Geheimnisse im Repository | `.env*` ist ausgeschlossen; Secrets liegen in der Plattform | `.gitignore`, `AGENTS.md` | belegt |
| HSTS, Signed URLs mit kurzer Gültigkeit | — | — | offen |

---

## 9.6 Verfahren zur regelmäßigen Überprüfung (Art. 32 Abs. 1 lit. d)

Das ist die Anforderung, die in der Praxis am häufigsten leer bleibt. Hier ist
sie die am besten belegte.

| Maßnahme | Umsetzung | Nachweis | Status |
| --- | --- | --- | --- |
| Datenbankverträge als ausführbare Tests | 19 pgTAP-Verträge, 355 Zusicherungen | `just test-db-all`, Liste im `justfile` | belegt |
| Mandantentrennung katalogweit zugesichert | 5 Zusicherungen über `pg_class`/`pg_policy`, fixture-frei | `just test-security-db`, `infra/supabase/tests/0000_rls_katalog.sql` | belegt |
| Verträge blockieren die Auslieferung | CI-Job `db-regression (pgTAP)` läuft bei jedem Pull Request | `.github/workflows/ci.yml` | belegt |
| Anwendungstests | 524 Unit- und Modultests, Lint, Typprüfung, Build | `./scripts/verify.sh`, CI-Job `web` | belegt |
| Browsertests gegen die echte Umgebung | Playwright-Suite | `just e2e` | belegt |
| Migrationsnummern lückenlos und reviewt | CI-Job `sql-lint` | `.github/workflows/ci.yml` | belegt |
| Ausrollen nur aus geprüftem Stand | `scripts/db-migrate-guard.sh`: nichts Uncommittetes, `HEAD` = `origin/main`, getippte Bestätigung | Migration in `justfile`, Skript im Repo | belegt |

**Zum letzten Punkt.** Bis zum 20. September 2026 konnte jede Datei im
Migrationsverzeichnis in die Produktionsdatenbank gelangen — committet oder
nicht, reviewt oder nicht. Der Guard schließt das. Er ist ausdrücklich
erwähnenswert, weil er eine **organisatorische** Maßnahme (Vier-Augen-Prinzip
über Pull Requests) technisch durchsetzt, statt sie nur zu behaupten.

---

## 9.7 Offene Maßnahmen

Die folgenden Punkte sind **nicht umgesetzt**. Sie gehören in den AVV nur, wenn
sie vorher geschlossen werden — nicht als Zusage.

| Maßnahme | Warum sie fehlt | Vorschlag |
| --- | --- | --- |
| **Verfügbarkeit und Wiederherstellbarkeit** | Der Free-Plan enthält **keine** automatischen Backups (Supabase-Doku, 22.09.2026). Konzept, Exportskript und ein lokaler Drill liegen seit dem 22.09.2026 vor; es fehlen die Plan-Entscheidung, ein Export gegen die Cloud und ein Drill dagegen | [10-backup-und-wiederherstellung.md](./10-backup-und-wiederherstellung.md). Erste Priorität vor dem ersten Kunden — und der Drill hat gezeigt, dass ein logischer Restore die **Audit-Kette nicht** wiederherstellt |
| **Nächtliche Prüfung der Audit-Kette** | Kein Scheduler eingerichtet. Der frühere Blocker — die Funktion meldete nie `intact` — ist behoben | Supabase Cron oder externer Job, der `audit_verify_chain()` je Mandant ruft und auf `status = 'intact'` prüft. Das ist seit `0068` eine belastbare Bedingung; vorher wäre sie dauerhaft rot gewesen (siehe [10-backup-und-wiederherstellung.md](./10-backup-und-wiederherstellung.md) § 10.6) |
| **Löschkonzept** | Der Konflikt zwischen zehnjähriger Aufbewahrung im WEG-Recht und Art. 17 DSGVO ist beschrieben, aber nicht implementiert | `03-security-model.md` 3.2 nennt den Konflikt; es fehlt die Umsetzung |
| **Pseudonymisierung vor KI-Aufrufen** | Geplant, nicht gebaut | Bis dahin organisatorisch: keine Klarnamen in Prompts |
| **Authentifizierungshärtung** | Passwortrichtlinie, MFA, Schutz gegen geleakte Passwörter nicht aus dem Repo belegbar | Stand im Supabase-Projekt erheben und hier eintragen |
| **Monitoring und Alarmierung** | Kein Nachweis | Gehört zum Betrieb, nicht zum Code |
| **Meldeprozess bei Datenpannen** | Art. 33 verlangt 72 Stunden; es gibt keinen dokumentierten Ablauf | Organisatorisch, eine Seite genügt |

### Erledigt: die katalogweite RLS-Prüfung

Dieser Abschnitt enthielt den Vorschlag für eine einzelne Zusicherung. Sie ist
am 22. September 2026 als `infra/supabase/tests/0000_rls_katalog.sql` umgesetzt
worden — in einer strengeren Fassung mit fünf Zusicherungen. Begründung und
Nachweis stehen in 9.1.

Der Vertrag läuft im CI-Gate `db-regression (pgTAP)` und lokal über
`just test-security-db`.

---

## 9.8 Auftragskontrolle — Unterauftragsverarbeiter

Die Kette der Unterauftragsverarbeiter ist in `03-security-model.md` 3.7
beschrieben. Sie enthält ausdrücklich **geplante** Positionen; produktives
Hosting für Web und Agent ist aus diesem Repository nicht belegt.

Nachweisbar in Benutzung ist derzeit:

| Auftragsverarbeiter | Rechtsträger | Zweck | Region | Transfermechanismus |
| --- | --- | --- | --- | --- |
| Supabase | **Supabase Pte. Ltd., Singapur** (Reg. 202005760H), Tochter von Supabase, Inc. (USA) | Datenbank, Authentifizierung, Speicher | Frankfurt | Standardvertragsklauseln |

**Zur Einordnung.** Singapur hat **keinen Angemessenheitsbeschluss** der
EU-Kommission. Das EU-US Data Privacy Framework greift hier **nicht** — es gilt
nur für US-Unternehmen und wird im Auftragsverarbeitungsvertrag nicht erwähnt.
Der Vertrag sagt zu, dass Daten in der gewählten Region gespeichert und primär
dort verarbeitet werden. Über die US-Muttergesellschaft besteht theoretisch
Zugriffsdruck nach US-Recht, unabhängig vom Speicherort.

**Die Liste der Unterauftragsverarbeiter von Supabase liegt nur als PDF vor und
ist hier noch nicht eingearbeitet.** Sie wird für das Art.-30-Verzeichnis
gebraucht.

**Geplante Änderung.** Am 2026-09-22 wurde entschieden, den Betrieb auf
EU-Anbieter umzustellen. Zielbild, geprüfte Alternativen und offene Fragen:
[11-betriebsmodell.md](./11-betriebsmodell.md). Diese Tabelle ist nach dem
Umzug neu zu schreiben — mit dem, was dann tatsächlich läuft.

Jede weitere Position braucht einen eigenen AVV, bevor sie produktiv Daten
verarbeitet. Die Tabelle ist vor dem ersten Kundenvertrag zu vervollständigen —
mit dem, was dann tatsächlich läuft, nicht mit dem, was vorgesehen war.

---

## 9.9 Änderungshistorie

| Datum | Änderung |
| --- | --- |
| 2026-09-20 | Erstfassung, Migrationsstand `0067` |
| 2026-09-22 | § 9.7: Der Blocker vor der nächtlichen Kettenprüfung ist weg — `audit_verify_chain()` meldete nie `intact` (NULL-Falle in `0050`), behoben in `0068`. § 9.6 Zahlen auf 17 Verträge / 330 Zusicherungen. |
| 2026-09-22 | § 9.8 präzisiert: Vertragspartner ist Supabase Pte. Ltd. (Singapur), Tochter einer US-Gesellschaft; Transfer über Standardvertragsklauseln, kein Angemessenheitsbeschluss, kein Data Privacy Framework. Entscheidung zum Umzug auf EU-Anbieter vermerkt (`docs/11-betriebsmodell.md`). |
| 2026-09-22 | Backup-Konzept als § 10 ergänzt; 9.7 präzisiert: der Free-Plan hat gar keine Backups, und ein logischer Restore stellt die Audit-Kette nicht wieder her. Nachweis: `docs/10-backup-und-wiederherstellung.md`. |
| 2026-09-22 | Trennungskontrolle von „teilweise" auf „belegt": `0000_rls_katalog.sql` sichert RLS, FORCE RLS, Policy-Pflicht und das leere Schema `private` katalogweit zu. 9.7 um die erledigte Maßnahme gekürzt. |
| 2026-09-23 | § 9.6 auf 19 pgTAP-Verträge / 355 Zusicherungen und 524 Anwendungstests nachgezogen — Migrationen `0069`-`0071` (Dokumentenablage, Aufbewahrungsfristen) brachten zwei neue Verträge hinzu. Migrationsstand jetzt `0071`, lokal; noch nicht in der Cloud ausgerollt. |
