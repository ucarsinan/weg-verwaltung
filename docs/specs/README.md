# Specs

Hier liegen Entwurfsdokumente, die **bewusst versioniert** sind: Design vor der
Umsetzung, mit Recherche, Entscheidungen und benannten Grenzen.

## Warum nicht `docs/superpowers/specs/`

`.gitignore` schliesst `docs/superpowers/` aus — das ist ein Arbeitsordner fuer
Werkzeug-Artefakte, absichtlich ausserhalb der Versionierung.

Am 2026-09-22 lagen dort 15 Dateien, von denen 6 versioniert waren und 9 nicht.
Die Trennung war willkuerlich: versioniert war, was vor der Ignore-Regel
hinzugefuegt wurde. Ignore-Regeln greifen nicht mehr auf bereits versionierte
Dateien, deshalb blieben sie drin.

**Dieser Zustand ist gefaehrlich, und zwar wegen einer Eigenschaft dieses
Repositories: es ist oeffentlich.** Ein Ordner, den alle fuer ignoriert halten,
sammelt ungeprueftes Material. Faellt die Ignore-Zeile weg oder greift jemand zu
`git add -f`, wird das alles auf einen Schlag oeffentlich.

Ein Sicherheitscheck der neun unversionierten Dateien am 2026-09-22 fand keinen
zugewiesenen Geheimwert, kein JWT und keine Projekt-URL — nur zweimal einen
Variablennamen im Fliesstext. Kein Leck. Die Luecke war die Struktur, nicht der
Inhalt.

## Die Regel

| Ort | Bedeutung |
| --- | --- |
| `docs/specs/` | Entwuerfe. Versioniert, oeffentlich lesbar, vor dem Commit gelesen |
| `docs/plans/` | Umsetzungsplaene zu diesen Entwuerfen. Ebenso versioniert |
| `docs/superpowers/` | Arbeitsordner, ignoriert. Landet **nie** im Repository |

**Kein `git add -f` aus `docs/superpowers/`.** Wenn ein Dokument dauerhaft
gehoert, wird es hierher verschoben — und dabei gelesen.

## Altbestand

Fuenf Specs und zwei Plaene liegen weiterhin unter `docs/superpowers/` und sind
versioniert. Sie sind laengst oeffentlich; sie zu verschieben aendert daran
nichts und wuerde fremde Historie in einen laufenden Slice mischen. Wer sie
ohnehin anfasst, verschiebt sie hierher.
