# Section 5 — UX-Leitprinzipien

> **Status:** Section 5 von 6 fertig. Section 6 folgt als finaler Commit.
> Diese Section legt die UX-Leitprinzipien fest: AI-Trust-Calibration, Streaming und Agent-Review-Surfaces, Approval-Cards und Resume-Mechanik, Protokoll-Review-Editor (Tiptap), sichere Defaults, Destructive-Action-Friction, Anfechtungs-Flow als Undo-Äquivalent, Optimistic-UI-Regel und Auto-Save, A11y-Floor und Honest Unknowns. End-to-End-Workflows folgen in Section 6.

---

## 5.1 UX-Leitprinzipien (die fünf Sätze)

Section 5 öffnet mit fünf Sätzen, weil alles, was danach kommt — AI-Trust-Calibration, Streaming-Surfaces, Approval-Cards, Undo, Tastatur-First, A11y — aus genau diesen fünf Sätzen ableitbar ist. Sie sind keine Slogans, sondern Constraints: jede UI-Entscheidung in 5.2–5.10 ist eine Konsequenz aus mindestens einem dieser Sätze.

1. **KI = Vorschlag, nie Autorität.** Jede agent-generierte Information ist visuell als solche markiert und blockiert keine Handlung des Verwalters. Die Section-1-Invariante "KI = nur Vorschläge" und der DB-Trigger auf `actor_type=agent` (Section 3.5) haben hier ihren UI-Ausdruck — ohne sichtbare Provenance wäre die Datenbank-Garantie für den User unsichtbar.
2. **Sicher voreingestellt.** Defaults bevorzugen die rechtlich konservative Interpretation; keine vorab angeklickten Checkboxen für Side-Effects. Ein leeres Bulk-Selection-Set ist die richtige Startposition, nicht "alle ausgewählt".
3. **Rückgängig wo möglich, transparent wo nicht.** Reversible Aktionen haben Undo; irreversible Aktionen erklären, warum kein Undo möglich ist (z. B. Beschluss-Sammlung append-only nach §24 Abs. 7 WEG). "Diese Aktion ist nicht rückgängig zu machen, weil …" ist Pflichttext, nicht Detail.
4. **Tastatur-First.** Jede Action ist per Tastatur erreichbar. Cmd/Ctrl+K als Command-Palette, Tab-Reihenfolge folgt der Lese-Logik, Focus sichtbar mit ≥ 3:1 Kontrast. Profi-Verwalter arbeiten 6+ Stunden im Tool — Maus-Pflicht ist Produktivitäts-Diebstahl.
5. **Sichtbarer Server-State.** Auto-Save zeigt `zuletzt gespeichert vor X Sek.`; rechtlich verbindliche Übergänge brauchen einen expliziten Lifecycle-Button (Speichern → Entwurf abschließen → Zur Unterzeichnung freigeben). DE-B2B-Kultur erwartet expliziten Intent — silent autosave reicht für Notion, nicht für ein Dokument, das vor Gericht standhalten muss.

Sections 5.2–5.10 detaillieren, wie diese fünf Sätze in konkreten UI-Patterns umgesetzt werden.

---

## 5.2 AI-Trust-Calibration

KI-Trust-Calibration ist die UI-Übersetzung von Satz 1. Drei Mikropatterns tragen die Last; jedes hat genau eine Aufgabe und kombiniert sich orthogonal mit den anderen.

### Mikropattern 1 — `✦`-Sigil + "KI-Vorschlag"-Badge

Jede Zeile, die agent-generiert ist, trägt vor dem Text ein `✦`-Sigil und das Badge `KI-Vorschlag`. Beides ist visuell ruhig (kein Rot, kein Glow), aber konsequent — der Verwalter scannt eine Tagesordnung und sieht in 200 ms, welche TOPs Maschine und welche Mensch sind. **Sobald der Verwalter editiert, wird das Sigil entfernt** und durch `von Verwalter überarbeitet` ersetzt. Die Provenance kippt sichtbar von "AI" zu "User" — das ist die UI-Seite des `AgentSuggestion`-Status-Übergangs aus Section 1.

### Mikropattern 2 — Default = nichts approved

Bulk-Bars starten leer, keine vorab gesetzten Checkboxen. "Alle übernehmen" verlangt einen expliziten Klick UND zeigt die Anzahl: `7 Vorschläge übernehmen?`, niemals `Continue`. Die Anzahl im Button ist nicht-verhandelbar — sie zwingt den User zur kurzen Aufmerksamkeits-Pause, in der die Größenordnung der Aktion registriert wird. Direkte Umsetzung von Satz 2.

### Mikropattern 3 — Source-Citation-Expander

Pro Suggestion gibt es einen `⌄`-Expander. Klick zeigt die Quelle: `Quelle: Protokoll 2025-11-14, TOP 5`. Konfidenz wird **qualitativ** kommuniziert (`hoch | mittel | niedrig`), niemals als gefälschte Prozentzahl. Citations sind kein Tooltip — sie sind ein eigener UI-Channel, weil sie der einzige Weg sind, von "der Agent behauptet X" zu "der Agent hat X aus konkretem Dokument Y abgeleitet" zu kommen.

### Warum keine numerische Konfidenz

LLMs sind nicht kalibriert. Ein selbst gemeldetes "87 %" suggeriert eine Präzision, die das Modell nicht hat — und Verwalter, die mit Zahlen arbeiten, lesen "87 %" als statistische Aussage, nicht als sprachliche Färbung. Drei qualitative Stufen sind ehrlicher und zwingen den Verwalter zur eigenen Einschätzung statt zur Delegation an eine erfundene Zahl. Section 4.6 (Guardrail-Pipeline) liefert kein kalibriertes Confidence-Signal, das UI tut also gut daran, keins zu erfinden.

