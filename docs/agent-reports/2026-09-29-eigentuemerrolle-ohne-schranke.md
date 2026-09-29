# WEG-Verwaltung Agent Report

Datum: `2026-09-29`
Agent/Rolle: `Claude`
Task: `Eigentuemersicht als Produktentscheidung vorbereiten`
Betroffener Worker-Bereich: `Identity/RLS, Einstellungen`

## Kurzfazit

Die Vorbereitung der Produktentscheidung hat sie ueberholt. Die Rolle
`eigentuemer` ist einladbar — bis heute sogar **voreingestellt** —, hat aber
keine eigene Ansicht und keine eigene Zeilenfilterung. Wer so eingeladen wurde,
bekam das vollstaendige Verwalter-Dashboard, lesend und schreibend, fuer alle
WEGs des Mandanten. Der Zugang ist jetzt gesperrt; die Produktentscheidung
bleibt offen.

## Was bedeutet das?

Die Software kennt seit ihrer zweiten Migration eine Rolle „Eigentuemer". Im
Einladungsformular war sie die Voreinstellung: Wer jemanden einlud und die Rolle
nicht bewusst umstellte, lud ihn als Eigentuemer ein.

Nur: Fuer diese Rolle wurde nie etwas gebaut. Die Datenbank entscheidet
ausschliesslich nach Mandant, wer welche Zeile sieht — nicht nach Rolle. Ein so
eingeladener Eigentuemer landete deshalb im normalen Verwalterprogramm und sah
dort die Daten **aller** Einheiten aller Gemeinschaften dieses Mandanten. Und er
konnte sie aendern.

Es ist bisher nichts passiert: Es gibt keine echten Eigentuemer im System, und
die Projektregel verbietet echte Daten in der Cloud-Datenbank. Die Luecke haette
sich beim ersten echten Mandanten geschlossen — in die falsche Richtung, weil
die Oberflaeche zum Einladen einlud.

## Handfester Fahrplan

| Reihenfolge | Schritt | Datei/Bereich | Warum? | Freigabe noetig? |
| --- | --- | --- | --- | --- |
| `1` | Rolle vom Dashboard fernhalten | `(dashboard)/layout.tsx` | Schliesst die Luecke an der einen Stelle, durch die alle Verwalterseiten laufen | nein |
| `2` | Landeplatz mit Abmelden | `app/kein-zugang/page.tsx` | Ohne Ausgang waere die Sperre eine neue Sackgasse (vgl. Befund 3) | nein |
| `3` | Rolle aus der Einladung nehmen | `tenant-invitation-form.tsx`, `invitation-actions.ts` | Keine Voreinstellung mehr, und die Action weist die Rolle ab | nein |
| `4` | Sicherheitsdoku richtigstellen | `docs/03-security-model.md` | Sie beschrieb Rollenrechte als Stand, die nie gebaut wurden | nein |
| `5` | Entscheiden, ob eine Eigentuemersicht gebaut wird | — | Erst dann ergibt die Rolle wieder Sinn | ja |

## Entscheidung fuer den Nutzer

- Empfohlene Entscheidung: `freigeben`
- Begruendung: Die Aenderung nimmt nichts weg, was heute jemand benutzt — es gibt
  keine echten Eigentuemer. Sie ersetzt „sieht alles" durch „kommt nicht rein",
  was dem tatsaechlichen Stand entspricht, und haelt die Produktentscheidung offen.
- Naechste Nutzeraktion: Commit und Push freigeben; danach entscheiden, ob eine
  Eigentuemersicht gebaut wird.

## Findings

| Status | Prioritaet | Problem | Evidenz | Auswirkung | Konkreter Schritt | Begruendung |
| --- | --- | --- | --- | --- | --- | --- |
| `BEHOBEN 2026-09-29` | `P1` | ~~Rolle `eigentuemer` erhaelt das volle Verwalter-Dashboard~~ | `tenant-invitation-form.tsx:115` (`defaultValue="eigentuemer"`); RLS der Fachtabellen nur `using (tenant_id = …)`; `has_role()` nur in `0008:56`, `0050`, `0035`; `(dashboard)/layout.tsx` prueft nur `tenantId` | Ein eingeladener Eigentuemer sieht und aendert alle WEGs des Mandanten | Layout-Riegel, Landeplatz, Einladung schliessen | Sicherheit: Mandantentrennung greift, Rollentrennung nicht |
| `SUPPORTED` | `P2` | `docs/03-security-model.md` beschrieb Rollenrechte als Stand, die nie gebaut wurden | `§ Rollen-Modell`: „sieht zugewiesene WEGs", „eingeschraenkter Read-Zugang", „sieht eigene Daten" | Wer die Doku liest, glaubt an Schutz, den es nicht gibt | Warnblock eingefuegt; die Liste ist als Entwurf gekennzeichnet | Eine Sicherheitsdoku, die mehr verspricht als der Code, ist gefaehrlicher als keine |
| `SUPPORTED` | `P3` | `verwalter_mitarbeiter` und `beirat` sind ebenso undefiniert | `0002:33` definiert sie, keine RLS wertet sie aus | Heute nicht erreichbar, weil nicht einladbar (`TENANT_INVITATION_ROLES`) | Beim Entwurf der Rollentrennung mitbehandeln | Latente Wiederholung desselben Musters |
| `SUPPORTED` | `P2` | `saas-onboarding.spec.ts` lief genau diesen Weg ab, ohne ihn zu pruefen | `:96` laedt ohne Rollenauswahl ein, `:122` erwartet `/dashboard` | Ein gruener Test belegte die Luecke, statt sie zu melden | Rolle wird jetzt ausdruecklich gewaehlt; die Sperre prueft `layout.test.tsx` | Ein Test, der eine Voreinstellung mitnimmt, prueft etwas anderes als sein Titel sagt |

