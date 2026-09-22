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
| Row Level Security je Tabelle | `enable row level security` + Policy `tenant_id = (select public.tenant_id())` | jede Tabellenmigration | teilweise |
| Owner-Bypass geschlossen | `force row level security` | dito | teilweise |
| Mandant stammt aus dem Token, nicht aus der Eingabe | `public.tenant_id()` liest den JWT-Claim; die Anwendung liest ihn über `getClaims()` | `0001`, `apps/web/src/lib/supabase/` | belegt |
| Strukturelle Sperre gegen mandantenübergreifende Verknüpfung | Composite Foreign Keys `(tenant_id, id)` statt `(id)` | z. B. `0061`, `0065`, `0067` | belegt |
| Views umgehen RLS nicht | `with (security_invoker = on)` | `0061` `offener_posten`, `0062` `ruecklage_entwicklung`, `0063` `abrechnung_spitze` | belegt |
| Audit-Tabelle und alle Partitionen isoliert | RLS + FORCE RLS auf Eltern und jeder Partition | `infra/supabase/tests/0046_least_privilege.sql` | belegt |

**Warum „teilweise" bei RLS und FORCE RLS.** Der Zustand ist heute vollständig,
die Absicherung fehlt.

Gegen die lokale Datenbank auf Migrationsstand `0067` gemessen (20.09.2026):
**61 von 61 Tabellen** in `public` tragen `relrowsecurity` **und**
`relforcerowsecurity`. Keine Ausnahme.

Es gibt aber **keinen Test, der den Katalog durchgeht**. `0046` prüft es für
`audit_event` und dessen Partitionen, `0055` prüft EXECUTE-Grants auf
Wrapper-Funktionen. Beides greift nicht für Tabelle 62. Eine künftige Tabelle
ohne RLS fiele niemandem auf, bis jemand sie sucht — und bis dahin wäre die
Mandantentrennung für diese Tabelle nicht wirksam.

Deshalb „teilweise": die Maßnahme ist umgesetzt, aber sie beruht auf Disziplin
statt auf einer Prüfung.

Das ist die wichtigste offene Absicherung dieses Dokuments und in 9.7 als
Maßnahme aufgeführt.

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
| Datenbankverträge als ausführbare Tests | 15 pgTAP-Verträge, 319 Zusicherungen | `just test-db-all`, Liste im `justfile` | belegt |
| Verträge blockieren die Auslieferung | CI-Job `db-regression (pgTAP)` läuft bei jedem Pull Request | `.github/workflows/ci.yml` | belegt |
| Anwendungstests | 452 Unit- und Modultests, Lint, Typprüfung, Build | `./scripts/verify.sh`, CI-Job `web` | belegt |
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
| **Katalogweite RLS-Prüfung** | Kein Test geht alle Tabellen in `public` durch; heute sind 61 von 61 in Ordnung, aber nichts hält das fest | pgTAP-Vertrag, der `pg_class` gegen `relrowsecurity and relforcerowsecurity` prüft. Klein und hochwirksam — siehe unten. Gegen den aktuellen Stand gemessen: er wäre sofort grün |
| **Verfügbarkeit und Wiederherstellbarkeit** | Kein Backup-Regime, keine getestete Wiederherstellung, kein RPO/RTO | Ohne das ist Art. 32 Abs. 1 lit. b und c nicht erfüllt. Erste Priorität vor dem ersten Kunden |
| **Nächtliche Prüfung der Audit-Kette** | Kein Scheduler eingerichtet | Supabase Cron oder externer Job, der `audit_verify_chain()` je Mandant ruft |
| **Löschkonzept** | Der Konflikt zwischen zehnjähriger Aufbewahrung im WEG-Recht und Art. 17 DSGVO ist beschrieben, aber nicht implementiert | `03-security-model.md` 3.2 nennt den Konflikt; es fehlt die Umsetzung |
| **Pseudonymisierung vor KI-Aufrufen** | Geplant, nicht gebaut | Bis dahin organisatorisch: keine Klarnamen in Prompts |
| **Authentifizierungshärtung** | Passwortrichtlinie, MFA, Schutz gegen geleakte Passwörter nicht aus dem Repo belegbar | Stand im Supabase-Projekt erheben und hier eintragen |
| **Monitoring und Alarmierung** | Kein Nachweis | Gehört zum Betrieb, nicht zum Code |
| **Meldeprozess bei Datenpannen** | Art. 33 verlangt 72 Stunden; es gibt keinen dokumentierten Ablauf | Organisatorisch, eine Seite genügt |

### Vorschlag für die katalogweite RLS-Prüfung

Der kleinste Schritt mit dem größten Effekt. Eine Zusicherung genügt:

```sql
select is(
  (select count(*)::int
     from pg_catalog.pg_class c
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and not (c.relrowsecurity and c.relforcerowsecurity)),
  0,
  'jede Tabelle in public hat RLS und FORCE RLS'
);
```

Damit wird aus der Konvention eine Invariante: eine neue Tabelle ohne RLS macht
die Testsuite rot, bevor sie ausgerollt werden kann.

Die Zusicherung wurde gegen den Stand `0067` gemessen und liefert heute `0` —
sie ließe sich also einführen, ohne etwas reparieren zu müssen.

---

## 9.8 Auftragskontrolle — Unterauftragsverarbeiter

Die Kette der Unterauftragsverarbeiter ist in `03-security-model.md` 3.7
beschrieben. Sie enthält ausdrücklich **geplante** Positionen; produktives
Hosting für Web und Agent ist aus diesem Repository nicht belegt.

Nachweisbar in Benutzung ist derzeit:

| Auftragsverarbeiter | Zweck | Region |
| --- | --- | --- |
| Supabase | Datenbank, Authentifizierung, Speicher | Frankfurt |

Jede weitere Position braucht einen eigenen AVV, bevor sie produktiv Daten
verarbeitet. Die Tabelle ist vor dem ersten Kundenvertrag zu vervollständigen —
mit dem, was dann tatsächlich läuft, nicht mit dem, was vorgesehen war.

---

## 9.9 Änderungshistorie

| Datum | Änderung |
| --- | --- |
| 2026-09-20 | Erstfassung, Migrationsstand `0067` |