### Visuelle Marker pro Provenance-State

| State | Marker | Where |
| --- | --- | --- |
| AI-generated, unverändert | `✦` + Badge `KI-Vorschlag` + Gutter-Band `--ai-violet` | Vor Zeile + im Editor |
| AI-generated, vom Verwalter editiert | Gutter-Band `--user-slate` + Badge `von Verwalter überarbeitet` | Nach erster Edit |
| User-generated, original | kein Marker | Default |
| Rejected suggestion | strikethrough + grau | Im History-Panel sichtbar |

Die Token-Namen (`--ai-violet`, `--user-slate`) leben im Design-System; die Farbwahl ist sekundär, die **Semantik** ist es nicht: AI-State und User-State haben unterschiedliche Gutter-Farben, damit beim Scrollen durch ein langes Protokoll auf einen Blick erkennbar ist, was Maschine und was Mensch geschrieben hat.

---

## 5.3 Streaming + AgentSuggestion-Review

Section 4.4 hat das Streaming-Pattern serverseitig festgelegt (`astream_events v2` über SSE). Section 5.3 ist die Client-Seite: wie der Token-Strom in der UI ankommt und wie die resultierenden Suggestions reviewed werden.

### Streaming-Stack

- **AI SDK 5 `useChat`** mit Custom-Transport, der FastAPI `/agent/stream` (`astream_events v2` aus Section 4.4) hittet. `useChat` handhabt Token-Reassembly, Message-State und `status`-Übergänge (`submitted | streaming | ready | error`) ohne eigenes Reducer-Boilerplate.
- **Route Handler**, nicht Server Action. Server Actions in Next.js 16 sind für Mutationen optimiert, nicht für Token-Streaming — sie würden den SSE-Stream brechen oder bei langen Runs in die Function-Timeout-Falle laufen. Der Route Handler proxied SSE durch und gibt `Response` mit `Content-Type: text/event-stream` zurück. JWT-Pass-Through bleibt wie in Section 2.4.
- **Cancellation:** `useChat().stop()` ruft `AbortController.abort()`, schließt SSE. LangGraph-Checkpointer aus Section 2.5 hält den partiellen State sicher — ein abgebrochener Run kann später per Resume (Section 5.4) weitergeführt werden, statt verloren zu sein.

Code-Skizze des Client-Components — minimaler Surface, der echte Code lebt später in `apps/web/`:

```tsx
"use client";
import { useChat, DefaultChatTransport } from "ai/react";

export function ProtokollDraft({ thread }: { thread: string }) {
  const { messages, status, stop } = useChat({
    transport: new DefaultChatTransport({
      api: `/api/agent/protokoll?thread=${thread}`,
    }),
  });
  return <>{messages.map(m => <StreamPart key={m.id} message={m} />)}</>;
}
```

`StreamPart` rendert die vier Event-Klassen aus Section 4.4 (`on_chain_start`, `on_chat_model_stream`, `on_tool_start`/`_end`, `on_chain_end`) als unterschiedliche UI-Affordances — Token-Chunks live, Tool-Calls als Activity-Pings ("Lese Vorjahres-Protokoll …"), Final-Result als Übergang in den Review-Modus.

### AgentSuggestion-Review-Surface — dense Liste, kein Card-Stack

Die Output-Surface des Streaming-Runs ist eine **dense Liste mit Row-Level-Actions + Multi-Select-Bulk-Bar**. Nicht Card-Stack, nicht Side-Panel.

**Begründung:**

- **Card-Stacks erzwingen sequentielle Entscheidungen** — der User sieht eine Card, entscheidet, sieht die nächste. Schlecht für tastatur-getriebene Verwalter, die schnell durch 7 Vorschläge scrollen und 2 davon auswählen wollen.
- **Side-Panels verschwenden Density** — eine halbe Bildschirmbreite für eine Detail-Ansicht, während die Liste daneben auf ein Drittel zusammenschrumpft.
- **Liste + Bulk-Bar erlaubt schnelles Scannen**, selektives Approven und Tab+Space-Cycling. Der Verwalter behandelt die Suggestions wie eine Inbox, nicht wie einen Dialog.

ASCII-Sketch (60-char wide):

```text
Tagesordnungs-Vorschläge  (7 von KI vorgeschlagen)   [✓ Alle 7]
──────────────────────────────────────────────────────────────
[ ] ✦ TOP 1  Jahresabrechnung 2025                ✓ ↻ ✎ ⌄
[✓] ✦ TOP 2  Wahl des Verwaltungsbeirats          ✓ ↻ ✎ ⌄
[✓] ✦ TOP 3  Sanierung Dachterrasse (§ 20 II BGB) ✓ ↻ ✎ ⌄
     └─ Quelle: Protokoll 2024-11-14, TOP 5
        Konfidenz: mittel
[ ] ✦ TOP 4  Hausordnung – Anpassung Ruhezeiten   ✓ ↻ ✎ ⌄
──────────────────────────────────────────────────────────────
 2 ausgewählt   [Übernehmen]  [Ablehnen]  [In Vorlage]  ⌘↵
```

Die Row-Actions (`✓ ↻ ✎ ⌄`) sind Approve, Re-Generate, Edit-Inline, Expand. Der `⌄`-Expander öffnet den Source-Citation-Block aus 5.2 inline — Quelle, Konfidenz, optional ein Link in den Langfuse-Trace (nur für `tenant_admin`-Rolle, Section 3.3).

