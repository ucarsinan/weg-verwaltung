#!/usr/bin/env sh
# Logischer Backup-Export der Datenbank (siehe die db-dump-Rezepte im justfile).
#
# Warum dieses Skript existiert:
#   Das Projekt laeuft auf dem Supabase-Free-Plan. Free-Plan-Projekte bekommen
#   laut Supabase-Doku (geprueft am 2026-09-22) KEINE automatischen Backups —
#   weder taeglich noch Point-in-Time. Die dokumentierte Empfehlung lautet,
#   regelmaessig per CLI zu exportieren und die Exporte ausserhalb abzulegen.
#
#   Damit ist Art. 32 Abs. 1 lit. b und c DSGVO (Verfuegbarkeit und rasche
#   Wiederherstellbarkeit) heute nicht erfuellt. Ein Skript allein erfuellt es
#   auch nicht — aber es macht den Unterschied zwischen einem Vorsatz und einer
#   Handlung, die jemand jede Woche in einer Minute ausfuehren kann.
#
#   Vollstaendige Begruendung, Optionen und der Wiederherstellungs-Drill:
#   docs/10-backup-und-wiederherstellung.md
#
# Was es tut:
#   Schreibt drei Dateien nach backups/<UTC-Zeitstempel>/ — getrennt nach der
#   Supabase-Empfehlung, weil die drei Teile beim Zurueckspielen in genau
#   dieser Reihenfolge gebraucht werden:
#     roles.sql   Cluster-Rollen  (--role-only)
#     schema.sql  Struktur        (Default)
#     data.sql    Daten           (--data-only --use-copy)
#   Dazu manifest.txt mit SHA-256 je Datei, Zeitstempel, Git-HEAD und
#   CLI-Version. Ohne Manifest laesst sich spaeter nicht belegen, GEGEN WELCHEN
#   Codestand der Export entstanden ist — und ein Backup, dessen Schemastand
#   niemand kennt, ist beim Zurueckspielen ein Ratespiel.
#
# Was es NICHT tut:
#   - Es spielt nichts zurueck. Wiederherstellen ist ein eigener, bewusster
#     Vorgang; siehe den Drill in der Doku.
#   - Es sichert KEINE Storage-Objekte. Laut Supabase-Doku sind ueber die
#     Storage-API abgelegte Objekte in Datenbank-Backups nicht enthalten. Der
#     Bucket `audit-archives` braucht deshalb einen eigenen Weg.
#   - Es fasst keine Secrets an und liest keine .env-Datei. Die Anmeldung
#     uebernimmt die Supabase-CLI.
#
# Verwendung:
#   scripts/db-dump.sh --local    gegen die ephemere lokale DB (Uebung, harmlos)
#   scripts/db-dump.sh --linked   gegen das verlinkte Cloud-Projekt (Freigabe!)
#
# Der --linked-Lauf verlangt eine getippte Bestaetigung, weil er echte
# personenbezogene Daten auf die lokale Platte holt. Wer sie ablegt, ist fuer
# sie verantwortlich.

set -eu

ZIEL="${1:-}"

case "$ZIEL" in
  --local|--linked) ;;
  *)
    echo "Verwendung: $0 --local | --linked" >&2
    exit 2
    ;;
esac

REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

# ---------------------------------------------------------------------------
# 1. Fail closed: niemals Daten in ein Verzeichnis schreiben, das committet wird
# ---------------------------------------------------------------------------
# `git check-ignore` gibt 0 zurueck, wenn der Pfad ignoriert wird. Ohne diese
# Pruefung koennte ein Export mit echten Eigentuemerdaten in einem Commit
# landen — genau der Fehler, den die Projektregeln ausdruecklich verbieten.
#
# Der Schraegstrich ist notwendig, nicht kosmetisch: das Muster `backups/` in
# .gitignore gilt nur fuer Verzeichnisse, und ohne Schraegstrich weiss git bei
# einem noch nicht existierenden Pfad nicht, dass ein Verzeichnis gemeint ist.
# `git check-ignore -q backups` meldet dann "nicht ignoriert" und dieser Guard
# haette jeden Lauf abgebrochen.
if ! git check-ignore -q backups/; then
  echo "ABBRUCH: backups/ ist nicht in .gitignore." >&2
  echo "Ein Export enthaelt personenbezogene Daten und darf nicht committet werden." >&2
  exit 1
