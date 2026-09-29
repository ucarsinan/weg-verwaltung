# WEG-Verwaltung Agent Report

Datum: `2026-09-29`
Agent/Rolle: `Claude`
Task: `Rollentrennung in der RLS angehen`
Betroffener Worker-Bereich: `Identity/RLS`

## Kurzfazit

Die RLS trennt erstmals nach Rolle — aber nicht so, wie geplant. Die
Eigentümerkette (`person.user_id → ownership → unit → weg`) trägt keine
Sicherheitsgrenze; vier Befunde sprechen dagegen. Stattdessen hält
`public.weg_zugang` explizit fest, wer welche WEG lesen darf. Damit schliesst
sich eine Lücke, die PR #37 nur an der Oberfläche verdeckt hatte.

## Was bedeutet das?

PR #37 hat die Rolle „Eigentümer" aus dem Dashboard ausgesperrt. Das war die
**Oberfläche**, nicht die Grenze: Die Weboberfläche prüft beim Seitenaufbau,
aber die Datenbank-API darunter ist davon unberührt. Wer ein gültiges Token hat,
konnte die Daten weiterhin direkt abrufen — jede WEG, jede Einheit, jede
Eigentümerschaft des Mandanten.

Jetzt entscheidet die Datenbank selbst. Und zwar anhand einer eigenen Liste
„dieser Nutzer darf diese WEG sehen", nicht anhand der Eigentumsverhältnisse.
Das klingt umständlicher, ist aber der Punkt: **Eigentum ist eine Fachtatsache,
Sichtbarkeit eine Zugriffstatsache.** Wer beides gleichsetzt, erbt jede
Ungenauigkeit der Eigentumsdaten als Sicherheitslücke.

## Warum nicht über die Eigentümerkette

Vier Befunde, alle am 2026-09-29 erhoben:

| # | Befund | Folge für eine Sicherheitsgrenze |
| --- | --- | --- |
| `1` | `person.user_id` hat **kein UNIQUE und keinen Fremdschlüssel** (`0003:73`; der Index `0003:83` ist nicht unique) | RLS nähme die **Vereinigung** aller daran hängenden Zeilen. Der Anwendungscode lebt bereits mit „erster gewinnt" (`modules/settings/data.ts:80`, `profile-actions.ts:117`) — für eine Grenze die falsche Semantik |
| `2` | Der Wert stammt aus einem **freien Textfeld** (`person-form.tsx:187`), geprüft nur per UUID-Regex (`personen/actions.ts:72`) | Jeder, der ins Dashboard kommt, kann eine fremde UUID eintragen. Mit einem `security definer`-Helfer wäre das eine mandantenübergreifende Freigabe ohne Einladungsspur |
| `3` | `create_self_managed_weg_trial` (`0057:283-355`) legt **weder Person noch Einheit noch Eigentümerschaft** an | Ein frisch registrierter Selbstverwalter hätte über die Kette keine Sichtbarkeit — ich hätte ihn aus seiner eigenen WEG ausgesperrt |
| `4` | Miteigentümer hängen an `ownership_co_owner` (`0033:38`), nicht an `ownership.person_id` | Bei einem Ehepaar sähe genau einer von beiden seine WEG |

**Kein einziger automatisierter Pfad im Projekt erzeugt heute eine vollständige
Kette.** Sie entsteht nur, wenn ein Verwalter erst eine Eigentümerschaft anlegt
(die die Person **ohne** `user_id` erzeugt) und danach im Personenformular
manuell eine UUID nachträgt.

`0052:754` hatte dieses Vorhaben schon einmal begonnen und bewusst abgebrochen:
*„External roles intentionally get no read policy yet: portal ownership/person
matching is not wired end-to-end."* Diese Migration umgeht das Matching, statt
es zu bauen.

## Findings