### Tastatur-Mappings (Satz 4 in Aktion)

| Key | Action |
| --- | --- |
| `j` / `k` | Cursor zwischen Zeilen |
| `Space` | Toggle Selection der fokussierten Zeile |
| `Enter` | Öffnet Detail (Expander) |
| `a` | Approve fokussierte Zeile |
| `r` | Reject fokussierte Zeile |
| `e` | Edit-Inline (öffnet Inline-Editor) |
| `Tab` | Springt in die Bulk-Bar wenn ≥ 1 selektiert |
| `⌘↵` | Bulk-Action ausführen (`Übernehmen` Default für ausgewählte) |

Die Mappings sind vim-inspiriert (`j`/`k`), weil die Zielgruppe Power-User sind und vim-Bindings keine Erfindungs-Last haben. Wichtig: `Space` togglet, `Enter` öffnet — Vermischung der beiden ist der häufigste UX-Bug in Inbox-artigen UIs.

---

## 5.4 `interrupt()`-Approval-Cards + Resume-Mechanik

Section 4.7 hat den `interrupt()`-Mechanismus serverseitig festgelegt: vor jedem Tool-Call mit `scope="external"` hält der Graph an, der State persistiert in `AsyncPostgresSaver`, FastAPI returnt `awaiting_approval`. Section 5.4 ist die UI-Seite: wie die Approval gerendert wird und wie der Resume zurück in den Graph findet.

### Approval-Card-Pattern — persistente Inline-Card, kein Modal

Für Tool-Calls mit `scope="external"` rendert die UI eine **persistente Card im Agent-Stream** mit Approve / Reject / Edit-Args sowie einer **globalen Pill im Header**: `1 Aktion wartet`. Modal erst dann, wenn der User wegnavigiert und beim Rückkehren ein hartes Re-Anker braucht.

**Warum nicht Modal als Default:**

- Modale brechen den Workflow — der Verwalter verliert den Kontext (welche Versammlung, welche WEG), in dem die Aktion entstanden ist.
- Modale trainieren Click-to-Dismiss-Muskelgedächtnis — gefährlich bei Aktionen, die rechtlich relevant sind (E-Mail an 14 Eigentümer).
- Modale fühlen sich an wie Consumer-Chatbots — falsche Tonalität für DE-B2B-Verwaltung.

ASCII-Sketch der Inline-Card:

```text
┌─ ⏸  KI wartet auf Freigabe ───────────────── Aktion 1/1 ─┐
│  Werkzeug:  E-Mail an Eigentümer senden                  │
│  Empfänger: 14 Eigentümer der WEG Lindenstr. 12          │
│  Betreff:   Einladung Eigentümerversammlung 17.06.2026   │
│  Anhang:    Tagesordnung_2026-06-17.pdf  (KI-Entwurf)    │
│                                                          │
│  [Vorschau öffnen]    [Argumente bearbeiten ✎]           │
│  ──────────────────────────────────────────────────────  │
│  [Ablehnen]                         [Freigeben & Senden] │
└──────────────────────────────────────────────────────────┘
```

### Pflicht-Regel — rendered Effect, nicht raw Prompt

Die Card zeigt den **rendered Effect** (E-Mail-Preview, PDF-Vorschau, Tool-Args in Domain-Sprache), nicht den raw LLM-Prompt. Der Verwalter approved **Outcomes**, nicht Artefakte. Ein "Schau dir den Prompt an"-Pattern ist die häufigste Form von UX-Theater in 2026er Agent-UIs — es sieht transparent aus, ist aber nutzlos, weil niemand einen 2000-Token-Prompt review-en kann, bevor er auf "Senden" klickt.

Reasoning gehört in einen opt-in "Details"-Expander für Forensik (Langfuse-Trace-Link, Section 3.6). Der Default-Path ist: Outcome sehen, Outcome entscheiden.

### PII-Redaction by default

Klartext-Anzeige nur nach explizitem Klick auf "Vollständig anzeigen". Die `redacted()`-Funktion (Section 4.7 Layer 3) wendet hier dieselbe Maskierung an wie für Langfuse-Traces — Empfänger-Namen erscheinen als `Eigentümer #1`, IBAN als `DE••••8721`, Adressen als `Lindenstr. ••, 60311 Frankfurt`. Klick auf "Vollständig anzeigen" loggt einen `audit_event` (Section 3.5), weil das eine bewusste De-Pseudonymisierung ist.

### Resume-Mechanik — URL-basiert, Notification-spiegelt

```text
/protokoll/[versammlungId]/review?thread=<checkpointId>
```

- **Stable URL** trägt den Checkpoint-Pointer; öffnen rehydriert via RSC-Fetch aus `AsyncPostgresSaver` (Section 2.5 / 4.2).
- E-Mail-Benachrichtigungen via Resend verlinken auf diese URL — sie tragen niemals State, nur den Pointer.
- Bookmarkable, shareable mit Kolleginnen, audit-trail-tauglich (der Link selbst landet im `audit_event` beim Open).
- RLS-safe: `tenant_id` ist im Checkpoint-Row, Server-Side-Validierung des `thread_id`-Prefix gegen JWT-Tenant (Section 4.2). Ein gekapter Link aus Tenant A führt in Tenant B zu einem 403, nicht zu einem stillen Cross-Tenant-Read.

**Warum nicht Notification-Only:** deutsche B2B-User vertrauen ephemerer "Schau in dein Bell-Icon"-Mechanik weniger als einer stabilen URL. Plus: eine zweite Sitzung der gleichen Versammlung auf einem zweiten Monitor öffnet sich einfach durch URL-Paste — ein Bell-Icon-State synchronisiert sich nicht über Tabs.

