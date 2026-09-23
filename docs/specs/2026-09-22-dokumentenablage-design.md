# Dokumentenablage Design

Datum: 2026-09-22
Status: entworfen, nicht umgesetzt
Migration: `0069`

## Ziel

Der Verwalter legt Unterlagen einer WEG ab, findet sie wieder, lädt sie herunter
und sieht, wie lange er sie aufbewahren muss. Nicht mehr.

Das Datenmodell dafür existiert seit `0015` — `public.document`,
`public.document_version`, Storage-Bucket `weg-docs`, RLS, Append-only,
SHA-256-Prüfsumme, Soft-Delete mit blockiertem Hard-Delete. **Was fehlt, ist eine
Oberfläche.** Heute schreibt nur die Protokoll-Signatur in diese Tabellen.

## Recherche-Kontext

### § 18 Abs. 4 WEG — Einsichtsrecht

> „Jeder Wohnungseigentümer kann von der Gemeinschaft der Wohnungseigentümer
> Einsicht in die Verwaltungsunterlagen verlangen."

Die Rechtsprechung sieht dieses Recht grundsätzlich als **Einsicht beim
Verwalter**. Ein Eigentümer kann *nicht* verlangen, dass Unterlagen ihm digital
oder auf Papier übersandt werden; Ausnahmen nur bei besonderen persönlichen
Gründen.

**Produktgrenze daraus:** Diese Ablage ist Komfort für die Verwaltung, kein
Erfüllungsweg für § 18 Abs. 4. Sie darf nirgends so beworben werden.

### § 147 Abs. 3 und 4 AO — Aufbewahrung

| Unterlagenart | Frist |
| --- | --- |
| Bücher, Aufzeichnungen, Jahresabschlüsse (Abs. 1 Nr. 1, 4a) | 10 Jahre |
| **Buchungsbelege** (Abs. 1 Nr. 4) | **8 Jahre** |
| sonstige Unterlagen, Handels- und Geschäftsbriefe | 6 Jahre |

Abs. 4 zum Fristbeginn:

> „Die Aufbewahrungsfrist beginnt mit dem Schluss des Kalenderjahrs, in dem … der
> Handels- oder Geschäftsbrief empfangen oder abgesandt worden oder der
> Buchungsbeleg entstanden ist"

Die Uhr läuft also ab dem Jahresende des **Dokumentdatums**, nicht ab dem
Hochladen.

**Nicht entschieden und nicht zu entscheiden:** ob § 147 AO auf eine WEG
unmittelbar anwendbar ist. Das ist juristisch umstritten. Die Praxisliteratur
empfiehlt zehn Jahre für Jahresabrechnung und deren Belege, dauerhafte
Aufbewahrung für Versammlungsprotokolle. Deshalb sind die Fristen im System
**einstellbar** und die gesetzlichen Werte nur ein erkennbarer Rückfall.

### Eigentum an den Unterlagen

Die Verwaltungsunterlagen gehören der WEG; der Verwalter verwahrt sie
treuhänderisch. Auch nach Fristablauf dürfen sie nicht entsorgt, sondern müssen
herausgegeben werden. `0015` bildet das bereits ab: Soft-Delete, Hard-Delete
mangels Policy blockiert.

## Produktentscheidungen

| # | Frage | Entscheidung |
| --- | --- | --- |
| 1 | Zweck | Ablage für den Verwalter. Kein Eigentümerportal, keine Verknüpfung zu Ausgaben oder Abrechnung |
| 2 | Dokumentarten | erweitern, Aufbewahrungsfrist daraus ableiten |
| 3 | Fristbeginn | Pflichtfeld `dokument_datum`, Frist ab dessen Jahresende |
| 4 | Fristdarstellung | abgeleitet in einer Sicht, Regel als **bearbeitbare Daten** je Mandant |
| 5 | Rechtsgrundlage | Freitext und optional — die Zuordnung gehört dem Verwalter, nicht dem Produkt |

### Was die Frist NICHT tut

Sie ist eine Anzeige, kein Automatismus. Nichts wird nach Ablauf gelöscht,
archiviert oder freigegeben. Die Unterlagen gehören der WEG.

## Datenmodell

### Erweiterung `public.document`

`doc_typ` um `rechnung`, `vertrag`, `bescheid`, `korrespondenz` erweitert. Einen
CHECK zu erweitern ist unkritisch; bestehende Zeilen bleiben gültig.

