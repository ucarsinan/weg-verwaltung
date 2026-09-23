# Dokumentenablage Design

Datum: 2026-09-22
Status: umgesetzt (Tasks 1–7, abgeschlossen 2026-09-23) — Migrationen `0069`-`0072` lokal
gebaut und pgTAP-gruen, Cloud-Rollout steht noch aus (freigabepflichtig). Der
E2E-Spec `apps/web/e2e/dokumente.spec.ts` ist geschrieben und `--list`-geprueft,
aber noch nie ausgefuehrt.
Migration: `0069` (erweitert um `0070`, `0071`, `0072`)

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

**Diese Begründung gilt für den Lesepfad — und nur für ihn.** Sie wurde in
`0072` nicht revidiert, sondern abgegrenzt: beim *Schreiben* ist RLS kein
umständlicher, aber gangbarer Weg, sondern ein hartes Hindernis. Siehe
„`0072` — der Soft-Delete, den RLS unmöglich macht" unten.

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

### 0071 — der Rückfall zieht in eine eigene Sicht: `public.aufbewahrung_effektiv`

**Anlass:** Die Einstellungen-Seite `/einstellungen/aufbewahrung` (Task 4) muss
für **alle sieben** Dokumentarten zeigen, welche Frist gerade gilt und woher
sie stammt — auch für Arten, zu denen noch kein einziges Dokument existiert.
`dokument_uebersicht` kann das nicht: sie hat nur Zeilen für tatsächlich
vorhandene Dokumente. Eine Dokumentart ohne Beleg taucht dort nie auf, obwohl
für sie sehr wohl schon eine Frist gilt (der Rückfall).

**Lösung:** Der komplette Rückfall-`CASE` aus dem vorigen Abschnitt zieht in
eine eigene Sicht, `public.aufbewahrung_effektiv` — `security_invoker = on`,
eine Zeile je Dokumentart (`unnest(array[...])`, alle sieben, immer),
`left join public.aufbewahrungsregel`. Spalten: `doc_typ`, `jahre` (NULL =
dauerhaft), `herkunft`, sowie `rechtsgrundlage`/`notiz` als Passthrough der
Mandantenregel (bei einem Rückfall beide NULL — es gibt keine vom Mandanten
hinterlegte Begründung für einen Wert, den er nicht gesetzt hat).
`dokument_uebersicht` liest `jahre`/`herkunft` jetzt von dort, statt sie
selbst zu berechnen — **der gesetzliche Rückfall ist damit an genau einer
Stelle in der gesamten Codebase kodiert**, nicht an zwei sich potentiell
widersprechenden.