| Status | Prioritaet | Problem | Evidenz | Auswirkung | Konkreter Schritt | Begruendung |
| --- | --- | --- | --- | --- | --- | --- |
| `BEHOBEN 0075` | `P1` | ~~Rollentrennung greift nur in der Oberfläche, nicht in der API~~ | `(dashboard)/layout.tsx` prüft beim Rendern; PostgREST unter `/rest/v1/*` ist unberührt | Ein Eigentümer mit gültigem Token las alle WEGs des Mandanten | `weg_zugang` + Policies auf vier Tabellen | Eine Grenze, die nur die Oberfläche kennt, ist keine |
| `BEHOBEN 2026-09-29` | `P2` | ~~Meine eigene Aussage zu `has_role()` war falsch~~ | Ich schrieb am 2026-09-29 „ausschliesslich `tenant_member` und Audit-Konsole"; nachgezählt sind es **11 SELECT-Policies** plus 41 Schreib-Policies | Wer die Doku las, hielt sich für den Ersten | Beide Stellen korrigiert | Eine Sicherheitsdoku, die den Ist-Zustand untertreibt, führt den nächsten in die Irre |
| `SUPPORTED` | `P1` | `person.user_id` ist nicht eindeutig und nicht validiert | Befunde 1 und 2 oben | Kein Schaden heute, weil nichts darauf beruht — aber jede künftige Nutzung als Identitätsanker erbt die Lücke | UNIQUE + Fremdschlüssel; das freie Textfeld entfernen und die Verknüpfung allein über `accept_tenant_invitation` entstehen lassen | Die Funktion bindet dort bereits korrekt an `auth.uid()` |
| `SUPPORTED` | `P2` | `ownership.weg_id` wird nicht gegen `unit.weg_id` abgeglichen | `0003:104-115` erzwingen nur denselben Mandanten; kein Trigger | Eine inkonsistente Zeile könnte sichtbar werden, obwohl ihre Einheit es nicht ist | Trigger oder Prüfung beim Anlegen | Die Policy filtert über `ownership.weg_id`; die Annahme ist im Code benannt |
| `SUPPORTED` | `P2` | `verwalter_mitarbeiter` und `beirat` bleiben undefiniert | `0002:33` definiert sie, keine Lesepolicy wertet sie aus | Nicht erreichbar, weil nicht einladbar — **das ist Zufall, keine Sicherheit** | Zuweisung Mitarbeiter → WEG; `weg_zugang` trägt dieselbe Form | Dieselbe Tabelle löst beide Rollen |
| `SUPPORTED` | `P3` | `0052` prüft zwei Rollen, die es nicht gibt | `buchhaltung`, `auditor_readonly` fehlen im Check von `0002:31-36` | Tote Zweige in 20 Policies | Beim nächsten Anfassen entfernen | Toter Code, der Differenzierung suggeriert |

## Die Entscheidungen, die Erklärung brauchen

**Sperrliste, keine Positivliste.** Eingeschränkt wird genau `eigentuemer`; jede
andere oder fehlende Rolle kommt durch. Eine Positivliste würde bei nicht
registriertem Access-Token-Hook jeden aussperren — derselbe Fehler, den die
Claims-Prüfung der Weboberfläche seit PR #33 vermeidet. Der Preis ist benannt:
Eine neue eingeschränkte Rolle muss ausdrücklich hinzu.

**Der Helfer ist `security invoker`, nicht `definer`.** Er liest `weg_zugang`,
dessen eigene Policy greift; eine Rekursion entsteht nicht, weil `weg_zugang` in
keiner der geänderten Policies vorkommt. Das vermeidet zugleich die
FORCE-RLS-Falle und den `LEAKPROOF`-Ausnahmeweg, den
`docs/03-security-model.md` Punkt 7 verbietet und den dieses Projekt nie
betreten hat.

**`feststellen_resolution` geht mit.** Sie ist `security invoker` (`0049:346`)
und zählt `ownership`-Zeilen für die Mehrheit (`0049:464-471`) sowie MEA aus
`unit` (`0049:477-493`). Mit gefilterten Tabellen fiele `v_total_eligible` auf
den eigenen Anteil und der Beschluss würde **still falsch festgestellt** — kein
Fehler, nur ein falsches Ergebnis. Die Funktion weist die Rolle jetzt ab;
Feststellung ist ein Verwalterakt. Der Körper wurde **mechanisch** aus `0049`
kopiert und per Diff gegengeprüft: genau eine Einfügung, sonst byte-identisch.

## Ein Fehler, den der Vertrag gefangen hat

Die erste Fassung der Policies benutzte `= any ((select public.sichtbare_weg_ids()))`
— die doppelte Klammer aus `0055`. Der pgTAP-Lauf brach ab:
`operator does not exist: uuid = uuid[]`.

Die Klammerform aus `0055` gilt für **skalare** Ausdrücke. Bei einer Menge liest
Postgres `ANY (subquery)` und vergleicht `uuid` gegen `uuid[]`. Richtig ist
`in (select …)` mit einem mengenwertigen Helfer — das ergibt einen gehashten
SubPlan, also dasselbe Ziel: einmal je Anweisung statt einmal je Zeile.