Neue Spalte `dokument_datum date not null`. Bestand — heute ausschließlich
signierte Protokolle — wird mit `created_at::date` aufgefüllt, danach auf
`not null` gesetzt. Bei einem Protokoll ist das Erstellungsdatum zugleich das
Dokumentdatum; der Rückstand ist inhaltlich korrekt.

### Neu: `public.aufbewahrungsregel`

| Spalte | Typ | Bedeutung |
| --- | --- | --- |
| `tenant_id` | uuid | wie überall, Default `public.tenant_id()` |
| `doc_typ` | text | dieselbe Werteliste wie `document.doc_typ`, per eigenem CHECK erzwungen — es gibt keinen Enum-Typ, den man referenzieren könnte |
| `jahre` | int, nullable | `null` bedeutet **dauerhaft** |
| `rechtsgrundlage` | text, nullable | Freitext, z. B. „§ 147 Abs. 3 Nr. 4 AO" |
| `notiz` | text, nullable | warum dieser Mandant abweicht |

`unique (tenant_id, doc_typ)`. RLS und FORCE RLS, Policies nach dem Muster der
übrigen Tabellen. Audit-Trigger: eine geänderte Aufbewahrungsfrist ist eine
nachweispflichtige Entscheidung. Agent-Schreibsperre: die KI ändert keine
Fristen.

### Der gesetzliche Rückfall — eingebettet in `public.dokument_uebersicht`, keine eigene Funktion

**Revidiert in Fix Round 1 (Review).** Ursprünglich als eigene Funktion
`private._aufbewahrung_jahre(p_tenant_id uuid, p_doc_typ text)` entworfen,
`SECURITY DEFINER`, per `cross join lateral` aus der Sicht aufgerufen. Zwei
Probleme zeigten sich erst bei der Implementierung:

1. Die Sicht ist `security_invoker`, ruft die Funktion aber direkt auf — dafür
   hätte die aufrufende Rolle `USAGE` auf Schema `private` **und** `EXECUTE`
   auf der Funktion gebraucht. Schema `private` ist in `0039`, `0042`
   (expliziter Security-Hotfix) und `0047` bewusst abgeschottet; ein
   schemaweites `USAGE`-Grant für eine einzelne Funktion hätte diese
   Abschottung für **alle** privaten Funktionen aufgeweicht und den impliziten
   Backstop entwertet, der jedes einzelne `revoke` dort erst nicht
   load-bearing macht.
2. Die Funktion nahm `tenant_id` als freien Parameter entgegen. Ein direkter
   Aufruf an der Sicht vorbei hätte mit einer fremden `tenant_id` die
   Aufbewahrungsjahre und Herkunft eines fremden Mandanten ausgelesen — ein
   Bruch der Mandantentrennung, den nur ein zusätzlicher, von Hand
   geschriebener Parameter-Guard geschlossen hätte.

**Lösung:** keine Funktion, kein Grant, kein `SECURITY DEFINER`, kein Guard.
Die Mandantenregel wird per `left join public.aufbewahrungsregel` direkt in
`dokument_uebersicht` eingebettet. Die Sicht ist `security_invoker`, RLS auf
`aufbewahrungsregel` setzt die Mandantentrennung also selbst durch — ganz ohne
Parameter, der missbraucht werden könnte.

Ein `left join` (nicht `cross join lateral` einer Funktion) ist hier
Pflicht: fehlt eine Mandantenregel, muss das Dokument mit `aufzubewahren_bis
is null`-Rückfall trotzdem in der Sicht erscheinen, nie verschwinden.

Ob eine Mandantenregel existiert, entscheidet `r.id is not null` — **nicht**
`r.jahre is not null` bzw. `coalesce(r.jahre, …)`. Eine Mandantenregel mit
`jahre = null` bedeutet „dauerhaft" und muss von „keine Regel vorhanden"
unterscheidbar bleiben; ein `coalesce` würde beide Fälle verwechseln und den
Rückfall statt der bewusst gesetzten Dauerhaftigkeit anzeigen.

Rückfallwerte — **ein konservativer Vorschlag, keine Rechtsauskunft**,
`herkunft = 'gesetzlicher_rueckfall'` gegenüber `'mandantenregel'`:

| Art | Jahre | woran angelehnt |
| --- | --- | --- |
| `protokoll`, `beschluss` | dauerhaft | Praxis, nicht AO — Versammlungsprotokolle unterliegen keiner Verfallsfrist |
| `rechnung` | 8 | § 147 Abs. 3 Nr. 4 AO, Buchungsbeleg |
| `korrespondenz` | 6 | § 147 Abs. 3, Handels- und Geschäftsbriefe |
| `bescheid`, `vertrag`, `doku` | 10 | konservativ gegriffen, **nicht** aus einer Vorschrift abgeleitet |

