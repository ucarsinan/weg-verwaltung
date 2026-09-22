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

### Neu: `private._aufbewahrung_jahre(p_tenant_id uuid, p_doc_typ text)`

Liefert `(jahre int, herkunft text)`. Erst die Mandantenregel, sonst der
gesetzliche Rückfall mit `herkunft = 'gesetzlicher_rueckfall'`. Der Rückfall ist
der einzige fest kodierte Wert im Entwurf und deshalb in der Anzeige als solcher
kenntlich — kein getarnter Festwert.

Rückfallwerte — **ein konservativer Vorschlag, keine Rechtsauskunft**:

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
`aufzubewahren_bis` und `frist_herkunft`.

Rechenweg: `make_date(extract(year from dokument_datum), 12, 31) + jahre Jahre`.
Bei `jahre is null` bleibt `aufzubewahren_bis` NULL — dauerhaft.

### Nebenbefund, mit aufgenommen

`public.document` trägt **keinen** Audit-Emitter, obwohl Protokolle und künftig
Belege Beweismittel sind. Die Beschluss-Sammlung daneben ist append-only *und*
auditiert. `0069` hängt den Standard-Emitter aus `0026` an `document`.

## Oberfläche

| Route | Inhalt |
| --- | --- |
| `/wegs/[id]/dokumente` | Liste, Filter nach Art und Jahr |
| `/wegs/[id]/dokumente/neu` | Hochladen |
| `/wegs/[id]/dokumente/[dokumentId]` | Versionen, neue Version, Herunterladen |
| `/einstellungen/aufbewahrung` | Fristregeln bearbeiten |

Dokumente hängen an der WEG, die Fristregeln am Mandanten — deshalb die
getrennten Orte.

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

**Entscheidung:** `serverActions.bodySizeLimit` auf **25 MB**, und der Bucket von
100 MB auf 25 MB angeglichen — damit es auf die Frage „wie groß darf eine Datei
sein" eine Antwort gibt statt zweier.

**Diese Grenze ist bewusst nicht einstellbar.** `bodySizeLimit` wird beim Bauen
gesetzt, nicht zur Laufzeit; ein Mandant kann sie ohne neuen Build nicht ändern.
Sie steht an einer Stelle und ist dort kommentiert.

Verworfen: Direktupload in den Storage mit anschließender Registrierung. Er
umgeht das Limit nur scheinbar — der Server müsste die Datei zum Prüfsummenbilden
zurücklesen, sie flösse also doch durch, nur später und mit zwei Fehlerquellen
mehr.

**Verwaiste Dateien.** Storage und Datenbank liegen nicht in einer Transaktion.
Schlägt der Datenbank-Eintrag nach erfolgreichem Upload fehl, wird die Datei
wieder entfernt; scheitert auch das, protokolliert die Action es, statt zu
schweigen.

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

## Offene Punkte

- Ob die Fristregeln je Mandant beim Anlegen des Mandanten vorbelegt werden oder
  erst beim ersten Bearbeiten entstehen. Der Rückfall macht beides funktionsfähig;
  Vorbelegen wäre sichtbarer, Nicht-Vorbelegen ehrlicher („du hast nichts
  eingestellt").
- `.gitignore` Zeile 54 schließt `docs/superpowers/` aus, während sieben Specs
  dort versioniert liegen. Regel und Praxis widersprechen sich. Zu klären, nicht
  Teil dieses Slices.