### Anti-Patterns (explizit verboten)

1. **Modal-as-Default für Approvals** — blockt Audit-Context, trainiert Click-to-Dismiss, fühlt sich an wie Consumer-Chatbot. Persistente Inline-Card ist Default; Modal nur als Re-Anker nach Tab-Wechsel.
2. **Raw LLM-Prompt/Response in Card** — Verwalter approven Wirkung, nicht Reasoning. Reasoning gehört in Forensik-Expander, nicht in den Approval-Path.

---

## 5.5 Protokoll-Review-Editor — Tiptap v3, Track-Changes, deutsche Typografie

**Kontext:** Der Protokoll-Review-Editor ist die UI-Oberfläche des HITL-Schritts aus Section 4.7. Der KI-Agent liefert einen Markdown-Entwurf, der Verwalter akzeptiert/ändert pro Absatz, am Ende steht ein unterzeichnungsfähiges Dokument. Dieser Unterabschnitt entscheidet den Editor-Stack, das Diff-Display, das Save-Resume-Verhalten und die deutsche Typografie.

**Framework: Tiptap v3** (ProseMirror-basiert, OSS-Core).

| Framework | Track-Changes | AI-Suggestion | Solo-Maintenance | Verdict |
| --- | --- | --- | --- | --- |
| **Tiptap v3** | first-party Extension | first-party `AI Suggestion`-Extension | gering, Doku vorhanden | ✓ Pick |
| Lexical | selbst bauen | selbst bauen | hoch | verworfen |
| BlockNote | begrenzt | nein | mittel | verworfen |
| ProseMirror raw | selbst bauen | selbst bauen | sehr hoch | nur für Forks |
| Plate (Slate) | Extension verfügbar | begrenzt | mittel | verworfen |

Tiptaps `AI Suggestion`, `AI Changes` und `Tracked Changes` modellieren „Agent proposed / Human accepts" bereits als Document-Marks — exakt der Section-4.7-Protokoll-Review-Flow. Keine eigene Diff-Engine, keine eigene Mark-Persistierung.

**Next.js-16-Integration:**

```text
apps/web/modules/protokoll/
├── schema.ts                # shared ProseMirror schema (server + client)
├── editor.tsx               # "use client" island, Tiptap mount
└── server/render-to-pdf.ts  # nutzt schema.ts für SSR → PDF
```

Schema-Definition geteilt zwischen Server (PDF-Render) und Client (Editor) — eine Quelle für Node-Typen, kein Drift zwischen On-Screen-Darstellung und unterzeichnetem PDF.

---

### 5.5.1 Diff-Display — Inline, nicht Side-by-Side

Protokolle werden linear nach TOP gelesen. Side-by-Side verdoppelt die Scroll-Fläche und bricht bei 4000+ Wörtern. Inline mit Strikethrough + Underline ist die Norm, die deutsche Verwalter aus MS Word kennen.

```text
┌────────────────────────────────────────────────┐
│ TOP 3 – Jahresabrechnung 2025                  │
│                                                │
│ Die Versammlung beschließt mit ̶8̶ 9 Ja-          │
│ Stimmen, die Jahresabrechnung [+ in der        │
│ vorliegenden Fassung +] zu genehmigen.         │
│                                     [Accept ✓] │
│                                     [Reject ✗] │
└────────────────────────────────────────────────┘
```

- Per-Change Accept/Reject-Buttons in einer floating BubbleMenu (Tiptap-Primitiv).
- „Accept all in TOP" im Heading-Toolbar des TOPs.
- „Accept all in Document" nur explizit im Document-Footer, nie als One-Click-Default — verhindert versehentliche Massen-Übernahme im finalen Review.

---

### 5.5.2 AI-Attribution — Gutter-Band statt Inline-Color

- **3 px Gutter-Band links** in Farbe `--ai-violet` (z. B. `#7C5CFF`) auf dem Absatz.
- Kleine **„Agent-Vorschlag"-Pill** mit Bot-Icon + Timestamp top-right des Blocks, fade on hover-out.
- Sobald der Verwalter den Absatz editiert: Band schaltet auf `--user-slate`, Pill ändert sich zu **„von Verwalter überarbeitet"** mit User-Initialen + Timestamp.

**Begründung Gutter vs. Inline-Color:** Bei 6000-Wort-Dokumenten skaliert ein Gutter-Band besser als per-sentence Color-Coding. Google Docs nutzt Tracked-Changes-Colors, Notion Inline-Pills, Cursor Gutter — die Gutter-Variante ist die rauschärmste für formelle Dokumente und passt zur Section-5.1-Default-Linie „ruhig, Inhalt first".

---

### 5.5.3 Save & Resume — Yjs-Binary + Snapshots + sendBeacon

| Mechanismus | Intervall | Speicher | Trigger |
| --- | --- | --- | --- |
| **Yjs-Binary-Updates** debounced | 2 s | `protokoll_draft_state(yjs_state bytea, version int, updated_at, locked_by)` | Onkey idle |
| **Snapshot-Row** | alle 5 min | `protokoll_draft_snapshot(yjs_state bytea, snapshot_at)` | Timer |
| **sendBeacon** auf Tab-Close | sofort | gleiches Schema | `visibilitychange` + `pagehide` |
| **`y-indexeddb`** Local-Storage-Fallback | live | Browser | netz-aus |

**Zwei-Tab-Konflikt:** Server lehnt Writes mit stale `version` ab und liefert den Diff zurück. UI zeigt: `Andere Sitzung aktiv — neu laden oder übernehmen?` mit zwei Buttons. Kein CRDT-Collab nötig (single Verwalter pro Draft), aber Yjs liefert den `y-indexeddb`-Fallback gratis — ein Netzausfall mitten im Review verliert nichts.

