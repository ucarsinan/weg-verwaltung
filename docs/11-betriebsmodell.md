# 11. Betriebsmodell und Anbieterwahl

> **Stand: 22. September 2026.** Dieses Dokument hält fest, **wie** die Software
> betrieben werden soll, welche Anbieter dafür geprüft wurden und warum die
> meisten ausgeschieden sind. Es ersetzt den Abschnitt „Migrationspfad" in
> [02-architecture-deployment.md](./02-architecture-deployment.md) § 2.3.

Verwandt: [09-tom-art32.md](./09-tom-art32.md) § 9.8,
[10-backup-und-wiederherstellung.md](./10-backup-und-wiederherstellung.md).

---

## 11.1 Warum jetzt

`02-architecture-deployment.md` legte 2026-06 fest:

> „Der Trigger ist nicht ‚ab Tag 1' — er ist ‚ab erstem Vertrag'."

Die **Prüfung** wurde am 2026-09-22 vorgezogen, auf Wunsch des Betreibers. Der
**Wechsel** selbst nicht: Entscheidung 6 ist bewusst vertagt (§ 11.3.1), mit
definierten Auslösern (§ 11.3.2) und nachprüfbaren Portabilitätsbedingungen
(§ 11.3.3).

Der Unterschied ist der Kern dieses Dokuments. Die Alternativen vor dem ersten
Vertrag zu kennen kostet nichts und macht die spätere Entscheidung zu einer
Stunde Arbeit statt zu einem Projekt. Zu wechseln, bevor ein Grund dafür
besteht, kostet Geld und Zeit für nichts.

Ausgangslage war eine nüchterne Bestandsaufnahme: Die Software läuft, aber sie
läuft nirgends. Entwicklung geschah gegen die Live-Datenbank, es gab kein
Backup, kein Hosting, keine Überwachung.

---

## 11.2 Der Maßstab

Der Betreiber hat entschieden: **Die Daten müssen in der EU liegen.**

Die Unterscheidung dahinter ist wichtig genug, um sie festzuhalten, weil sie in
Gesprächen regelmäßig verrutscht:

| Begriff | Bedeutung | Für uns |
| --- | --- | --- |
| **Daten-Residenz** | Die Bytes liegen physisch in der EU | Mindestanforderung |
| **Daten-Souveränität** | Kein Rechtssystem außerhalb der EU kann Herausgabe erzwingen | Ziel |

Ein Anbieter mit EU-Rechenzentrum, aber US-Mutterkonzern, liefert das Erste und
nicht das Zweite. **Das ist der aktuelle Zustand** und bleibt es bis zu einem
Auslöser aus § 11.3.2 — bewusst akzeptiert, solange nur Demo-Daten im Spiel
sind.