Dieselbe Begründung wie im vorigen Abschnitt gilt unverändert weiter: kein
Schema `private`, keine `SECURITY DEFINER`-Funktion, kein `tenant_id`-
Parameter. Die Mandantentrennung kommt aus der RLS von
`public.aufbewahrungsregel`, an die die Sicht per `security_invoker` gebunden
bleibt — **seit `0072` zusätzlich aus einem expliziten Tenant-Abgleich im
Join selbst**, weil „RLS filtert vorher" nur für `authenticated` stimmt und
nicht für einen Aufrufer mit `BYPASSRLS` (siehe „`0072` — der Tenant-Abgleich
im Join" unten). Ob eine Mandantenregel existiert, entscheidet weiterhin
`r.id is not null`, nie `coalesce(r.jahre, ...)` — aus demselben Grund wie
oben: eine Mandantenregel mit `jahre = null` muss von der statutarisch
dauerhaften Rückfall-Zeile (z. B. `protokoll`) unterscheidbar bleiben, obwohl
beide `jahre = null` tragen.

**Fix Round 1 (Review): der explizite Tenant-Abgleich aus `0069` ist zurück.**
`0069` joinete `aufbewahrungsregel` mit `r.tenant_id = d.tenant_id and
r.doc_typ = d.doc_typ` — ein expliziter Abgleich OBEN AUF der RLS, nicht nur
die RLS allein. Die erste Fassung von `aufbewahrung_effektiv` ließ das weg,
weil `unnest()` keine treibende Tabelle mit eigener `tenant_id`-Spalte hat;
die Mandantentrennung ruhte danach ausschließlich darauf, dass RLS durch zwei
verschachtelte Sichten hindurch weiterhin greift. Das funktioniert
(`security_invoker` propagiert RLS-Durchsetzung durch jede Zwischenschicht,
mit pgTAP bestätigt — siehe „pgTAP `0071`" unten), war aber eine bestehende
Verteidigungslinie, die ersatzlos verschwunden wäre, ohne dass es zunächst
jemand bemerkt hätte. Deshalb trägt `aufbewahrung_effektiv` jetzt zusätzlich
`public.tenant_id() as tenant_id` (liest die JWT-Claims der aufrufenden Rolle
direkt, keine Basistabelle nötig), und `dokument_uebersicht` joint explizit
sowohl auf `doc_typ` als auch auf `tenant_id`. Weiterhin ein `LEFT JOIN`:
schlägt der Tenant-Abgleich je fehl, muss das Dokument mit einer NULL-Frist
in der Sicht auftauchen — nie verschwinden, das wäre ein stilles, schwerer zu
findendes Datenleck als eine sichtbar fehlende Frist.

`dokument_uebersicht` ändert dadurch weder ihre Ausgabespalten noch deren
Semantik — nur die interne Herleitung von `aufzubewahren_bis`/`frist_herkunft`
wechselt von einem eingebetteten `CASE` zu einem Join auf
`aufbewahrung_effektiv`. `infra/supabase/tests/0069_dokumentenablage.sql`
bleibt deshalb unverändert gültig.

### `0072` — der Soft-Delete, den RLS unmöglich macht

**Anlass: ein kritischer Befund aus dem Branch-Review.** Das Entfernen eines
Dokuments war seit `0015` strukturell unmöglich — nicht selten fehlerhaft,
sondern in jedem Fall. `public.document` trägt diese SELECT-Policy:

```sql
using (tenant_id = (select public.tenant_id()) and deleted_at is null)
```

PostgreSQL verlangt, dass die **neue** Zeile eines `UPDATE` unter der
SELECT-Policy sichtbar bleibt. Genau das bricht der Soft-Delete: sobald
`deleted_at` gesetzt ist, fällt die Zeile aus ihrer eigenen Sichtbarkeit, und
das `UPDATE` wird abgelehnt:

```
ERROR:  new row violates row-level security policy for table "document"
```

Gegen die lokale ephemere Datenbank als `authenticated` gegen die echte
Tabelle gemessen, **ohne** `RETURNING`. Das `.select("id")` in
`loescheDokumentAction` war also nicht die Ursache; die Prüfung greift
unabhängig davon. Betroffen waren beide Schreibpfade in
`wegs/[id]/dokumente/actions.ts`: die Entfernen-Action **und** die
Upload-Kompensation, die nach einem gescheiterten Versions-Insert die
Dokumentzeile soft-löscht. Letztere scheiterte nicht still — PostgREST liefert die
`WITH CHECK`-Ablehnung als harten `42501`, den sie protokollierte. Ungelesen
blieb die **Trefferzahl**: eine Kompensation, die null Zeilen traf, blieb
stumm. Das ist ein anderer, kleinerer Defekt als „scheitert unbemerkt", und er
besteht unabhängig von der RLS-Ablehnung.

**Der Hinweis in `0015` ist dadurch überholt.** Direkt unter der Policy steht
dort: „No DELETE policy → hard delete blocked. Use UPDATE `deleted_at = now()`
(soft delete)." Das ist eine *Anweisung*, kein Kommentar zu einer Begründung —
und sie weist genau den Weg an, den dieselbe Migration versperrt. `0015`
selbst bleibt unangetastet (Vorwärts-Fix); der Hinweis steht deshalb hier und
in `AGENTS.md`, wo ein Leser ihn trifft, bevor er eine Stunde verliert.

**Entscheidung: die SELECT-Policy bleibt exakt, wie sie ist.** Die Datenbank
garantiert weiterhin selbst, dass ein entferntes Dokument unsichtbar ist —
diese Garantie wandert *nicht* in Anwendungscode. Stattdessen fährt der
Soft-Delete über `public.dokument_entfernen(p_dokument_id, p_weg_id)`,
`SECURITY DEFINER`, `set search_path = ''` nach dem Muster von
`activate_wirtschaftsplan` (`0047`).

Das ist **kein** Widerspruch zu „keine Funktion, kein `SECURITY DEFINER`" aus
den beiden Abschnitten oben, sondern die Abgrenzung dazu: dort ging es um
einen **Lesepfad**, für den RLS ausreichte und ein `tenant_id`-Parameter nur
eine Missbrauchsfläche geöffnet hätte. Hier ist RLS nicht umständlich, sondern
ein hartes Hindernis — den Schreibpfad gibt es ohne die Funktion gar nicht.

Tragende Eigenschaften, jede einzeln zugesichert (`0069`-Vertrag, Abschnitte
8–10):

| Eigenschaft | Warum sie trägt |
| --- | --- |
| Der Mandant kommt aus `public.tenant_id()`, **nie** aus einem Parameter, und wird explizit abgeglichen | Die Funktion läuft als Owner mit `BYPASSRLS`; RLS auf `document` greift in ihr **nicht**. `tenant_id = v_tenant_id` **ist** die Mandantentrennung, keine Verdopplung davon |
| `weg_id` muss ebenfalls passen | Hält die Einschränkung der bisherigen Action (`.eq("id", …).eq("weg_id", …)`) aufrecht |
| Rückgabewert `boolean` | PostgREST meldet für ein `UPDATE` ohne Treffer keinen Fehler. `false` heißt „nichts getroffen" — der Nutzer hört nicht „entfernt", wenn nichts passiert ist |
| `deleted_at is null` in der `WHERE`-Klausel | Ein bereits entferntes Dokument ist „nichts getroffen", kein Fehler — und wird nicht ein zweites Mal gestempelt. Wiederbeleben kann die Funktion ohnehin nichts |
| Eigener Agent-Guard (`42501`) | `public.document` trägt **keinen** `*_block_agent_writes`-Trigger — anders als `aufbewahrungsregel`. Der Guard im Funktionskörper ist die einzige Sperre auf diesem Pfad, nicht eine redundante zweite |
| `revoke all … from public, anon, authenticated, service_role`, dann `grant execute … to authenticated` | Die Funktion ist App-API-Oberfläche, kein Internum |

Der Audit-Eintrag entsteht **nicht** in der Funktion, sondern über den
bestehenden `document_audit_emit`-Trigger aus `0069`: der Soft-Delete ist ein
`UPDATE` und löst ihn unverändert aus. Zugesichert, nicht angenommen — der
Vertrag prüft, dass nach dem Aufruf genau eine `audit_event`-Zeile mit
`entity_typ = 'document'`, `action = 'update'` und gesetztem `deleted_at` im
Payload steht. Genau **eine**: derselbe Test belegt damit zugleich, dass der
zweite Aufruf nichts geschrieben hat.

### `0072` — der Tenant-Abgleich im Join von `aufbewahrung_effektiv`

**Anlass: ein zweiter Befund aus demselben Review.** `0071` joint
`aufbewahrungsregel` ohne Tenant-Abgleich und begründet das damit, dass die
`security_invoker`-Sicht `FORCE RLS` vorschaltet und die Regelzeilen deshalb
schon vor dem Join auf den eigenen Mandanten heruntergefiltert seien.

**Das stimmt für `authenticated` — und nur dafür.** Für einen Aufrufer mit
`BYPASSRLS` (Table-Owner, Service-Role-Client) sieht `aufbewahrungsregel` alle
Mandanten gleichzeitig. Halten zwei Mandanten eine Regel für denselben
`doc_typ`, fächert der Join auf: die Sicht liefert **zwei** Zeilen für diese
Dokumentart, beide mit der `tenant_id` des Aufrufers gestempelt
(`public.tenant_id()` ist eine Session-Konstante), aber mit unterschiedlichem
`jahre` und `herkunft`. Gemessen: acht Zeilen statt sieben.

Damit war die Zusicherung falsch, auf die sich `dokument_uebersicht` beim Join
ausdrücklich beruft („genau eine Zeile je `(tenant_id, doc_typ)`-Paar", „der
Join ist also faktisch 1:1, kein Kreuzprodukt") — und pgTAP-Zusicherung 7 in
`0071` läuft als genau ein solcher Aufrufer.

**Fix:** `and r.tenant_id = public.tenant_id()` kommt in den Join, derselbe
Ausdruck wie in der `tenant_id`-Ausgabespalte darüber. Die übrig bleibende
Zeile gehört damit nachweislich zu dem Mandanten, mit dem die Sicht sich nach
außen stempelt. Ohne Mandanten-Claim ist `public.tenant_id()` `null`, der
Vergleich also nie wahr — es bleibt der gesetzliche Rückfall, nie eine fremde
Regel. Die RLS von `aufbewahrungsregel` bleibt die erste Verteidigungslinie;
der Abgleich ist eine zweite, unabhängige obendrauf.

**Und die Lücke im Test dazu.** Zusicherung 7 hätte den Befund finden können
und tat es nicht: im Fixture hielt nur Tenant A eine `korrespondenz`-Regel,
der Join fand also auch ohne Abgleich nur eine Zeile und fächerte nie auf.
Die Zusicherung *konnte* nicht scheitern — das war die eigentliche Lücke,
nicht ihr Wortlaut. `0072` gibt Tenant B eine konkurrierende Regel (Marker
`jahre = 55`, kollisionsfrei zu `77`, `12`, `null` und allen Rückfallwerten)
und macht Zusicherung 7 zählend statt skalar: bei einer Auffächerung wäre ein
skalares `(select … from …)` mit `21000` gestorben und hätte den ganzen
Vertrag mitgerissen, statt sauber `not ok` zu melden.

### Neu: `public.dokument_uebersicht`

`security_invoker = on`, wie `offener_posten` (0061), `ruecklage_entwicklung`
(0062) und `abrechnung_spitze` (0063). Liefert Dokument, aktuelle Version,
`aufzubewahren_bis` und `frist_herkunft` — Mandantenregel und gesetzlicher
Rückfall werden seit `0071` aus `public.aufbewahrung_effektiv` gelesen (siehe
oben), nicht mehr selbst berechnet.

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

Die **Datenbankseite** dieser Kompensation — die Dokumentzeile ohne Version
soft-löschen — läuft seit `0072` über `public.dokument_entfernen`. Bis dahin
war sie ein direktes `UPDATE` und scheiterte deshalb immer an der
SELECT-Policy. Der Fehler wurde dabei protokolliert (`42501`); was der Pfad
nie las, war die Trefferzahl. Jetzt wird auch ein „kein Fehler, aber auch kein
Treffer" protokolliert statt als Erfolg gewertet.

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
- Mandantenregel schlägt Rückfall; `frist_herkunft` benennt, welche griff
- eine Mandantenregel mit `jahre = null` bleibt als „dauerhaft" **und** als
  `frist_herkunft = 'mandantenregel'` erkennbar — nicht mit dem gesetzlichen
  Rückfall zu verwechseln

**Nachgetragen in `0072`, weil dieses Dokument und `docs/09-tom-art32.md`
beides schon zählten, der Vertrag aber dazu schwieg** (Abschnitte 6 und 7):

- Agent-Writes auf `aufbewahrungsregel` blockiert (`42501`) — je eine
  Zusicherung für `INSERT`, `UPDATE` und `DELETE`, weil ein Trigger auch nur
  für eine der drei Operationen geschrieben sein könnte. `UPDATE` und `DELETE`
  zielen auf eine **vorhandene** Zeile: eine Anweisung ohne Treffer würde den
  Row-Level-Trigger gar nicht erst auslösen und die Zusicherung wertlos machen
- der Audit-Emitter feuert beim Anlegen einer Frist **und** beim Anlegen eines
  Dokuments (`0069` hängte ihn dort zum ersten Mal überhaupt an)

Dazu der vollständige Vertrag der Soft-Delete-RPC aus `0072` (Abschnitte
8–10): Grants, falsche `weg_id`, Agent-Sperre, fremder Mandant, der eigentliche
Aufruf, die Unsichtbarkeit danach, der zweite Aufruf und der Audit-Eintrag —
**26 Zusicherungen insgesamt**.

Jede der neuen Zusicherungen wurde rot gesehen, nicht nur grün: mit
entferntem Tenant-Abgleich, entferntem Agent-Guard, entferntem
`deleted_at is null`, gedroppten Triggern und einem zusätzlichen
`anon`-Grant. Eine Zusicherung, die auch ohne den Guard besteht, wäre
schlechter als keine — auf sie stützt sich ein Compliance-Dokument.

### pgTAP `0071`

`infra/supabase/tests/0071_aufbewahrung_effektiv.sql`, 15 Zusicherungen (13
nach Fix Round 2/5 in Task 4 — eine Zusicherung, die den Tenant-Abgleich unter
BYPASSRLS deutlich testet, kam nach der ersten Fassung mit 12 dazu; zwei
weitere kamen in `0072` für die Auffächerung unter BYPASSRLS hinzu, siehe
„`0072` — der Tenant-Abgleich im Join" oben):
`aufbewahrung_effektiv` liefert immer alle sieben Dokumentarten (auch ganz
ohne Mandantenregel und ohne Dokument), der gesetzliche Rückfall greift ohne
Regel, eine Mandantenregel schlägt ihn bei Jahren **und** Herkunft, eine
Mandantenregel mit `jahre = null` bleibt von der statutarisch dauerhaften
Rückfall-Zeile (`protokoll`) unterscheidbar, und ein fremder Mandant sieht
seine eigenen Werte, nie die des anderen — geprüft unter
`set local role authenticated`, nicht als `postgres` (Table-Owner mit
BYPASSRLS, sonst wäre die Zusicherung vakuos). Drei der 15 gehen zusätzlich
den vollen Zwei-Hop-Pfad durch `dokument_uebersicht` selbst (nicht nur durch
`aufbewahrung_effektiv` direkt — im Vertrag nachgezählt, nicht geschätzt):
zwei davon (Fix Round 1, Abschnitte 3b/6b) mit zwei Mandanten, derselbe
`doc_typ` (`rechnung`), dasselbe Dokumentdatum, je eine eigene Regel bzw.
keine — jeder sieht über `dokument_uebersicht` nur seine eigene Frist. Die
dritte (Fix Round 2, Abschnitt 7, siehe oben) läuft bewusst als `postgres`
(BYPASSRLS) und liest ebenfalls über `dokument_uebersicht`: sie beweist, dass
ausschließlich der explizite `ae.tenant_id = d.tenant_id`-Abgleich eine
Mandantenregel (Marker `jahre = 77`) davor bewahrt, auf das gleichartige
Dokument eines fremden Mandanten durchzuschlagen, wenn RLS auf `document`
selbst nicht mehr filtert.

Die zwei in `0072` ergänzten Zusicherungen liegen im selben Abschnitt 7 und
nutzen dieselbe BYPASSRLS-Session: `aufbewahrung_effektiv` bleibt bei genau
sieben Zeilen, auch wenn zwei Mandanten eine Regel für dieselbe Dokumentart
halten, und Tenant Bs Marker (`jahre = 55`) taucht nirgends in einer Sicht
auf, die sich mit Tenant As `tenant_id` stempelt. Beide wurden rot gesehen
(Sicht ohne Tenant-Abgleich: acht Zeilen, Tenant Bs Wert sichtbar) und grün
(mit).

### Modultests

Formularvalidierung (Datum, Pflichtfelder, erlaubte Dateitypen, Größengrenze),
Anzeigelogik „dauerhaft" statt eines Datums, Migrations-Texttest nach dem Muster
von `0064` und `0067`. Task 4 ergänzt `parseRegelForm`: ein leeres Jahresfeld
bedeutet dauerhaft (`null`), `"0"` wird abgelehnt — `Number("")` ist `0`, ohne
die Leerstring-Prüfung zuerst wäre das nicht unterscheidbar.

Seit `0072` mockt `wegs/[id]/dokumente/__tests__/actions.test.ts` nicht mehr
`.from("document").update(…)`, sondern `rpc("dokument_entfernen", …)` — und
hält fest, dass die Entfernen-Action `from` gar nicht mehr anfasst. Ein
direktes `UPDATE` wäre in der echten Datenbank abgelehnt worden; ein Mock, der
es weiter erlaubt, hätte genau diesen Fehler auf Dauer verdeckt. Neu ist
außerdem ein Fall für die Upload-Kompensation, die `false` zurückbekommt: kein
Fehler, aber auch kein Treffer — das muss protokolliert und nicht als Erfolg
gewertet werden.

Die Fristrechnung wird **nicht** in TypeScript gespiegelt. Sie hat genau eine
Heimat, und das ist die Datenbank. Dasselbe gilt für die Rückfallwerte selbst
(8/6/10/dauerhaft je Dokumentart): sie stehen ausschließlich in
`public.aufbewahrung_effektiv` (0071). Die Einstellungen-Seite formatiert nur,
was die Sicht liefert (`formatJahreLabel`), sie berechnet nichts nach.

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

**Konsequenz fuer Task 4 (0071):** Genau diese Entscheidung ist der Grund,
warum die Einstellungen-Seite den Rueckfall nicht aus `dokument_uebersicht`
lesen kann (die hat nur Zeilen fuer vorhandene Dokumente) und warum
`aufbewahrung_effektiv` als eigene Sicht entstand, die alle sieben Arten
immer liefert — siehe „0071 — der Rueckfall zieht in eine eigene Sicht" oben.

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