---

### 5.5.4 Deutsche Typografie — Input Rules

| Eingabe | Ergebnis | Code-Point |
| --- | --- | --- |
| `"x"` | `„x"` | U+201E / U+201C |
| `'x'` | `‚x'` | U+201A / U+2018 |
| `§ 12` | `§  12` | `§` + NBSP + narrow NBSP |
| `--` | `—` em-dash | U+2014 |
| `...` | `…` ellipsis | U+2026 |
| `Dr. Müller`, `z. B.`, `25. Mai` | NBSP nach Abk. | U+00A0 |

Soft-Hyphen für lange Komposita: CSS `hyphens: auto; hyphenate-character: "-"` mit `lang="de"` auf Editor-Root. Optional `de-soft-hyphens`-Dict für Edge-Cases wie `Wohnungseigentümerversammlungs­beschluss`.

---

### 5.5.5 Zwei Footguns

1. **Word-Paste zerstört Typografie.** Ohne `transformPastedHTML`-Handler, der MSO-Klassen strippt und Input-Rules re-applied, kommen Smart-Quotes als `"` rein, NBSPs verschwinden, `§`-Spacing bricht. `tiptap-extension-paste-cleanup` oder custom Paste-Plugin von Tag 1 verdrahten — nicht „später fixen".
2. **Tiptap Pro Comments kosten** ($149/mo per project). Margin-Comments via OSS-Custom-Mark `commentId`, referenzierend eine eigene `protokoll_comment`-Tabelle. Sonst koppelt das Portfolio-Piece an eine bezahlte SaaS-Dependency, ohne die der Editor unvollständig wirkt.

---

## 5.6 Sichere Defaults — DE-spezifisch, DIN 5008

**Prinzip:** Pre-fill alles strukturell Wahre (Locale, Format, Tenant-Kontext); leave blank alles, was eine rechtliche Verpflichtung darstellt (Daten, Namen, Adressaten). Ein Default darf eine Nutzer-Entscheidung **antizipieren**, niemals **ersetzen** — sonst wird aus dem Verwalter ein Klick-Bestätiger und das Audit-Log verliert seine semantische Aussagekraft.

| Domäne | Default | Quelle |
| --- | --- | --- |
| **Anrede** | Sie-Form überall. Salutation: `Sehr geehrte/r Herr/Frau [Nachname]`, Fallback `Sehr geehrte Damen und Herren` | DIN 5008 |
| **Datum** | `DD.MM.YYYY`, Wochenstart Montag, `Europe/Berlin` | DIN 5008 / ISO 8601 |
| **Zeit** | 24h `HH:mm`. Neue Versammlung: Datum **leer**, Uhrzeit pre-filled `19:00` | Verwalter-Branchen-Standard |
| **Geld** | EUR mit `1.234,56 €` (Tausenderpunkt, Dezimal-Komma, Leerzeichen vor `€`) | DIN 5008 |
| **PLZ** | 5-stellig, Input-Mask `\d{5}` | Deutsche Post |
| **IBAN** | DE-Format mit Spacing `DE89 3704 0044 0532 0130 00` | ISO 13616 |
| **Beschluss-Quorum** | Einfache Mehrheit (post-WEMoG-Standard), niemals auto-tick "doppelt qualifiziert" | § 25 WEG |
| **Vollmacht-Scope** | Single Versammlung, Expiry = Meeting-Datum 23:59. **Niemals** "bis auf Widerruf" default | § 25 Abs. 1 WEG |
| **Sprache** | Deutsch, formal | Verwalter-Kontext |
| **CSV/Export** | UTF-8 + BOM (Excel-Kompatibilität), Semikolon-Separator (DE-Excel-Konvention) | Praxis |

**Anti-Default-Beispiel:** Beim Anlegen einer neuen Vollmacht **nicht** automatisch alle TOPs ankreuzen. Vollmachtgeber muss aktiv selektieren — der Default ist die rechtlich konservativste Interpretation: minimaler Scope. Das gleiche Prinzip greift bei Quorum-Typen, Mehrheitsregeln und Sub-Processor-Opt-ins: im Zweifel die Variante mit der geringsten rechtlichen Wirkung vorbelegen.

**Warum nicht "smart" pre-fillen:** Plausibles Auto-Fill (Vorjahres-TOPs, letzter Versammlungs-Ort, etc.) gehört in die KI-Vorschlags-Pipeline aus Section 4 — sichtbar als `AgentSuggestion` mit Übernahme-Button, nicht als unsichtbar vorausgefülltes Formularfeld. Sonst kollabiert die in Section 4.7 etablierte Grenze "KI = nur Vorschläge" auf der UI-Seite wieder.

---

## 5.7 Destructive-Action-Friction

**Prinzip:** Friction skaliert mit Blast-Radius. Toast-Undo für reversibel + niedrige Reichweite, Type-to-Confirm für irreversibel + hohe Reichweite, **kein Button** für strukturell verbotene Aktionen. Die in Section 1 §4.6 und Section 3.5 formulierten Append-only-Invarianten dürfen UI-seitig nicht als deaktivierter Button mit Erklär-Tooltip erscheinen — Constraint durch Abwesenheit, nicht durch Greying.