Der Fehler wäre ohne den Vertrag erst beim Ausrollen aufgefallen.

## Geaenderte Dateien

- `infra/supabase/migrations/0075_weg_zugang.sql`: neu
- `infra/supabase/tests/0075_weg_zugang.sql`: neu — **der erste Vertrag des
  Projekts mit einer `eigentuemer`-Fixture**. Alle anderen setzen
  `tenant_admin` oder `verwalter_mitarbeiter`; die Policy wäre sonst ungeprüft
  geblieben. Mit `set local role authenticated` (Muster `0069:65-67`) — ohne die
  Zeile bliebe die Sitzung Tabelleneigentümer mit BYPASSRLS und der Vertrag
  still grün
- `apps/web/src/lib/supabase/__tests__/weg-zugang-0075.test.ts`: neu
- `justfile`: `0075` an `SECURITY_DB_TESTS`
- `AGENTS.md`, `docs/03-security-model.md`: Korrektur **und** neuer Stand
- `TEST_INFRA.md`, `PROJECT_REALITY.md`

## Betroffene Systembereiche

- RLS/Audit/HMAC/Migrationen: **vier SELECT-Policies ersetzt**, eine Tabelle neu,
  ein Helfer neu, `feststellen_resolution` ersetzt
- Web-App/Fachmodule: **nicht geändert.** Die App liest `weg_zugang` nicht
- Agent/Guardrails/RAG: liest `beschluss_sammlung_entry` unter Nutzer-JWT
  (`versammlung_tools.py:230`) — für einen Eigentümer künftig gefiltert, heute
  folgenlos, weil kein Eigentümer ins Dashboard kommt

## Bewusst nicht enthalten

- **`person`.** Braucht eine Einschränkung auf **Spaltenebene**: Name und
  Anschrift dürfen Miteigentümer sehen, E-Mail und Telefon sind freiwillige
  Angaben und brauchen Zustimmung. RLS arbeitet zeilenweise; Spalten-Grants
  wirken pro Datenbankrolle, und alle App-Nutzer sind `authenticated`. Das
  einzige Präzedenz im Projekt ist `0044:8-9` für die interne Rolle
  `audit_writer`.
- **Die Finanztabellen.** `tests/0056:106-172` ist eine geschlossene Welt aus
  genau sechzehn Policies; eine zusätzliche dort macht den Vertrag rot.
- **Eine Oberfläche zum Vergeben von Zugang.** `weg_zugang` startet leer. Sie
  kommt mit der Eigentümersicht, denn erst dann gibt es etwas zu sehen.

## Checks

| Check | Ergebnis | Hinweis |
| --- | --- | --- |
| `just test-db-all` | `pass` | **22 Dateien, 420 Zusicherungen** (vorher 404), gegen eine ephemere lokale Datenbank. Alle bestehenden Verträge weiter grün, besonders `0000_rls_katalog` (die neue Tabelle braucht RLS, FORCE und eine Policy) und `0056:175-189` (SELECT-Policies müssen `tenant_id` enthalten) |
| `./scripts/verify.sh` | `pass` | **592 Web-Tests** (vorher 583) |

**Kein E2E für den Eigentümerpfad.** `apps/web/scripts/seed-admin.mjs:67`
weigert sich, einen `eigentuemer` zu säen. Das zu ändern wäre ein eigener
Schritt; der pgTAP-Vertrag trägt den Nachweis.

## Security-Check

- Secrets gelesen oder ausgegeben? `nein`
- Produktive Daten beruehrt? `nein`
- Externe Dienste kontaktiert? `nein`
- Sensible Daten geloggt? `nein`

## Entscheidung fuer den Nutzer

- Empfohlene Entscheidung: `freigeben`, danach `just db-migrate`
- Begruendung: Die Änderung nimmt niemandem etwas weg — `weg_zugang` startet
  leer, und die eingeschränkte Rolle kommt ohnehin nicht ins Dashboard. Sie
  schliesst die API-Lücke, die PR #37 offengelassen hat.
- Naechste Nutzeraktion: Commit und Push freigeben; nach dem Merge ausrollen.
  Die Reihenfolge ist diesmal unkritisch, weil die App `weg_zugang` nicht liest.