Die letzte Zeile ist ausdrücklich eine Setzung. Zu lange aufzubewahren ist
wegen Art. 17 DSGVO kein risikofreier Default — genau deshalb ist die Regel
bearbeitbar und ihre Herkunft in der Anzeige sichtbar.

### Neu: `public.dokument_uebersicht`

`security_invoker = on`, wie `offener_posten` (0061), `ruecklage_entwicklung`
(0062) und `abrechnung_spitze` (0063). Liefert Dokument, aktuelle Version,
`aufzubewahren_bis` und `frist_herkunft` — Mandantenregel und gesetzlicher
Rückfall sind direkt in der Sicht eingebettet (siehe oben), keine eigene
Funktion.

Rechenweg: `make_date(extract(year from dokument_datum), 12, 31) + jahre Jahre`.
Bei `jahre is null` bleibt `aufzubewahren_bis` NULL — dauerhaft, ohne eigenen
`is null`-Zweig: `make_interval(years => null)` liefert `null`, eine Addition
mit einem `null`-Interval liefert ebenfalls `null` (empirisch geprüft), die
Dauerhaftigkeit propagiert also von selbst bis zur Ausgabespalte.

### Nebenbefund, mit aufgenommen

`public.document` trägt **keinen** Audit-Emitter, obwohl Protokolle und künftig
Belege Beweismittel sind. Die Beschluss-Sammlung daneben ist append-only *und*
auditiert. `0069` hängt den Standard-Emitter aus `0026` an `document`.

## Oberfläche

| Route | Inhalt |
| --- | --- |
| `/wegs/[id]/dokumente` | Liste[^t3] |
| `/wegs/[id]/dokumente/neu` | Hochladen |
| `/wegs/[id]/dokumente/[dokumentId]` | Versionen, neue Version, Herunterladen |
| `/einstellungen/aufbewahrung` | Fristregeln bearbeiten |

Dokumente hängen an der WEG, die Fristregeln am Mandanten — deshalb die
getrennten Orte.

[^t3]: Task 3 hat die Liste ohne Filter nach Art/Jahr gebaut — der Task-Brief
    gab nur Struktur und tragende Abfrage vor, kein Filter-UI. Details:
    `task-3-report.md`.

Neues Modul `modules/dokumente` nach dem Muster von `modules/finanzen`:
`index.ts` als Barrel, Fachlogik daneben, `__tests__`. Server Actions über
`runFormAction` und `logPostgrestError`.

## Upload

Die SHA-256-Prüfsumme ist laut Schemakommentar ein forensischer Anker. Rechnet
der Browser sie aus, ist sie nur noch eine Behauptung des Clients. Also muss die
Datei durch den Server.

**Next.js begrenzt den Body einer Server Action standardmäßig auf 1 MB**, und das
Projekt hat nichts konfiguriert. Ein eingescanntes Protokoll von 3 MB würde
abgewiesen, bevor es den Bucket sieht.

**Entscheidung:** `serverActions.bodySizeLimit` auf **10 MB**, und der Bucket von
100 MB auf 10 MB angeglichen — damit es auf die Frage „wie groß darf eine Datei
sein" eine Antwort gibt statt zweier.

Urspruenglich waren 25 MB vorgesehen. Auf 10 MB gesenkt, weil der Standardwert
einen Sicherheitszweck hat: die Next.js-Dokumentation nennt ausdruecklich
„excessive server resources in parsing large amounts of data" und „potential
DDoS attacks". Von einem sicheren Standard weicht man so weit ab wie noetig und
nicht weiter — eingescannte Protokolle und Rechnungen liegen praktisch immer
unter 10 MB. Wer mehr braucht, hebt die Zahl bewusst und an einer Stelle.

Restrisiko, benannt: Die Grenze schuetzt nicht mehr so eng wie 1 MB. Sie greift
allerdings nur fuer angemeldete Nutzer mit Mandanten-Claim, nicht fuer anonyme
Aufrufe, und der Bucket zieht mit derselben Zahl eine zweite Linie.

**Diese Grenze ist bewusst nicht einstellbar.** `bodySizeLimit` wird beim Bauen
gesetzt, nicht zur Laufzeit; ein Mandant kann sie ohne neuen Build nicht ändern.
Sie steht an einer Stelle und ist dort kommentiert.