| Action | Blast-Radius | Pattern | Begründung |
| --- | --- | --- | --- |
| **Versammlung absagen** | 100+ Eigentümer informiert, Fristen-Auswirkungen | **Type-to-Confirm** `VERSAMMLUNG ABSAGEN` + Grund-Feld + Diff-Preview ("47 Eigentümer werden benachrichtigt") | NN/g: schwere Konsequenz braucht Erklärung, nicht "Sicher?" |
| **Draft-Protokoll löschen** | nur Autor betroffen | **Toast + 10 s Undo**, dann Soft-Delete 30 d | Gmail-Pattern. Cheap, reversible. |
| **Eigentümer aus Vollmacht-Liste entfernen** | mittel — Stimmgewicht | **Two-Step inline** (Button → "Wirklich entfernen?" → Confirm) + Soft-Delete | Friction proportional zum Scope. Kein Full-Modal nötig. |
| **Einladung versenden** | irreversibel (Mail raus) | **Modal mit spezifischer Summary** ("an 47 Eigentümer, Frist läuft am 15.06.") + 30 s **Undo-Send** | Gmail "Undo Send". Modal weil one-shot, Undo weil Mail noch im Outbox-Buffer steckt. |
| **Beschluss "löschen"** | strukturell verboten (Section 1 / 3.5) | **Kein Button.** Stattdessen: Hinweis "Löschen nicht möglich — Beschluss-Sammlung ist gesetzlich unveränderlich (§ 24 Abs. 7 WEG). Stattdessen: Beschluss anfechten." | Constraint durch Abwesenheit kommunizieren, **niemals** greyed-out Button mit Tooltip. |
| **`AuditEvent` löschen** | strukturell verboten | **Existiert UI-seitig nicht** | Section 3.5 — auch Admin kann nicht löschen. |

**Type-to-Confirm-Pattern im Detail:**

```text
┌─ Versammlung absagen ────────────────────────────────────┐
│  Diese Aktion ist irreversibel.                          │
│                                                          │
│  Betroffen:                                              │
│  - 47 Eigentümer werden per E-Mail benachrichtigt        │
│  - Versendete Einladungen werden als "abgesagt" markiert │
│  - Alle Stimmrechts-Vollmachten werden ungültig          │
│                                                          │
│  Grund (wird im Audit-Log gespeichert):                  │
│  [_____________________________________________________] │
│                                                          │
│  Zum Bestätigen tippen Sie:  VERSAMMLUNG ABSAGEN         │
│  [_____________________________________________________] │
│                                                          │
│  [Abbrechen]                          [Absagen bestätigen] │
└──────────────────────────────────────────────────────────┘
```

Button erst aktiv, wenn der Confirm-String **exakt** getippt ist. Der eingegebene Grund wird als Pflichtfeld in den `AuditEvent` geschrieben (`actor_type=user`, `aktion=meeting.cancel`, `reason=<text>`) — die Friction produziert damit gleichzeitig den forensischen Beleg, den Section 3.5 verlangt.

**Was bewusst nicht in der Tabelle steht:** ein generisches "Sicher?"-Confirm. Studienlage (NN/g, Bruce Tognazzini) ist eindeutig — pauschale Confirms werden weggeklickt, nicht gelesen. Friction muss **inhaltlich** sein (Diff-Preview, Grund-Feld, getippte Phrase), nicht nur **mechanisch** (zweiter Klick).

---

## 5.8 Append-only Undo: Anfechtungs-Flow

Für append-only Aggregate (`BeschlussSammlungEntry`, `AuditEvent`, signierte `Protocol`) existiert kein Delete-/Undo-Pfad. Die WEG-rechtlich korrekte Operation ist **Anfechtung** (§§ 23, 44 WEG) — eine eigene immutable Event-Kette, die Section 1 bereits modelliert (`anfechtungsstatus` auf `BeschlussSammlungEntry`, separate Folge-Event-Tabelle).

**UI-Flow:**

```text
Beschluss #2026-014 "Dachsanierung"        Status: gültig
──────────────────────────────────────────────────────────
TOP 7 · Eigentümerversammlung 2026-04-12
Beschlosstext: "Die Versammlung beschließt …"
Stimmen: 38 Ja · 6 Nein · 3 Enthaltung

  [Beschluss anfechten >]

  ⓘ Löschen nicht möglich — Beschluss-Sammlung ist
    gesetzlich unveränderlich (§ 24 Abs. 7 WEG).

──────────────────────────────────────────────────────────
Anfechtung anlegen
  ├─ Anfechtender:      [Eigentümer wählen ▾]
  ├─ Anfechtungsgrund:  [Freitext + Rechtsgrundlage]
  ├─ Aktenzeichen:      [AG …, optional]
  └─ Wirkung:           ○ rückwirkend ○ schwebend ○ keine

                              [Anfechtung speichern]
```

**Effekt:**

- Neuer Eintrag `Anfechtung-2026-014-A1` als immutable Folge-Event.
- Original-Beschluss bleibt sichtbar, bekommt Badge **"angefochten · schwebend"**.
- Audit-Trail durch Hash-Chain (Section 3.5).
- Spätere Klärung (Gericht entscheidet) ist wieder ein Append-Event: `Anfechtung-…-Urteil`.

Der Verwalter sieht damit jederzeit den vollen Verlauf: ursprünglicher Beschluss → Anfechtung → ggf. Urteil → ggf. weitere Anfechtung. Kein Datum verschwindet je aus der UI. Das ist die UX-Konsequenz aus der DB-Invariante: append-only auf der Daten-Ebene **muss** als sichtbare Event-Kette auf der UI-Ebene erscheinen, sonst lügt das Interface über das Datenmodell.

---

## 5.9 Optimistic vs. Pessimistic UI + Auto-Save

