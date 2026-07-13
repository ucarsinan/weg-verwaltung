# WEG-Verwaltung Agent Report

Datum: 2026-07-13
Agent/Rolle: Claude (Sonnet 5)
Task: Finanzbereich vertiefen — Luecke aus Migration 0056 schliessen (Sollstellung-Generator nutzt Wirtschaftsplan-Positionen statt nur MEA)
Betroffener Worker-Bereich: Worker E (Finance und Hausgeld)

## Kurzfazit

Teilweise erledigt. Migration `0060` plus zugehoerige UI und Tests sind vollstaendig implementiert, lokal typecheck-/lint-/build-/Vitest-gruen (224 Tests). Der neue pgTAP-Vertrag `infra/supabase/tests/0060_wirtschaftsplan_position_allocation.sql` konnte in dieser Sandbox **nicht ausgefuehrt werden** (kein Docker-Daemon, keine Supabase-CLI) und wurde stattdessen per sorgfaeltiger manueller SQL-Pruefung plus Vitest-Text-Pattern-Tests abgesichert. Der Test laeuft aber automatisch im bestehenden CI-Job `db-regression`, sobald gepusht.

## Was bedeutet das?

WEGs mit gemischten Kostenverteilungen (z. B. Verwaltung nach MEA, Hausmeister gleichmaessig, Gartenpflege nach Flaeche) koennen das jetzt ueber Verteilungsschluessel + Wirtschaftsplan-Positionen abbilden; bei Aktivierung berechnet der Generator die Sollstellung pro Einheit korrekt aus der Summe aller Positionen. Plaene ohne Positionen funktionieren exakt wie bisher (reine MEA-Berechnung). Der Fall „Heizkosten 70/30" (`typ = 'gemischt'`) ist bewusst noch nicht geloest, weil das bestehende Schema aus `0056` nicht eindeutig festlegt, welche Basiswerte zu welchem Teil eines gemischten Schluessels gehoeren — das braucht zuerst eine Design-Entscheidung, keine geratene Umsetzung.

## Handfester Fahrplan

| Reihenfolge | Schritt | Datei/Bereich | Warum? | Freigabe noetig? |
| --- | --- | --- | --- | --- |
| `1` | Aenderungen committen | alle unten gelisteten Dateien | Speichert Migration 0060 + UI + Tests + Docs | ja |
| `2` | Push, PR-CI abwarten | `db-regression`-Job in `.github/workflows/ci.yml` | Einziger Weg, den neuen pgTAP-Test in dieser Session real auszufuehren (kein Docker lokal) | ja |
| `3` | Bei CI-Gruen: `just test-finance-db` einmal lokal mit Docker gegenlaufen lassen, bevor produktiv migriert wird | `infra/supabase/tests/0060_*.sql` | Zusaetzliche Bestaetigung ausserhalb CI | nein (informell, keine Cloud-Beruehrung) |
| `4` | `gemischt`-Verteilungsschluessel als eigenen Slice planen | `docs/08-finance-domain-model.md` | Braucht eine Schema-Entscheidung (Basiswert-Zuordnung je Teil), bewusst nicht in diesem Slice geloest | erst klaeren |

## Entscheidung fuer den Nutzer

- Empfohlene Entscheidung: freigeben (Commit + Push), danach CI-Ergebnis des `db-regression`-Jobs abwarten und pruefen, bevor mit `gemischt` oder weiterer Finance-Breite (Forderungen, Zahlungen) weitergemacht wird.
- Begruendung: Alle lokal moeglichen Checks sind gruen; der Sollstellung-Generator hat aber eine Incident-Historie (0039-0048 Audit-Vorfall-Kette in `PROJECT.md`), daher sollte der echte pgTAP-Lauf (jetzt in CI verdrahtet) abgewartet werden, bevor weiter darauf aufgebaut wird.
- Naechste Nutzeraktion: Commit/Push freigeben.

## Findings

