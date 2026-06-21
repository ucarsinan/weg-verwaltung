# UI/UX-Redesign-Pass Design

Datum: 2026-06-21
Status: freigegebener Brainstorming-Designstand
Scope: `apps/web/`

## Ziel

Die Web-App soll von einem funktionalen Scaffold zu einem ruhigen, professionellen Arbeitswerkzeug für WEG-Verwalter werden. Der Pass optimiert nicht auf Showeffekte, sondern auf Orientierung, Vertrauen, Scanbarkeit und eine hochwertigere Portfolio-Wirkung.

Der Nutzer soll auf den zentralen Seiten sofort erkennen:

1. Wo bin ich?
2. Was ist der aktuelle Zustand?
3. Was ist der nächste sinnvolle Schritt?

Die visuelle Richtung ist ruhig-professionell. Die App bleibt dicht genug für tägliche Profi-Nutzung, bekommt aber klarere Hierarchie, bessere Statusführung, passendere Controls und dezente funktionale Grafiken.

## Kontext

Die bestehende App ist sicherheits- und serverseitig solide angelegt, wirkt im Web-Client aber noch stark minimal:

- Die App-Shell enthält eine einfache Desktop-Sidebar; auf Mobile fehlt ein gleichwertiger Navigationseinstieg.
- Viele Seiten nutzen schmale Content-Spalten, einfache Cards und Textlinks.
- Es gibt nur wenige UI-Primitives (`Button`, `Card`, `Input`, `Toast`, `Label`).
- Die UX-Dokumentation beschreibt bereits starke Muster wie AI-Provenance, Approval-Flächen, Lifecycle-Buttons und sichtbaren Server-State, die UI bildet diese Reife noch nicht flächendeckend ab.

Dieser Designstand überführt diese Richtung in einen umsetzbaren UI/UX-Pass, ohne die Sicherheits- oder Datenarchitektur zu verändern.

## Leitprinzipien

### Ruhige Arbeitsfläche

Der Grundlook bleibt hell, sachlich und leicht. Mehr Luft in Seitenrändern und Headern verbessert die Orientierung; Listen und Detailbereiche bleiben kompakt. Die App darf hochwertig wirken, aber nicht wie eine Marketing-Seite.

### Starke Seitenorientierung

Jede zentrale Seite bekommt einen konsistenten Seitenkopf mit Titel, Kontext, primärer Aktion, optionalem Backlink/Breadcrumb und Status-/Meta-Zeile. Verstreute `h1 + Link`-Muster werden ersetzt.

### Status statt Dekoration

Grafische Elemente haben eine Funktion: Lifecycle-Badges, kleine Prozessleisten, KPI-Zeilen, Aktivitätsmarker, AI-Provenance. Keine Illustrationen oder dekorativen Flächen, wenn sie keine Entscheidung erleichtern.

### Controls statt Textlink-Flut

Primäre Aktionen werden als Buttons mit passenden Icons dargestellt. Sekundäre Aktionen sind ruhiger, aber konsistent. Zeilenaktionen in Listen werden wiederverwendbar gestaltet.

### Server-first bleibt Standard

Server Components bleiben Default. Client Components werden nur für echte Interaktion genutzt, etwa Navigation auf Mobile, Menüs, Filter, Review-Controls oder Toasts. Es entsteht keine neue globale Client-State-Schicht.

## UI-Fundament

Der Pass beginnt mit einer kleinen UI-Schicht auf den bestehenden Primitives. Diese Schicht soll wiederverwendbar sein, aber nicht zu einem großen, abstrakten Design-System ausufern.

### `PageHeader`

Zweck: einheitlicher Einstieg in jede zentrale Seite.

Inhalte:

- Titel
- Kontexttext oder Untertitel
- optionaler Breadcrumb oder Backlink
- primäre Aktion
- optionale Meta-Badges
- optionale rechte Action-Gruppe

Beispiele:

- `WEGs` mit Button `Neue WEG`
- WEG-Detail mit Adresse, Status und Schnellaktionen
- Versammlung mit Datum, Modus, Lifecycle-Status und nächstem Schritt

### `SectionHeader`

Zweck: klare Struktur innerhalb langer Detailseiten.

Inhalte:

- Abschnittstitel
- kurze Beschreibung
- optionaler Zähler
- optionale Aktion

Beispiele:

- `Wohneinheiten · 18`
- `Personen · 42`
- `Versammlungen · 3 offen`
- `Beschluss-Sammlung`

### `StatusBadge` und `LifecycleBadge`

Zweck: konsistente visuelle Sprache für Zustände.

Abgedeckte Kategorien:

- Meeting: `Entwurf`, `Eingeladen`, `Laufend`, `Beendet`, `Abgesagt`
- Protokoll: `Entwurf`, `Im Review`, `Zur Unterzeichnung`, `Unterzeichnet`
- Beschluss: `Entwurf`, `Festgestellt`, `In Sammlung`
- KI: `KI-Vorschlag`, `von Verwalter überarbeitet`
- Allgemein: `Offen`, `Erledigt`, `Fehlt`, `Warnung`

Die Badges bleiben farblich zurückhaltend. Rot wird nur für Fehler oder kritische Blocker verwendet.

### `MetricStrip`

Zweck: schneller Überblick ohne Analytics-Überladung.

Typische Metriken:

- Anzahl WEGs
- offene Versammlungen
- Protokolle im Review
- fehlende Stammdaten
- Beschlüsse im aktuellen Zeitraum
- Personen oder Einheiten je WEG

Die Komponente nutzt kompakte Kacheln oder eine durchgehende Zeile. Sie ist kein Chart-Dashboard, sondern ein Scan-Instrument.

### `EntityList`

Zweck: wiederverwendbares Listenmuster für WEGs, Einheiten, Personen und Meetings.

Zeilenstruktur:

- Haupttitel
- Nebeninfo
- optionale Status-Badges
- optionale Meta-Werte
- rechte Aktionsgruppe

Dies ersetzt uneinheitliche Listen mit Textlinks und `|`-Trennern. Tabellen werden nur eingesetzt, wenn echte tabellarische Vergleichbarkeit nötig ist.

### `EmptyState`

Zweck: leere Zustände sollen nützlich und ruhig sein.

Inhalte:

- kurzer Statussatz
- eine klare nächste Aktion
- optionales kleines Icon

Keine dekorativen Illustrationen. Kein unnötig langer Erklärungstext.

### `WorkflowTimeline`

Zweck: Prozessstatus für Versammlung, Protokoll und Beschluss verständlich machen.

Beispiel:

`Entwurf -> Einladung -> Durchführung -> Protokoll -> Beschlusssammlung`

Die Timeline zeigt den aktuellen Schritt, abgeschlossene Schritte und blockierte Schritte. Sie bleibt kompakt und darf nicht zur dominanten Hero-Komponente werden.

### `ActionBar`

Zweck: einheitliche Aktionsführung auf Detail- und Review-Flächen.

Regeln:

- primäre Aktion rechts oder prominent am Seitenkopf
- sekundäre Aktionen als ruhige Buttons
- destruktive Aktionen visuell getrennt
- Menüs für seltene Optionen

## Seitenumfang

### App-Shell

Die Sidebar wird von einer einfachen Linkliste zu einer Arbeitsnavigation:

- Produktname bleibt sichtbar.
- Hauptbereiche bekommen Icons und klarere aktive Zustände.
- Navigationsgruppen bleiben kurz.
- User-/Mandantenbereich wandert in einen ruhigen Footer.
- Mobile bekommt eine Topbar mit Navigationseinstieg, damit die App nicht navigationslos wirkt.

Keine komplexe Command-Palette in diesem Pass. Sie ist in den UX-Leitlinien sinnvoll, aber nicht nötig für den ersten Redesign-Umfang.

### Dashboard

Das Dashboard wird zur operativen Startseite.

Struktur:

1. `PageHeader` mit kurzer Einordnung.
2. `MetricStrip` mit den wichtigsten Arbeitszahlen.
3. Bereich `Nächste Aufgaben`.
4. Bereich `Aktuelle Versammlungen`.
5. Bereich `Letzte Aktivität` oder `WEGs mit Handlungsbedarf`.

Das Dashboard soll kein schweres BI-Produkt werden. Es zeigt priorisierte Arbeit, nicht möglichst viele Charts.

### WEG-Liste

Die WEG-Liste bekommt bessere Scanbarkeit.

Struktur:

- `PageHeader` mit Button `Neue WEG`
- optionale kurze Summary-Zeile
- `EntityList` mit Name, Adresse, optionaler Anzahl Einheiten/Personen und nächster/letzter Versammlung, wenn diese Daten ohne komplexe Queries verfügbar sind
- professioneller `EmptyState`

Suche und Filter können als späterer Schritt ergänzt werden. Wenn der Implementierungsplan sie aufnimmt, müssen sie klein bleiben und dürfen keine neue Client-State-Architektur erzwingen.

### WEG-Detail

Die WEG-Detailseite wird stärker als Arbeitskontext strukturiert.

Struktur:

1. `PageHeader` mit Name, Adresse, Backlink und Aktionen.
2. `MetricStrip` für Einheiten, Personen, Versammlungen und Beschlüsse.
3. Abschnitt `Stammdaten`.
4. Abschnitt `Wohneinheiten`.
5. Abschnitt `Personen`.
6. Abschnitt `Versammlungen`.
7. Abschnitt `Beschluss-Sammlung`.