**Regel:** Optimistic UI nur, wenn (a) Failure recoverable ist UND (b) der User bereits ein Mental-Model des Ergebnisses hat.

| Aktion | Pattern | Begründung |
| --- | --- | --- |
| Dokument als "gelesen" markieren | **Optimistic** (`useOptimistic`) | Recoverable, user-erwartet |
| Tagesordnungspunkte reordern (Draft) | **Optimistic** | Drag-Drop, Mental-Model klar |
| Mitglieder-Filter togglen | **Optimistic** | Triviales Read-Side-Effect |
| File-Upload-Reorder | **Optimistic** | UX-Erwartung aus Consumer-Apps |
| **Stimmabgabe** | **Pessimistic** + Pending-State + Server-confirmed | Rechtsverbindlich |
| **Beschluss finalisieren** | **Pessimistic** + Lifecycle-Button | Side-Effect auf Beschluss-Sammlung |
| **Einladung versenden** | **Pessimistic** + Undo-Send-Buffer (30 s) | Irreversibel nach Send |
| **Vollmacht erteilen** | **Pessimistic** | Stimmrechts-Übertragung, gerichtsfest |
| **Protokoll unterzeichnen** | **Pessimistic** + 2FA | Höchste Verbindlichkeit |

Faustregel: **Wenn ein Server-Fehler den User zu "Hat mein Klick gerade gewirkt?" zwingen würde — pessimistic.**

**Auto-Save — Hybrid-Ansatz:**

- **Draft-Phase:** kontinuierliches Auto-Save alle 2 s debounced (Section 5.5 detailliert das für den Protokoll-Editor). Indikator: `zuletzt gespeichert vor 4 Sek.` in der Status-Leiste.
- **Lifecycle-Übergänge:** explizite Buttons mit semantischer Bedeutung, **niemals** still:
  - `[Speichern]` → Draft persistiert
  - `[Entwurf abschließen]` → Status wechselt von `draft` zu `ki_entwurf` / `verwalter_revision`
  - `[Zur Unterzeichnung freigeben]` → Status wechselt zu signing-ready
  - `[Unterzeichnen]` → eigener Endpoint, Re-Auth + 2FA

**Begründung:** deutsche B2B-User misstrauen silent Auto-Save für rechtlich relevante Artefakte. Der Button signalisiert **Intent**, nicht Persistenz. "Hab ich gerade die Versammlung wirklich bestätigt?" ist eine Support-Frage, die durch expliziten Lifecycle-Button strukturell vermieden wird.

**Zwei DE-B2B-Footguns:**

1. **Hidden Auto-Save auf legal documents** löst "Ist das jetzt verbindlich?"-Tickets aus. Immer explizite State-Transition für Beschluss-Sammlung-/Protokoll-Interaktionen zeigen.
2. **Toast-only Confirmation für High-Blast-Aktionen.** Verwalter arbeiten oft mit Dual-Monitor oder Print-Workflow — 5-s-Toast verschwindet, während sie den Monitor wechseln. Für Meeting-Cancel: Modal + persistenter Activity-Log-Eintrag, nie nur Toast.

---

## 5.10 A11y-Floor: WCAG 2.2 AA + Tastatur-First

**Rechtsanwendbarkeit (ehrlich):**

| Regime | Anwendbar? | Begründung |
| --- | --- | --- |
| **BFSG / EAA** | **Nein für reines B2B-Tool.** Aber ein späteres Eigentümer-Portal (Endkunden) fiele teilweise darunter. | BFSG §1 + Bundesfachstelle FAQ: B2B-Angebote sind ausgenommen, sofern sich nicht an Verbraucher gerichtet |
| **BITV 2.0** | **Nein.** Die WEG ist privatrechtlich teilrechtsfähig (§ 9a WEG), keine öffentliche Stelle. | gesetze-im-internet.de — BITV gilt für öffentliche Stellen |
| **WCAG 2.2** | Kein Gesetz, referenzierte Norm. | W3C |
| **EN 301 549 v3.2.1** | EU-Standard, in EAA referenziert. | EU |

**Floor-Entscheidung:** Target **WCAG 2.2 AA + EN 301 549 v3.2.1** — auch ohne rechtliche Pflicht. Begründung:

- Eigentümer-Portal-Teilbereich kann jederzeit EAA-relevant werden (siehe oben).
- Doppelte Implementierung später ist deutlich teurer.
- Portfolio-Signal: zeigt, dass der Entwickler den deutschen Markt 2026 verstanden hat (BFSG-Diskussion, Branchen-Standard).

**Tastatur-First-Patterns (verpflichtend):**

| # | Pattern | Begründung |
| --- | --- | --- |
| 1 | **Command-Palette `Cmd/Ctrl+K`** | Power-User-Hub: "Versammlung anlegen", "Beschluss suchen", "Eigentümer öffnen". ARIA-Combobox-Muster. |
| 2 | **Skip-Links + Landmark-Roles** (`header`, `main`, `nav`, `complementary`) | Einen Tastendruck zum Hauptcontent. Pflicht für Screen-Reader. |
| 3 | **Roving-Tabindex in Datentabellen** | Versammlungsliste, Beschlüsse: `tabindex=0` nur auf aktiver Zelle, Pfeiltasten navigieren. W3C APG-Pattern. |
| 4 | **Native `<input type="date">`** statt Custom-Picker | Browser-Datepicker 2026 ist a11y-konform, spart ~800 LoC + DE-Localisation gratis. |
| 5 | **Focus-Restore nach Server-Action** | Nach `useActionState`-Submit Fokus zurück auf Trigger oder ersten Fehler. React 19 macht das **nicht** automatisch. |
| 6 | **Sichtbarer Focus-Ring ≥ 3:1 Kontrast** | WCAG 2.2 SC 2.4.13. shadcn-Default `ring-1 ring-ring/50` **failt** — globalen Override in `globals.css` setzen. |
| 7 | **Modale Dialoge: Focus-Trap + ESC** | Radix gibt das geschenkt. |
| 8 | **Redundant-Entry-Vermeidung (SC 3.3.7)** | Adressdaten aus Eigentümer-Stammdaten vorbefüllen, nicht erneut tippen lassen. |