**Was daraus für Werbeaussagen folgt** — dieselbe Trennung wie bei den
Produkttexten (vgl. PR #20):

| Aussage | |
| --- | --- |
| „Die Daten werden in einem Rechenzentrum in Frankfurt am Main gespeichert und verarbeitet." | ✅ belegbar |
| „Die Anwendung wird in der EU betrieben." | ✅ belegbar |
| „Wir nutzen ausschließlich europäische Anbieter." | ❌ erst nach dem Umzug |
| „DSGVO-konform" | ⚠️ keine Standortaussage. Solange Backup, Löschkonzept und AVV fehlen, ist es eine Falschangabe |

---

## 11.3 Getroffene Entscheidungen

| # | Frage | Entscheidung | Status |
| --- | --- | --- | --- |
| 1 | Umgebungen | **Zwei Supabase-Projekte**: eines für die Demo, eines für Entwicklung und Browsertests | entschieden, nicht umgesetzt |
| 2 | Datenbank-Tarif | **Free bleiben**, solange keine echten Daten drin sind | entschieden |
| 3 | KI-Dienst | **Vorerst nicht ausliefern** | entschieden |
| 4 | Maßstab | **Daten in der EU** | entschieden |
| 5 | Web-Hosting | **Scaleway** (Frankreich, Region Paris) — wenn gehostet wird | vertagt, Vorarbeit laeuft |
| 6 | Datenbank-Betreiber | **supabase.com bleibt vorerst**, Elestio ist der vorbereitete Rueckfall | **vertagt mit Vorbehalt** (§ 11.3.1) |

### 11.3.1 Der Vorbehalt — Entscheidung 6 im Wortlaut

Am 2026-09-22 hat der Betreiber entschieden, waehrend der Weiterentwicklung
**bei der jetzigen Struktur zu bleiben** — unter der Bedingung, dass ein
spaeterer Wechsel jederzeit ohne Umbau moeglich bleibt.

Die Begruendung in seinen Worten: supabase.com ist „halb EU" — Daten in
Frankfurt, Vertragspartner in Singapur, Mutter in den USA. Damit laesst sich
leben, solange keine echten Eigentuemerdaten im Spiel sind. Reicht es nicht mehr,
geht es zu Elestio.

**Das ist keine Unentschlossenheit, sondern eine bewusst vertagte Entscheidung.**
Der Unterschied liegt in zwei Dingen: einem Ausloeser und einer nachpruefbaren
Portabilitaet. Beides steht unten.

### 11.3.2 Ausloeser — wann Entscheidung 6 neu getroffen wird

Diese Datei traegt bereits die Lehre aus einem vertagten Entschluss ohne
scharfen Ausloeser: `02-architecture-deployment.md` setzte im Juni „ab erstem
Vertrag" und lag sechs Monate. Deshalb hier konkret — **jeder einzelne Punkt
genuegt:**

| # | Ausloeser | Warum genau hier |
| --- | --- | --- |
| A | **Echte personenbezogene Daten sollen in die Datenbank** | Dann faellt ohnehin auch Entscheidung 2 (Free-Tarif). Beide Fragen kommen gemeinsam auf den Tisch |
| B | Ein Kunde, ein Datenschutzbeauftragter oder ein AVV verlangt einen EU-Anbieter | Dann ist „halb EU" per Definition nicht mehr genug |
| C | Die Produkttexte sollen mit „europäischer Anbieter" werben | Heute waere das eine Falschangabe (§ 11.2) |
| D | supabase.com aendert Vertragspartner, Bedingungen oder Region zum Schlechteren | Der Vertrag ist einseitig aenderbar |

Tritt keiner ein, bleibt alles wie es ist — das ist der Sinn der Entscheidung.

### 11.3.3 Was „ohne Probleme wechseln" nachpruefbar verlangt

Ein Vorbehalt ist nur so viel wert wie seine Belege. Vier Punkte, drei davon
bereits erfuellt:

| Punkt | Stand |
| --- | --- |
| **Datenbank umziehbar** — dieselbe Software laeuft ausserhalb von supabase.com | ✅ belegt: die lokale Entwicklungsdatenbank ist dasselbe Container-Abbild, 67 Migrationen laufen, 324 Zusicherungen gruen |
| **Daten herausholbar** — vollstaendiger Abzug auf Knopfdruck | ✅ `scripts/db-dump.sh`, mit Manifest |
| **Web-App umziehbar** — laeuft in einem Container statt an einen Anbieter gebunden | ✅ belegt am 2026-09-22: `apps/web/Dockerfile` gebaut, gestartet, abgefragt — `HTTP 200`, Startseite lädt |
| **JWT-Hook im Repository** statt nur im Dashboard | ✅ erledigt: `[auth.hook.custom_access_token]` in `infra/supabase/config.toml`; 324 Zusicherungen danach weiterhin grün |

**Alle vier Bedingungen sind erfüllt.** Der Vorbehalt aus § 11.3.1 ist damit
kein Vorsatz mehr, sondern ein geprüfter Zustand.

Zwei Dinge fielen dabei erst beim Ausführen auf, nicht beim Schreiben: Es gibt
gar kein `public/`-Verzeichnis — die naheliegende `COPY`-Zeile hätte den Build
zerlegt. Und ohne `outputFileTracingRoot` hätte der Container die im
pnpm-Workspace verlinkten Pakete erst **zur Laufzeit** vermisst, nicht beim
Bauen. Beides ist in `apps/web/Dockerfile` und `next.config.ts` kommentiert.

Der JWT-Hook war der unscheinbarste der vier Punkte und der gefährlichste:
Solange er nur im Dashboard stand, wäre ein Umzug an einer vergessenen
Einstellung gescheitert — und der Fehler hätte ausgesehen wie „die Anwendung ist
kaputt", nicht wie „eine Einstellung fehlt".

### Die Bedingung zu Entscheidung 2

**In die Datenbank dürfen keine echten Eigentümerdaten, solange kein Backup
existiert.** Nur Demo- und Testdaten.

Das ist keine Empfehlung, sondern die Bedingung, unter der „Free bleiben"
überhaupt vertretbar ist. Sobald ein echter Kunde echte Namen, Adressen und
Hausgeldbeträge einträgt, muss diese Entscheidung neu getroffen werden.

### Warum der KI-Dienst draußen bleibt

Er liefert heute nur Vorschläge, das Retrieval gibt bewusst `[]` zurück. Ihn
mitzuliefern kostet einen zweiten Host, eine zweite Angriffsfläche und einen
weiteren Unterauftragsverarbeiter — für eine Funktion ohne aktuellen Nutzen.
Jederzeit nachrüstbar.

---

## 11.4 Geprüfte Anbieter für die Web-App

Zwölf Anbieter geprüft. Es zeigte sich ein Muster: **es gibt nur drei Sorten von
Angeboten**, und zwei davon scheiden aus.

| Sorte | Beispiele | Warum (nicht) |
| --- | --- | --- |
| **Klassisches Webhosting** | Strato, IONOS Deploy Now | ❌ Gebaut für PHP und WordPress. IONOS Deploy Now unterstützt laut eigener Seite **kein** Server-Side-Rendering mit Node.js; Strato führt PHP, Perl, Python und Ruby, aber kein Node.js. Die Anwendung startet dort nicht |
| **Nackter Server** | Hetzner, Netcup, Hostinger, Strato V-Server | ⚠️ Kann alles, aber der Betreiber ist dann selbst der Betrieb. Ausdrücklich nicht gewollt |
| **PaaS** | Vercel, Render, Netlify, **Scaleway**, **Clever Cloud** | ✅ In der EU bleiben zwei |

Der deutsche Hostingmarkt ist historisch auf PHP gewachsen; die
„git push und fertig"-Sorte kommt überwiegend aus den USA. In der EU sind
Scaleway und Clever Cloud (beide Frankreich) die ernstzunehmenden Vertreter.

### Warum nicht Vercel

Der Gratis-Tarif ist laut Vercels eigenen Bedingungen **ausdrücklich nur für
private, nicht-kommerzielle Nutzung**. Ein Produkt, das Geld einbringen soll,
braucht Pro (20 $/Monat) — viermal so teuer wie ein EU-Anbieter, bei weniger
Kontrolle.

### Warum nicht sota.io

Deutsches Rechenzentrum, kein US-Mutterkonzern, Next.js wird automatisch
erkannt — auf dem Papier genau richtig. Aber: nur auf Einladung, kein
veröffentlichter Preis, keine Firma im Impressum auffindbar, Fokus laut eigener
Antwort auf „enterprise rollouts". Als Fundament heute nicht benutzbar. Der
Betreiber steht auf der Warteliste; erneut prüfen, wenn sie öffnen.

### Scaleway: was kostenlos ist und was nicht

Diese Zahlen wurden nachgerechnet, nicht übernommen. Freikontingent pro Konto
und Monat: **200.000 vCPU-Sekunden** und **400.000 GB-Sekunden**, keine Gebühr
pro Anfrage.

Ein Monat hat 2.592.000 Sekunden. Bei 0,25 Kernen und 0,5 GB deckt das
Freikontingent also rund **neun Tage Dauerbetrieb** — nicht einen ganzen Monat.

| Betriebsart | Kosten |
| --- | --- |
| Schläft, wacht bei Besuch auf | **0 €** |
| Läuft durchgehend | **ca. 6 €/Monat** |

Dazu das Ablegen des Abbilds: 0,027 €/GB/Monat, bei einer Next.js-App etwa ein
Cent.

**Nicht bestätigt:** ob im Schlafzustand tatsächlich nichts berechnet wird, und
welche kleinsten Größen wählbar sind. Die Doku-Seiten gaben es nicht her. Vor
der Buchung in der Konsole prüfen.

---

## 11.5 Geprüfte Anbieter für Datenbank, Login und Dateiablage

### Der entscheidende Unterschied: Software ≠ Firma

„Supabase" bezeichnet zwei verschiedene Dinge, und die Verwechslung hat die
ganze Diskussion lange verzerrt:

| | **Supabase** (Software) | **supabase.com** (Firma) |
| --- | --- | --- |
| Was | Quelloffenes Bündel: Postgres, PostgREST, GoTrue, Storage, Studio | Betreibt diese Software als Dienst |
| Lizenz | **Apache 2.0**, Komponenten MIT/Apache | — |
| Vertragspartner | keiner | **Supabase Pte. Ltd., Singapur** (Reg. 202005760H), Tochter von Supabase, Inc. (USA) |

Das Verhältnis entspricht WordPress.org zu WordPress.com oder Linux zu Red Hat.

**Die Anwendung spricht mit der Software, nicht mit der Firma.** Deshalb ist ein
Wechsel des Betreibers möglich, ohne eine Zeile Code zu ändern.

### Zur Rechtslage von supabase.com

Aus deren Auftragsverarbeitungsvertrag:

- Vertragspartner ist die **Singapur-Gesellschaft**, nicht die US-Gesellschaft.
  Die frühere Angabe „Supabase Inc. (US)" in `02-architecture-deployment.md` war
  ungenau und ist korrigiert.
- Singapur hat **keinen Angemessenheitsbeschluss** der EU-Kommission.
- Das **EU-US Data Privacy Framework greift nicht** — es gilt nur für
  US-Unternehmen und wird im ganzen Vertrag nicht erwähnt.
- Der Mechanismus sind **Standardvertragsklauseln**.
- Zur Datenlage sagt der Vertrag zu: Daten werden in der gewählten Region
  gespeichert und primär dort verarbeitet.

Restrisiko: Über die US-Muttergesellschaft besteht theoretisch Zugriffsdruck nach
US-Recht, unabhängig vom Speicherort. Standardvertragsklauseln mildern das ab,
schließen es nicht aus.

### Bestandsaufnahme: was wir von Supabase tatsächlich nutzen

Gemessen am Repository, nicht geschätzt:

| Baustein | Genutzt | Läuft selbstbetrieben |
| --- | --- | --- |
| Postgres + RLS | ja, der Kern | ✅ |
| Erweiterungen `pg_cron`, `pg_net`, `pgaudit`, `pgcrypto`, `vector` | ja | ✅ |
| PostgREST — 72 Dateien greifen darauf zu | ja | ✅ |
| GoTrue-Login + JWT-Hook | ja, das Fundament der Mandantentrennung | ✅ per `GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_URI=pg-functions://postgres/public/custom_access_token_hook` |
| Vault — 10 Migrationen | ja | ✅ |
| Storage — Audit-Archive, Protokoll-Signatur | **ja** | ✅ |
| Admin-Schnittstelle (`seed-admin`) | ja | ✅ |
| Realtime | **nein** — 0 Fundstellen | entfällt |
| Edge Functions | **nein** — keine vorhanden | entfällt |

**Der Beleg ist nicht theoretisch.** Die lokale Entwicklungsdatenbank *ist*
selbstbetriebenes Supabase, dasselbe Container-Abbild. Dort laufen alle 67
Migrationen durch, 16 pgTAP-Verträge mit 324 Zusicherungen sind grün, und der
Schlüsseltresor funktioniert (belegt beim Backup-Drill, siehe § 10.4).

### Geprüfte Betreiber

| Anbieter | Land | Managed Supabase |
| --- | --- | --- |
| **Elestio** | 🇮🇪 Irland | ✅ ab 16 $/Monat, Backups, SSL, Updates, Überwachung inklusive |
| Stackhero | 🇫🇷 Frankreich, seit 2009 | ❌ 47 Dienste im Katalog, Supabase nicht dabei — hat aber die Einzelteile (PostgreSQL, Keycloak, MinIO) |
| Northflank | 🏴 England (Nr. 11918540) | ⚠️ kein EU-Staat; zudem nur Vorlage in die eigene Cloud, kein betreuter Dienst |
| Sealos | 🇨🇳 China | ❌ |
| EasyCloudify | ? | ❌ Seite blockt den Abruf, Rechtsträger nicht feststellbar |
| Cloudron | — | ❌ Software zum Selbstbetreiben, kein Dienst |
| Nhost | 🇸🇪 Schweden | ⚠️ EU-Firma und verwaltet, aber **Hasura GraphQL statt PostgREST** — alle 72 Datenzugriffe und die Auth-Schicht müssten neu gebaut werden |
| Aiven | 🇫🇮 Finnland | ⚠️ nur Postgres; Login, API-Schicht, Dateiablage und Tresor fehlen |

**Befund: In der EU ist Elestio in dieser Kategorie praktisch allein.** Der Grund
ist strukturell — Supabase ist kein einzelner Dienst, sondern ein Verbund aus
sechs bis acht. Das zu betreiben ist erheblich aufwendiger als ein Redis. Selbst
Stackhero mit 47 Diensten hat es nicht im Katalog.

### Elestio im Einzelnen

- **Rechtsträger:** 66 Fitzwilliam Square, Dublin, D02 AT27, Irland
- **Infrastruktur:** Partner-Anbieter, u. a. **Hetzner, Netcup, Scaleway**
  (EU-Firmen) sowie DigitalOcean, AWS Lightsail, Vultr, Linode (US). Das Land
  wird bei der Bestellung gewählt — **es sind die EU-Partner zu wählen**
- **Backups:** 3-2-1-Strategie, drei Kopien, zwei in geografisch getrennten
  Rechenzentren innerhalb der gewählten Region. Aufbewahrung nach Support-Stufe:
  **Level 1 (kostenlos) 7 Tage**, Level 2 (50 $/Monat) 14 Tage, Level 3
  (200 $/Monat) 30 Tage. Zusätzlich eigene S3-Sicherungen konfigurierbar
- **Konfiguration:** `.env` und `docker-compose.yml` sind im Dashboard
  bearbeitbar — damit ist der JWT-Hook einschaltbar. Ohne diese Möglichkeit wäre
  der ganze Weg gescheitert

### Was der Wechsel kostet

| Verlust | Bewertung |
| --- | --- |
| **Supabase-Advisors** | Echter Verlust. Sie haben hier reale Funde gebracht (Suchpfade, Erweiterungen in `public`, RLS-InitPlan). Teilweise ersetzt durch `infra/supabase/tests/0000_rls_katalog.sql`, der den wichtigsten Teil abdeckt und das Zusammenführen blockiert statt nur zu warnen |
| **`supabase db push --linked`** | Der Ausrollweg hängt an der Plattform-API. Selbstbetrieben über `--db-url`. `scripts/db-migrate-guard.sh` und `just db-migrate` müssen angepasst werden — vorsichtig, das ist das Stück, das ungeprüfte Migrationen aufhält |
| Verzweigungen, erweiterte Messwerte, Projektverwaltung | nicht genutzt |

Das Muster dahinter: Verloren geht genau das, was **nicht zur Software** gehört,
sondern zur Plattform.

### Offene Fragen an Elestio

Aus dem Netz nicht klärbar, vor einer Buchung zu beantworten:

1. **Welche Supabase-Version** wird ausgeliefert, und wie schnell wird
   nachgezogen? Bei Sicherheitsaktualisierungen zählt das.
2. **Enthält die Sicherung den pgsodium-Wurzelschlüssel?** Davon hängt ab, ob die
   Audit-Kette eine Wiederherstellung übersteht (§ 10.5).
3. **Läuft die Dateiablage auf Dateisystem oder S3?** Davon hängt ab, ob die
   Audit-Archive mitgesichert werden.

---

## 11.6 Klumpenrisiko und Ausstiegsplan

Ein einziger Anbieter in dieser Kategorie ist ein Konzentrationsrisiko. Es ist
aber **kein Abhängigkeitsrisiko** — die beiden werden häufig verwechselt.

Was bei einem Wegzug mitgenommen wird:

- ein Postgres-Abzug (`scripts/db-dump.sh`)
- die Dateien aus der Ablage
- eine Handvoll Konfigurationszeilen, darunter der JWT-Hook

Die Software ist Apache 2.0. Niemand kann den Zugang dazu entziehen. Drei
Rückfallebenen bestehen jederzeit:

1. ein anderer Betreiber, falls einer entsteht
2. selbst betreiben auf Scaleway oder Hetzner
3. zurück zu supabase.com

Bei einem proprietären Anbieter (Firebase) gäbe es keine davon. **Genau deshalb
war die ursprüngliche Wahl von Supabase gegenüber Firebase entscheidend** — sie
hat den Ausgang offengehalten, der jetzt genutzt wird.

---

## 11.7 Befund: der JWT-Hook existiert nur im Dashboard

Beim Prüfen der Umzugsfähigkeit aufgefallen und hier festgehalten, weil es
unabhängig von jeder Anbieterentscheidung gilt:

`public.custom_access_token_hook()` ist in Migration `0002_identity.sql`
definiert und an `supabase_auth_admin` freigegeben. **Aktiviert wird der Hook
aber nirgends im Repository** — er ist ausschließlich im Supabase-Dashboard
eingeschaltet. In `infra/supabase/config.toml` steht er nicht.

Folgen:

- Wer das Projekt allein aus dem Repository neu aufbaut, bekommt eine Anwendung,
  in der niemand etwas sieht: der Mandanten-Claim fehlt, `public.tenant_id()`
  liefert NULL, RLS sperrt alles. Immerhin **fail closed**, nicht fail open.
- Bei **jedem** Umzug kann dieser Schritt vergessen werden, und der Fehler sieht
  aus wie „die Anwendung ist kaputt", nicht wie „eine Einstellung fehlt".

**Erledigt am 2026-09-22.** `infra/supabase/config.toml` enthaelt jetzt:

```toml
[auth.hook.custom_access_token]
enabled = true
uri = "pg-functions://postgres/public/custom_access_token_hook"
```

Beim Umzug zu einem anderen Betreiber entspricht dieser Block den
GoTrue-Variablen `GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_ENABLED` und
`GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_URI`. Nach der Aenderung lief das volle
Datenbank-Gate erneut durch: 16 Vertraege, 324 Zusicherungen, gruen.

---

## 11.8 Zielbild

| Teil | Wo | Land | Kosten |
| --- | --- | --- | --- |
| Web-App | Scaleway Serverless Containers, Paris | 🇫🇷 | 0 € schlafend, ~6 € laufend |
| Datenbank, Login, Dateiablage | Elestio auf Hetzner oder Netcup | 🇮🇪 Betreiber, 🇩🇪 Infrastruktur | ab ~16 $ |
| KI-Dienst | bleibt vorerst draußen | — | 0 € |
| Code | GitHub | 🇺🇸 | 0 € |

**Zusammen etwa 20–25 $ im Monat** — vollständig EU für alles, was
personenbezogene Daten berührt.

Zum Vergleich: Supabase Pro allein kostet 25 $ und hätte keinen EU-Betreiber.
Der saubere Weg ist nicht teurer.

### Zwei Positionen bleiben außerhalb der EU

- **GitHub** hält den Code. Keine personenbezogenen Daten von Eigentümern,
  deshalb unkritisch.
- **Resend** für E-Mail ist nicht scharf geschaltet. Sobald Mails versendet
  werden, verarbeitet Resend E-Mail-Adressen — also personenbezogene Daten. Vor
  der Aktivierung nach demselben Maßstab prüfen wie Supabase. Heute kein offener
  Punkt, weil nichts versendet wird.

---

## 11.9 Nächste Schritte

Nach der Entscheidung vom 2026-09-22 geht es **nicht** um einen Umzug, sondern
darum, ihn jederzeit moeglich zu halten.

| # | Schritt | Wer | Dringlichkeit |
| --- | --- | --- | --- |
| ~~1~~ | ~~Docker-Datei und `output: "standalone"`~~ | Agent | ✅ **erledigt 2026-09-22**, Container getestet |
| ~~2~~ | ~~JWT-Hook in `infra/supabase/config.toml`~~ | Agent | ✅ **erledigt 2026-09-22** |
| 3 | Zweites Supabase-Projekt fuer Entwicklung, `dev-web` und Browsertests darauf umstellen | Betreiber legt an, Agent stellt um | **jetzt der naechste Schritt** — unabhaengig vom Anbieter, verhindert Entwicklung gegen Live-Daten |
| 4 | `scripts/db-migrate-guard.sh` auf `--db-url` vorbereiten | Agent | spaeter — erst beim Umzug noetig |
| 5 | Die drei Fragen an Elestio (§ 11.5) | Betreiber | erst bei Ausloeser A–D |
| 6 | Demo-Daten entfernen, bevor echte Daten hineinkommen | Betreiber | bei Ausloeser A |

## 11.10 Änderungshistorie

| Datum | Änderung |
| --- | --- |
| 2026-09-22 | Erstfassung. Entscheidungen 1–4 getroffen, 5–6 als Empfehlung mit offenen Fragen. Korrektur der Angabe „Supabase Inc. (US)" aus `02-architecture-deployment.md`. |
| 2026-09-22 | Portabilitaet hergestellt und belegt: `apps/web/Dockerfile` (gebaut, gestartet, `HTTP 200`), `output: "standalone"` mit `outputFileTracingRoot`, JWT-Hook in `config.toml`. Alle vier Bedingungen aus § 11.3.3 erfuellt. |
| 2026-09-22 | Entscheidung 6 getroffen: **supabase.com bleibt waehrend der Weiterentwicklung**, Elestio ist der vorbereitete Rueckfall. Vier Ausloeser definiert (§ 11.3.2) und vier nachpruefbare Portabilitaetsbedingungen (§ 11.3.3), damit der Vorbehalt belegbar bleibt und nicht wie der Juni-Entschluss liegenbleibt. |
