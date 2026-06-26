# WEG-Verwaltung Git Workflow

Diese Datei beschreibt, wie Agenten Aenderungen strukturiert fuer Git vorbereiten.
Git-Aktionen sind erlaubt, aber nicht autonom: Commit und Push brauchen ausdrueckliche Freigabe des Nutzers.

## Grundregeln

- Keine Commits ohne ausdrueckliche Freigabe.
- Kein Push ohne ausdrueckliche Freigabe.
- Keine destruktiven Git-Befehle ohne ausdrueckliche Freigabe.
- Nur Dateien stagen, die eindeutig zur freigegebenen Aufgabe gehoeren.
- Fremde, alte oder unklare Worktree-Aenderungen nicht stagen, nicht bereinigen und nicht ueberschreiben.
- Vor Commit oder Push immer `git status` und relevante Diffs pruefen.
- Vor Commit muss `./scripts/verify.sh` erfolgreich laufen oder das verbleibende Risiko klar berichtet werden.

## Git-Ampel fuer Berichte

Jeder Abschlussbericht muss diese Fragen einfach beantworten:

- Wurde etwas gestaged? `ja/nein`
- Wurde ein Commit erstellt? `ja/nein`
- Wurde etwas gepusht? `ja/nein`
- Was fehlt als naechstes fuer Commit oder Push?

Wenn kein Push passiert ist, muss der Bericht wortwoertlich enthalten:

```text
Es wurde nichts gepusht.
```

## Standardablauf

1. Status pruefen:

```bash
git status --short
```

2. Eigene Aenderungen identifizieren.
3. Fremde oder unklare Aenderungen abgrenzen.
4. Relevante Diffs pruefen:

```bash
git diff -- <dateien>
```

5. Pflichtcheck ausfuehren:

```bash
./scripts/verify.sh
```

6. Commit-Scope und Commit-Message vorschlagen.
7. Nutzerfreigabe einholen.
8. Nur freigegebene Dateien stagen.
9. Commit erstellen.
10. Push nur nach separater Freigabe ausfuehren.

## Push-Regel

Vor einem Push muss klar sein:

- Ziel-Branch
- Remote
- ob ein PR erstellt oder aktualisiert werden soll
- ob der lokale Stand gegen Remote aktuell genug ist
- welche Aenderungen nicht Bestandteil des Pushs sind