**Screen-Reader-Patterns für Streaming + Agent-UI:**

| # | Pattern | Use-Case |
| --- | --- | --- |
| 1 | **`aria-live="polite"` + `aria-busy`** während Agent-Stream | Token-Stream wird nicht jeden Buchstaben angesagt, sondern Sätze; Busy-State während Stream aktiv. |
| 2 | **Skeleton-Loader: `role="status"` + `aria-label="Lade Beschlussliste"`** | Spinner ohne Label sind für SR stumm. |
| 3 | **Toast-Notification: `role="status"` (info) vs `role="alert"` (Fehler/Sicherheit)** | Default polite, nur Sicherheits-/Trigger-Block-Events assertive. |
| 4 | **Form-Errors: `aria-invalid="true"` + `aria-describedby="<field>-error"`** | Pro Feld eine eindeutige Fehler-ID. |
| 5 | **Agent-Vorschlag-Banner** mit klar angesagtem Kontext-String: "Vorschlag der KI, nicht rechtsverbindlich" | Matched Section-1-Sicherheits-Invariante 2. |

**shadcn/ui-Gaps in 2026 (selbst nachrüsten):**

| Gap | Workaround |
| --- | --- |
| **Focus-Ring-Kontrast** — Default `ring-ring/50` < 3:1 | In `globals.css` auf `ring-ring` voll-opaque + ≥ 2 px setzen. |
| **Combobox** = Popover + Command-Komposition ohne komplette ARIA-Combobox-Semantik | Manuell `role="combobox"` / `aria-expanded` / `aria-controls` ergänzen, oder Ariakit `useComboboxState`. |
| **Data-Table** ohne `<caption>`, ohne Live-Region für Pagination, ohne Sort-State-Announce, ohne Row-Selection-Label | Kritisch für WEG-Verwaltung — selbst implementieren. Wrapper-Component pflegt. |
| **Vaul Drawer** — Focus-Restore nach Unmount-Trigger bricht | Trigger im DOM halten oder Ref-basiert Focus zurücksetzen. |

**Test-Stack:**

| Tool | Rolle |
| --- | --- |
| **`@axe-core/playwright`** in E2E | Automatisierte WCAG-Scans pro kritischer Route (Login, Versammlung-Detail, Beschluss-Sammlung). CI-Gate. |
| **`jest-axe`** in Component-Tests | Schneller Pre-Commit-Filter für neue Komponenten. |
| **Manuell: NVDA + Firefox auf Deutsch** | Canonical-Stack für DE-B2B (43 % Dev-Verbreitung, kostenlos, deckt 90 % der SR-Issues). Sekundär VoiceOver auf Mac für Eigentümer-Portal-Smoke-Tests. |

---

## 5.11 Honest Unknowns

1. **Eigentümer-Portal-Scope offen** — wenn Eigentümer als Verbraucher (§13 BGB) Direktzugang bekommen, wird der Teilbereich EAA-pflichtig. UX-Layer muss dann strenger reviewt werden. Roadmap-Item.
2. **Tiptap-OSS-Lizenz-Risiko langfristig** — Tiptap ist seit v3 MIT-OSS für den Core, aber Pro-Extensions sind kommerziell. Falls weitere Pro-Features später nötig werden (Mention, History-Server), kippt die OSS-Story. Mitigation: bewusst nur OSS-Extensions verwenden.
3. **`y-indexeddb` + DSGVO** — lokaler Browser-Cache enthält Eigentümer-Daten. Bei Geräte-Wechsel oder Browser-Reset zu klärendes Risiko (Privacy by Design). Mitigation: explicit Clear-on-Logout + Hinweis in Datenschutzerklärung.
4. **NVDA + DE-Voice-Coverage** — die meisten Screen-Reader-Tests werden auf englischen Voices durchgeführt; DE-spezifische Edge-Cases (Komposita-Aussprache, "ß"-Handling, Datums-Formate) sind nur durch manuelle Tests verifizierbar. Test-Aufwand höher als initial geschätzt.
5. **Print-Layout für Protokolle** — Protokolle werden oft an Eigentümer per Post versendet. Browser-Print-CSS muss eigene Aufmerksamkeit bekommen (Section 4 hat den Editor, Print-Render bleibt offen).

---

## 5.12 Out-of-Scope für Section 5

Bewusst hier nicht behandelt — verweist auf Section 6:

- **Konkrete End-to-End-Workflows** (Einladung → Versammlung → Stimmabgabe → Protokoll-Signatur → Beschluss-Sammlung-Entry) mit UI-Sequenzen pro Schritt — kommt in Section 6.
- **Threat-Walk-Through pro Workflow** (welcher Sicherheits-Invariante aus Section 3 wirkt an welcher UI-Stelle) — Section 6.
- **Risikomatrix** (Likelihood × Impact pro Workflow-Schritt) — Section 6.
- **Out-of-Scope-Adapter** (eIDAS-Signatur, SEPA-Lastschrift, Zoom/Webex-Streaming-Integration) — Section 6.

**Nächster Commit:** `docs: add section 6 — end-to-end workflows and risks`.