Verworfen: Direktupload in den Storage mit anschließender Registrierung. Er
umgeht das Limit nur scheinbar — der Server müsste die Datei zum Prüfsummenbilden
zurücklesen, sie flösse also doch durch, nur später und mit zwei Fehlerquellen
mehr.

**Verwaiste Dateien.** Storage und Datenbank liegen nicht in einer
Transaktion. `weg-docs` vergibt laut 0015 bewusst weder eine UPDATE- noch eine
DELETE-Policy auf `storage.objects` — "if a real delete is ever needed, it
goes through a SECURITY DEFINER admin function with audit log entry. No
app-side path." Schlägt der Datenbank-Eintrag nach einem erfolgreichen Upload
fehl, kann die Datei deshalb **nicht** zurückgenommen werden: sie bleibt im
Bucket stehen. Eine Kompensation, die sie entfernt, gibt es nicht und kann es
mit den vergebenen Rechten nicht geben. Die Action verschweigt das nicht,
sondern protokolliert den vollständigen Pfad und die Dokument-ID, damit ein
Betreiber die Datei bei Bedarf über die Admin-Funktion aus 0015 von Hand
entfernt.

**Bekanntes Restrisiko: gleichzeitige "neue Version".** `neueVersionAction`
liest die höchste vorhandene `version_no` und schreibt `version_no + 1` —
zwischen Lesen und Schreiben liegt kein Lock. Laden zwei Personen im selben
Moment eine neue Version desselben Dokuments hoch, können beide dieselbe
Nummer berechnen. Das ist akzeptiert, kein offener Fehler: `unique (tenant_id,
document_id, version_no)` (0015, Zeile 77) lässt die zweite, unterlegene
Version mit `23505` scheitern, statt beide unbemerkt nebeneinander stehen zu
lassen; die Action fängt das wie jeden anderen Datenbankfehler ab und meldet
dem Nutzer einen Fehler. Ihre schon hochgeladene Datei bleibt dabei verwaist
im Bucket stehen — siehe „Verwaiste Dateien" oben, dieselbe Einschränkung
gilt hier unverändert. Die beiden Uploads kollidieren dabei nicht
miteinander: jeder Versuch bekommt über `eindeutig` (`randomUUID().slice(0,
8)`, siehe `modules/dokumente/upload.ts`) einen eigenen Zufallsanteil im
Pfad, die Dateien landen also nebeneinander im Bucket statt sich
gegenseitig zu überschreiben. An der Datenintegrität geht nichts verloren und
nichts wird still überschrieben — das Fenster schließt fail-closed, nicht
fail-silent, mit einer protokollierten Datei-Leiche als einzigem
Nebeneffekt.

Ein echter Fix (eine `SECURITY DEFINER`-RPC, die `select max(version_no) …
for update` und den Insert in derselben Transaktion sperrt) wäre eine neue
Migration und ein neuer Vertrag für einen Fall, den dieses Produkt nicht hat:
zwei Personen, die dasselbe Dokument in derselben Sekunde versionieren. Wird
das je real (z. B. Co-Verwaltung mit geteiltem Zugriff), ist das der Weg
dorthin — nicht vorher bauen.

## Tests

### pgTAP `0069`

Die Fristrechnung wird von Hand nachgerechnet, nicht nur auf „läuft durch"
geprüft:

> Rechnung vom **15.03.2019**, Regel 8 Jahre → Fristbeginn 31.12.2019 →
> `aufzubewahren_bis = 2027-12-31`
>
> Versammlungsprotokoll, `jahre is null` → `aufzubewahren_bis is null`

Dazu:

- neue `doc_typ`-Werte werden angenommen, unbekannte abgelehnt (`23514`)
- `dokument_datum` ist Pflicht (`23502`)
- `aufbewahrungsregel` trägt RLS und FORCE RLS; ein fremder Mandant sieht nichts
- Agent-Writes auf `aufbewahrungsregel` blockiert (`42501`)
- Audit-Emitter feuert beim Anlegen eines Dokuments und beim Ändern einer Frist
- Mandantenregel schlägt Rückfall; `frist_herkunft` benennt, welche griff
- eine Mandantenregel mit `jahre = null` bleibt als „dauerhaft" **und** als
  `frist_herkunft = 'mandantenregel'` erkennbar — nicht mit dem gesetzlichen
  Rückfall zu verwechseln (12 Zusicherungen insgesamt)