Die Seite bleibt eine Detailseite, keine verschachtelte Kartenlandschaft. Cards werden für klar abgegrenzte Einheiten genutzt, nicht als pauschaler Seitenhintergrund.

### Versammlungen, Protokoll und Beschlüsse

Diese Flächen bekommen stärkere Lifecycle-Führung.

Muster:

- `PageHeader` mit Meeting-Status, Datum und Modus.
- `WorkflowTimeline` für den Ablauf.
- `ActionBar` für nächste rechtlich relevante Aktionen.
- `LifecycleBadge` für Status.
- KI-Vorschläge sichtbar als Vorschläge, nicht als Autorität.
- Quellen- und Konfidenzdetails bleiben opt-in, damit die Oberfläche nicht überladen wird.

Protokoll-Review bleibt sachlich. Inline-Review, Statusbänder und klare Freigabe-Aktionen sind wichtiger als dekorative KI-Inszenierung.

### Fehler, Loading und Empty States

Der Pass vereinheitlicht Grundzustände:

- Fehler zeigen keine rohen Datenbankdetails.
- Loading-Zustände nutzen ruhige Skeletons oder reservierte Flächen.
- Empty States nennen genau eine sinnvolle Handlung.
- Nicht verfügbare optionale Felder bleiben explizit als `nicht hinterlegt` markiert.

## Datenfluss und technische Grenzen

Der Datenfluss bleibt serverseitig:

- Supabase-Reads laufen weiter über Server Components und RLS.
- Keine Service-Role im UI-Pfad.
- Keine Client-seitigen Tenant-Filter als Sicherheitsmechanismus.
- Aggregationen für Metriken werden klein und seitenbezogen gehalten.

Wenn eine Metrik eine komplexe Query oder neue Datenstruktur erfordern würde, wird sie im ersten Pass ausgelassen oder durch einen einfacheren Wert ersetzt.

## Nicht-Ziele

- Kein komplettes Rebranding.
- Keine neue UI-Bibliothek neben Tailwind und den vorhandenen shadcn-artigen Primitives.
- Keine DB-Migration.
- Keine Änderung am RLS-Modell.
- Keine neuen Agent-Fähigkeiten.
- Kein RAG-Ausbau.
- Kein produktives Hosting.
- Keine Cloud-E2E-Läufe ohne explizite Freigabe.
- Keine dekorativen Illustrationen als Selbstzweck.
- Keine große globale Client-State-Architektur.

## Qualitätskriterien

Der Pass gilt als gelungen, wenn:

- Dashboard, WEG-Liste, WEG-Detail und mindestens eine Versammlungs-/Protokollfläche sichtbar aus einem gemeinsamen UI-System kommen.
- Zentrale Aktionen nicht mehr als verstreute Textlinks wirken.
- Statuswerte konsistent dargestellt werden.
- Jede zentrale Seite einen klaren nächsten Schritt anbietet oder bewusst keinen anbietet.
- Desktop professionell und dicht wirkt.
- Mobile nicht auseinanderfällt und Navigation erreichbar bleibt.
- KI-Elemente klar als Vorschläge markiert bleiben.
- Deutsch UI-Sprache bleibt und Code weiterhin Englisch benannt ist.

## Verifikation

Vorgesehene Checks:

- `just test-web`
- `just typecheck`
- `just lint`
- Browser-Review mit Desktop-Viewport für Dashboard, WEG-Liste, WEG-Detail und Versammlungs-/Protokollfläche
- Browser-Review mit Mobile-Viewport für Navigation, Header und zentrale Listen

E2E-Tests gegen die Cloud werden in diesem Pass nicht ohne explizite Freigabe ausgeführt.

## Umsetzungsreihenfolge

Empfohlene Reihenfolge für den späteren Implementierungsplan:

1. UI-Fundament erstellen: `PageHeader`, `SectionHeader`, Badges, `MetricStrip`, `EntityList`, `EmptyState`, `WorkflowTimeline`, `ActionBar`.
2. App-Shell aktualisieren: Desktop-Sidebar, Mobile-Topbar, aktive Zustände.
3. Dashboard als Arbeitsstartseite aufbauen.
4. WEG-Liste auf `PageHeader` und `EntityList` umstellen.
5. WEG-Detailseite strukturieren und Zeilenaktionen vereinheitlichen.
6. Eine Versammlungs-/Protokollfläche mit Lifecycle-Führung aufwerten.
7. Loading-, Fehler- und Empty-State-Muster angleichen.
8. Tests und Browser-Verifikation durchführen.

Diese Reihenfolge erzeugt zuerst ein konsistentes Fundament und danach sichtbare Verbesserungen auf den wichtigsten Flächen.