| Status | Prioritaet | Problem | Evidenz | Auswirkung | Konkreter Schritt | Begruendung |
| --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED` | `P2` | Migration `0060` und ihr pgTAP-Test wurden nie gegen eine echte Postgres-Instanz ausgefuehrt | Diese Sandbox: `docker ps` -> "no such file or directory" (kein Daemon), `supabase`-CLI nicht installiert | Trotz sorgfaeltiger manueller SQL-Pruefung bleibt ein Restrisiko fuer PL/pgSQL-Syntaxfehler oder Logikfehler, die erst zur Laufzeit auffallen | CI-Job `db-regression` nach Push abwarten; bei Fehlschlag sofort nachbessern statt den Test abzuschwaechen | Der einzige Weg in dieser Session, echte DB-Feedback zu bekommen |
| `SUPPORTED` | `P3` | `typ = 'gemischt'` ist im 0056-Schema nicht eindeutig fuer den Generator aufloesbar | `verteilungsschluessel_basiswert` referenziert genau eine `verteilungsschluessel_version`, das `parameter`-JSON eines gemischten Schluessels (`{"parts":[...]}`) hat aber keine Referenz auf separate Basiswert-Versionen je Teil | Heizkosten-Splits (gesetzlich haeufig 50-70% Verbrauch) sind vorerst nicht automatisch berechenbar; Aktivierung schlaegt bewusst mit `errcode 0A000` fehl | Vor einer Umsetzung: Schema-Entscheidung treffen, wie Teile eines gemischten Schluessels ihre Basiswerte referenzieren | Verhindert eine geratene, falsche Geldverteilung |

## Geaenderte Dateien

- `infra/supabase/migrations/0060_wirtschaftsplan_position_allocation.sql`: [NEW] Erweitert `private._generate_sollstellungen_for_plan` um Positions-basierte Verteilung; neue interne Funktion `private._verteilungsschluessel_version_unit_shares`; MEA-Fallback unveraendert; `gemischt`/fehlende Basiswerte fail-closed.
- `infra/supabase/tests/0060_wirtschaftsplan_position_allocation.sql`: [NEW] Fixture-basierter pgTAP-Vertrag: MEA-Regression, Mixed-Key-Summierung (3 Einheiten), fehlender Basiswert, `gemischt`, Agent-Guard.
- `apps/web/src/lib/supabase/__tests__/wirtschaftsplan-position-allocation-0060.test.ts`: [NEW] Vitest-Text-Pattern-Test auf die Migrationsquelle (8 Tests).
- `apps/web/src/lib/supabase/database.types.ts`: [MODIFIED] Handgepflegte TS-Typen fuer die 4 `0056`-Tabellen ergaenzt (existierten bisher gar nicht, siehe Drift-Notiz in `docs/agent-reports/2026-07-13-worker-f-*`-Recherche).
- `apps/web/src/app/(dashboard)/wegs/[id]/finanzen/verteilungsschluessel/`: [NEW] Liste, Anlegen (Schluessel + erste Version), Detailseite mit Basiswert-Pflege je Einheit.
- `apps/web/src/app/(dashboard)/wegs/[id]/finanzen/[planId]/positionen/`: [NEW] Positionen auflisten/anlegen/loeschen, nur im Entwurf.
- `apps/web/src/app/(dashboard)/wegs/[id]/finanzen/page.tsx`: [MODIFIED] Link zu Verteilungsschluessel ergaenzt.
- `apps/web/src/app/(dashboard)/wegs/[id]/finanzen/[planId]/edit/wirtschaftsplan-edit-form.tsx`: [MODIFIED] Link zu Positionen ergaenzt (nur Entwurf).
- `justfile`: [MODIFIED] `test-finance-db` faehrt jetzt auch `0060`.
- `.github/workflows/ci.yml`: [MODIFIED] `db-regression`-Job faehrt jetzt auch `0060` (echte Ausfuehrung in CI, kein `--linked`).
- `docs/08-finance-domain-model.md`: [MODIFIED] Roadmap-Status, neue Invarianten 9-10, Abschnitt „Generator-Anbindung (0060)", Test-Luecke dokumentiert.
- `PROJECT_REALITY.md`: [MODIFIED] Stand nachgezogen.
- Dieser Report.

## Betroffene Systembereiche

- RLS/Audit/HMAC/Migrationen: Neue Migration `0060`. Keine RLS-Policy-Aenderung, keine Grant-Aenderung an Bestandstabellen, keine Aenderung an `activate_wirtschaftsplan()`/`archive_wirtschaftsplan()`/`create_nachtragsplan()`. Aendert ausschliesslich den internen, bereits privaten Generator (`private._generate_sollstellungen_for_plan`) plus eine neue interne Hilfsfunktion — beide weiterhin `SECURITY DEFINER`, `search_path=''`, `revoke all` von allen API-Rollen.
- Web-App/Fachmodule: Neue Routen unter `/wegs/[id]/finanzen/verteilungsschluessel*` und `/wegs/[id]/finanzen/[planId]/positionen`.
- Agent/Guardrails/RAG: Keine Aenderung; Agent-Write-Block auf den 0056-Tabellen bleibt unangetastet und wird im neuen pgTAP-Test erneut geprueft.
- Meetings/Votes/Beschluss-Sammlung: Keine Aenderung.
- Finance/Hausgeld: Kernstueck dieser Aenderung (siehe oben).
- CI/Tooling/Dokumentation: `justfile`, `ci.yml`, `docs/08-finance-domain-model.md`, `PROJECT_REALITY.md`.

## Architektur- und Securitycheck

- RLS/Tenant-Isolation beruehrt? nein (keine Policy-/Grant-Aenderung; neue interne Funktion ist `SECURITY DEFINER` + internal-only, analog zum bestehenden Generator)
- Audit/HMAC/Append-only beruehrt? nein
- Migrationen beruehrt? ja — neue Migration `0060`, siehe Risk-posture-Header in der Datei selbst
- Agent-Write-Grenzen beruehrt? nein (bestehender Agent-Block auf `wirtschaftsplan_position`/`verteilungsschluessel*` unveraendert, im neuen Test erneut verifiziert)
- Remote-/Cloud-Systeme beruehrt? nein in dieser Session (kein Docker/keine Cloud-Credentials verfuegbar); der Test laeuft aber automatisch gegen eine lokale Ephemeral-DB in GitHub Actions nach Push
- ADR oder Decision-Eintrag erforderlich? nein, aber `gemischt`-Aufloesung braucht vor Umsetzung eine explizite Design-Entscheidung (siehe Findings)

## Ausgefuehrte Checks

| Check | Ergebnis | Hinweis |
| --- | --- | --- |
| `pnpm --filter @weg-verwaltung/web typecheck` | pass | |
| `pnpm --filter @weg-verwaltung/web lint` | pass | |
| `pnpm --filter @weg-verwaltung/web test` | pass | 224 Tests (39 Dateien), 16 davon neu |
| `pnpm --filter @weg-verwaltung/web build` (`next build`) | pass | Alle neuen Routen korrekt registriert |
| `git diff --check` / Whitespace-/EOF-Check | pass | |
| `just test-finance-db` (0060 pgTAP) | **nicht ausgefuehrt** | Kein Docker-Daemon in dieser Sandbox; Migration + Test von Hand sorgfaeltig geprueft, laeuft automatisch in CI nach Push |
| `just test-agent` | nicht ausgefuehrt | Kein Agent-Code in diesem Slice beruehrt |
| `just e2e` | nicht ausgefuehrt | Unveraendert seit vorigem Report — keine Cloud-Credentials in dieser Sandbox |

## Git-Status

- Dateien gestaged? nein
- Commit erstellt? nein
- Push ausgefuehrt? nein
- Wenn nein: Was fehlt fuer Commit/Push? Ausdrueckliche Nutzerfreigabe.
- Vorgeschlagene Stage-Dateien: alle unter „Geaenderte Dateien" gelisteten Pfade.
- Bewusst ausgeschlossene Dateien: keine.
- Vorgeschlagene Commit-Message: `feat(finance): wire Sollstellung generator to Wirtschaftsplan positions (0060)`
- Push-Ziel: `origin/claude/next-logical-step-nrxu09`

## Security-Check

- Secrets gelesen oder ausgegeben? nein
- Produktive Daten beruehrt? nein
- Externe Dienste kontaktiert? nein
- Sensible Daten geloggt? nein

## Bewusst nicht geaendert

- `typ = 'gemischt'` bleibt ungeloest (siehe Findings).
- Kein Datumsgueltigkeits-Check zwischen `wirtschaftsplan_position` und der referenzierten `verteilungsschluessel_version` (bewusst ausserhalb des Slices, um den bestehenden 0056-Entwurfstrigger nicht zusaetzlich anzufassen).
- Kein RPC fuer „Schluessel + Version in einem Schritt anlegen" — die UI macht das ueber zwei Inserts mit kompensierendem Loeschen bei Fehlschlag, statt eine neue Migration nur dafuer zu schreiben.
- Kein Fix fuer die bereits vorher bekannte Drift in `PROJECT.md`s „Interface Contracts"-Abschnitt (fehlende 0047/0056-Dokumentation) — ausserhalb des Slice-Scopes, als Folgeaufgabe belassen.

## Risiken

| Risiko | Bedeutung | Naechster Schritt |
| --- | --- | --- |
| Migration 0060 nie live getestet in dieser Session | PL/pgSQL-Syntax- oder Logikfehler koennten erst in CI/Cloud auffallen | CI-Job `db-regression` nach Push zwingend abwarten, nicht uebergehen |
| `database.types.ts`-Handpflege koennte von einer echten `supabase gen types`-Generierung abweichen | Zukuenftige echte Codegen-Laeufe koennten Konflikte mit den handgepflegten Typen zeigen | Beim naechsten `just codegen`/`supabase gen types`-Lauf gegen Cloud pruefen und die `Overwrite`-Bloecke ggf. entfernen, falls der generierte Snapshot dann die 0056-Tabellen enthaelt |
| Race Condition bei paralleler Positions-Anlage (`position`-Spalte via COUNT+1) | Zwei gleichzeitige Submits koennten kollidieren | Unique-Constraint faengt das ab (23505, freundliche Fehlermeldung); kein Datenverlust, nur Retry noetig — akzeptiert fuer dieses Admin-only-UI |

## Folgeaufgaben

| Prioritaet | Aufgabe | Begruendung |
| --- | --- | --- |
| `P1` | `just test-finance-db` (0060) real ausfuehren (CI oder lokal mit Docker) und Ergebnis in `PROJECT_REALITY.md` zurueckschreiben | Schliesst die einzige verbliebene Verifikationsluecke dieses Slices |
| `P2` | Design-Entscheidung fuer `gemischt`-Verteilungsschluessel treffen | Blockiert Heizkostenabrechnung nach HeizkostenV |
| `P3` | `PROJECT.md`s „Interface Contracts" auf `0047`/`0056`/`0060`-Stand nachziehen | Bereits vor diesem Slice bekannte, unabhaengige Dokulücke |

---

Es wurde nichts gepusht.