fi

STEMPEL=$(date -u +%Y-%m-%dT%H-%M-%SZ)
# Absolut, nicht relativ: die Supabase-CLI loest `-f` gegen `--workdir infra`
# auf, nicht gegen das Arbeitsverzeichnis. Mit einem relativen Pfad schreibt sie
# nach infra/backups/... und scheitert mit "no such file or directory", weil
# mkdir das Verzeichnis eine Ebene hoeher angelegt hat.
AUSGABE="$REPO_ROOT/backups/$STEMPEL"

# ---------------------------------------------------------------------------
# 2. Bei --linked: bewusste Bestaetigung, wie beim Migrations-Guard
# ---------------------------------------------------------------------------
if [ "$ZIEL" = "--linked" ]; then
  echo "Ziel:      verlinktes Supabase-Projekt (Cloud)"
  echo "Ausgabe:   backups/$STEMPEL"
  echo
  echo "Dieser Export holt ECHTE personenbezogene Daten auf diese Festplatte."
  echo "Lege die Dateien danach verschluesselt und ausserhalb dieses Rechners ab."
  echo
  printf 'Zum Fortfahren "dump" eintippen: '
  if [ ! -t 0 ]; then
    echo
    echo "ABBRUCH: keine interaktive Eingabe moeglich." >&2
    echo "Dieser Export ist bewusst Handarbeit und laeuft nicht automatisiert." >&2
    exit 1
  fi
  read -r ANTWORT
  if [ "$ANTWORT" != "dump" ]; then
    echo "Abgebrochen." >&2
    exit 1
  fi
fi

mkdir -p "$AUSGABE"

# ---------------------------------------------------------------------------
# 3. Die drei Teile
# ---------------------------------------------------------------------------
echo "-- Rollen"
supabase db dump "$ZIEL" --workdir infra --role-only -f "$AUSGABE/roles.sql"

echo "-- Schema"
supabase db dump "$ZIEL" --workdir infra -f "$AUSGABE/schema.sql"

echo "-- Daten"
supabase db dump "$ZIEL" --workdir infra --data-only --use-copy -f "$AUSGABE/data.sql"

# ---------------------------------------------------------------------------
# 4. Manifest
# ---------------------------------------------------------------------------
# Ohne diese Zeilen ist spaeter nicht feststellbar, ob eine Datei unterwegs
# beschaedigt wurde und zu welchem Migrationsstand sie gehoert.
{
  echo "WEG-Verwaltung Datenbank-Export"
  echo "Zeitpunkt (UTC): $STEMPEL"
  echo "Ziel:            $ZIEL"
  echo "Git-HEAD:        $(git rev-parse HEAD)"
  echo "Git-Branch:      $(git rev-parse --abbrev-ref HEAD)"
  echo "Letzte Migration: $(ls infra/supabase/migrations/*.sql | tail -1 | xargs basename)"
  echo "Supabase-CLI:    $(supabase --version 2>/dev/null | head -1)"
  echo
  echo "SHA-256:"
  for DATEI in roles.sql schema.sql data.sql; do
    printf '  %s  %s\n' "$(shasum -a 256 "$AUSGABE/$DATEI" | cut -d' ' -f1)" "$DATEI"
  done
  echo
  echo "Nicht enthalten: Storage-Objekte (Bucket audit-archives) und Passwoerter"
  echo "eigener Rollen. Siehe docs/10-backup-und-wiederherstellung.md."
} > "$AUSGABE/manifest.txt"

echo
echo "Fertig: backups/$STEMPEL"
ls -lh "$AUSGABE"
echo
echo "Naechster Schritt: verschluesselt ausserhalb dieses Rechners ablegen."
echo "Ein Export, der nur hier liegt, ueberlebt genau die Ausfaelle nicht,"
echo "gegen die er schuetzen soll."