## Die eine Entscheidung, die Erklaerung braucht

**Sperrliste statt Positivliste.** Abgewiesen wird genau `eigentuemer`; eine
unbekannte oder fehlende Rolle kommt durch.

Eine Positivliste („nur diese Rollen duerfen ins Dashboard") waere auf den
ersten Blick strenger. Sie wuerde aber bei fehlendem `role`-Claim **jeden**
aussperren — und der Claim fehlt genau dann, wenn der Custom Access Token Hook
in einer Umgebung nicht registriert ist. Das ist derselbe Fehler, den der
`claimsError`-Zweig zwei Zeilen darueber seit PR #33 vermeidet: eine Stoerung
der Claims-Pruefung darf nicht zur Totalsperre werden.

Der Preis ist benannt: Kommt eine neue eingeschraenkte Rolle hinzu, muss sie
ausdruecklich in die Sperrliste. Das ist die bewusst gewaehlte Richtung des
Risikos.

## Geaenderte Dateien

- `apps/web/src/modules/identity/roles.ts`: neu — die Konstante in einer Datei
  **ohne** Abhaengigkeiten. `claims.ts` und `guards.ts` importieren
  `@/lib/supabase/server`; ein Client-Import ueber das Modul-Barrel haette
  Servercode ins Client-Bundle gezogen.
- `apps/web/src/app/(dashboard)/layout.tsx`: der Riegel
- `apps/web/src/app/kein-zugang/page.tsx`: neu — Landeplatz mit Abmelden,
  spiegelbildlich geschuetzt gegen Aufruf durch andere Rollen
- `apps/web/src/modules/settings/admin/tenant-invitation-form.tsx`: keine
  Voreinstellung mehr, Option als „noch nicht verfuegbar" deaktiviert
- `apps/web/src/modules/settings/admin/invitation-actions.ts`: weist die Rolle ab
- `apps/web/e2e/saas-onboarding.spec.ts`: waehlt die Rolle ausdruecklich
- `docs/03-security-model.md`: Warnblock am Rollen-Modell

## Betroffene Systembereiche

- RLS/Audit/HMAC/Migrationen: **nicht geaendert.** Keine Migration, kein
  `db-migrate`. Die Fachtabellen bleiben mandantengebunden — eine
  eigentuemerbezogene Zeilenfilterung ist der Kern einer Eigentuemersicht und
  gehoert in deren Entwurf.
- Web-App/Fachmodule: Identity, Einstellungen, Dashboard-Layout
- Agent/Guardrails/RAG: nicht beruehrt

## Bewusst nicht geaendert

- **Keine RLS-Rollentrennung.** Das ist ein Entwurf, kein Riegel.
- **Keine Bestandsdaten.** Wer heute schon die Rolle traegt, wird vom Riegel
  erfasst; Rollen nachtraeglich umzuschreiben waere ein Eingriff ohne Auftrag.
- **`create_tenant_invitation` (`0057:379`)** akzeptiert die Rolle weiterhin. Die
  Datenbank ist nicht der Ort fuer eine Produktentscheidung, die sich wieder
  aendert; die Sperre sitzt in der Action.

## Checks

| Check | Ergebnis | Hinweis |
| --- | --- | --- |
| `./scripts/verify.sh` | `pass` | **583 Web-Tests** (vorher 579) |
| `playwright test saas-onboarding dashboard` | `pass` | **9 von 9**, 26 Sekunden. Test 9 laeuft den vollen Einladungspfad mit ausdruecklich gewaehlter Rolle; `dashboard.spec.ts` belegt, dass der gesaete Admin nicht ausgesperrt ist. |

**Zwei Stolperstellen im eigenen Lauf, beide aus dem Log erkannt, nicht aus der
Erfolgsmeldung der Hintergrundaufgabe:** ein Lint-Fehler (deutsche
Anfuehrungszeichen im JSX) und ein Typfehler, der keiner war — `typedRoutes`
erzeugt die Routen-Union beim Build, und `verify.sh` prueft Typen davor. Die
lokale `.next/types` stammte aus einem Build **vor** der neuen Route. Ein Build
loeste es; auf einer frischen Auscheckung existiert die Datei gar nicht und die
Frage stellt sich nicht. Wer eine neue Route anlegt, baut also einmal, bevor er
dem Typecheck glaubt.

## Security-Check

- Secrets gelesen oder ausgegeben? `nein`
- Produktive Daten beruehrt? `nein`
- Externe Dienste kontaktiert? `nein` (kein E2E-Lauf in diesem Durchgang)
- Sensible Daten geloggt? `nein`

## Offene Frage, die bleibt

Ob eine Eigentuemersicht gebaut wird, ist weiterhin offen — und jetzt ohne
Zeitdruck. Sie waere fachlich mehr als ein gefiltertes Dashboard: Ein Eigentuemer
hat Anspruch auf Einsicht (§ 18 Abs. 4 WEG), aber nach der im Repo bereits
dokumentierten Rechtsprechung heisst das Einsicht **beim Verwalter**, keine
Pflicht zur digitalen Bereitstellung (`AGENTS.md`, Abschnitt Dokumentenablage).
Ein Portal waere also Produktentscheidung, nicht Rechtspflicht.