### Modultests

Formularvalidierung (Datum, Pflichtfelder, erlaubte Dateitypen, Größengrenze),
Anzeigelogik „dauerhaft" statt eines Datums, Migrations-Texttest nach dem Muster
von `0064` und `0067`.

Die Fristrechnung wird **nicht** in TypeScript gespiegelt. Sie hat genau eine
Heimat, und das ist die Datenbank.

### E2E `dokumente.spec.ts`

1. Dokument hochladen → erscheint in der Liste mit korrekter Frist
2. Neue Version hochladen → Zähler steigt, alte Version bleibt lesbar
3. **Frist für Rechnungen in den Einstellungen von 8 auf 10 Jahre ändern → die
   Frist in der Dokumentenliste ändert sich mit**

Schritt 3 ist der Beweis, dass die Regel Daten sind und nicht Code. Ohne ihn
bliebe „einstellbar" eine Behauptung.

## Produkttexte

Die Startseite nennt heute ausdrücklich „keine Dokumentenablage". Das wird
falsch. Die neue Formulierung muss die Grenze mittragen: eine **Ablage für die
Verwaltung**, kein Eigentümerportal, und **kein** Erfüllungsweg für § 18 Abs. 4
WEG. Im selben PR nachziehen, wie bei PR #20.

## Bewusst nicht enthalten

- **Verknüpfung zu Ausgaben, Abrechnung oder Versammlung.** Das ist der Slice
  „Belege für die Jahresabrechnung" und wurde bewusst nicht gewählt.
- **Eigentümerportal.** Eigentümer haben keine Logins, und die Rechtslage
  verlangt es nicht.
- **Volltextsuche, OCR, Vorschaubilder.** Kein belegter Bedarf.
- **Automatik nach Fristablauf.** Siehe oben — die Unterlagen gehören der WEG.
- **Herausgabepaket beim Verwalterwechsel.** Eigener Slice; `scripts/db-dump.sh`
  deckt die Datenbankseite bereits ab, die Storage-Seite nicht.

## Entschiedene Punkte

Am 2026-09-22 auf Nachfrage entschieden, Maßstab war ausdruecklich: **die
Sicherheit darf darunter nicht leiden.**

### Fristregeln werden NICHT vorbelegt

Beim Anlegen eines Mandanten entstehen keine Regelzeilen. Es gilt der gesetzliche
Rueckfall, bis jemand bewusst etwas anderes eintraegt.

Begruendung: Der Rueckfall kann nie fehlen. Eine vorbelegte Zeile dagegen ist ein
kopierter Wert, der veralten kann — und wenn eine spaetere Migration eine neue
Dokumentart einfuehrt, haetten bestehende Mandanten dafuer ohnehin keine Zeile.
Ein Wert, der nie fehlen kann, schlaegt einen, der zum Anlegezeitpunkt richtig
war. Zusaetzlich spart es einen Schreibpfad in der Mandantenanlage.

In der Oberflaeche steht dann „gesetzlicher Rueckfall" — ehrlicher als eine
vorbelegte Zahl, die wie eine Entscheidung des Verwalters aussieht.

### Specs liegen in `docs/specs/`, nicht in `docs/superpowers/`

`.gitignore` schliesst `docs/superpowers/` aus. Dort lagen 15 Dateien, davon 6
versioniert — die Trennung war willkuerlich, weil Ignore-Regeln bereits
versionierte Dateien nicht mehr greifen.

**Dieses Repository ist oeffentlich.** Die Ignore-Zeile zu entfernen haette neun
ungepruefte Dateien mit einem einzigen `git add .` veroeffentlicht. Ein
Sicherheitscheck fand darin keinen Geheimwert, kein JWT und keine Projekt-URL —
nur zweimal einen Variablennamen im Fliesstext. Kein Leck, aber die Struktur war
die Luecke.

Deshalb umgekehrt entschieden: **die Ignore-Regel bleibt und wird begruendet**,
dauerhafte Entwurfsdokumente ziehen nach `docs/specs/`. Diese Spec ist
verschoben; das urspruengliche `git add -f` war unter diesem Maßstab falsch und
ist zurueckgenommen. Der Altbestand bleibt liegen — er ist laengst oeffentlich,
und ihn zu verschieben wuerde fremde Historie in diesen Slice mischen. Regel und
Begruendung stehen in `docs/specs/README.md`.

## Offene Punkte

Keine mehr, die diesen Slice blockieren.
