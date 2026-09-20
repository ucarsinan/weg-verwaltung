#!/usr/bin/env sh
# Guard in front of `supabase db push` (see the db-migrate recipe in justfile).
#
# Why this exists:
#   `supabase db push` reads the migrations DIRECTORY, not git. Every .sql file
#   lying under infra/supabase/migrations/ is sent to the linked cloud project —
#   committed or not, reviewed or not, finished or not.
#
#   Every quality gate this repo has runs on git: PR review, sql-lint, the pgTAP
#   gate, the rule about staging only files that belong to the task. The deploy
#   runs on the filesystem. Those are two different sets of files, and nothing
#   reconciled them until this script.
#
#   On 2026-09-20 a dry run caught an untracked, half-written 0067 that a second
#   session was still typing in the deploy checkout. Without that dry run it
#   would have gone to production together with the intended 0066. The same
#   thing happens to a single developer with one unfinished migration on disk —
#   the second session only made it happen faster.
#
#   The freigabe rule in AGENTS.md governs WHO approves a push. It cannot govern
#   WHAT goes out, because the payload is decided by the directory contents at
#   the moment of execution, which the approval question never mentions.
#
# What it checks (all findings are reported, not just the first):
#   1. nothing uncommitted or untracked under infra/supabase/migrations/
#   2. HEAD is exactly origin/main — a reviewed, merged state
#   3. a dry run is printed and confirmed by hand before anything is written
#
# Bypassing: there is deliberately no override flag. Someone who truly must push
# an unmerged state can call `supabase db push` directly and owns that decision.
set -eu

MIG_DIR="infra/supabase/migrations"
TEST_DIR="infra/supabase/tests"
WORKDIR="infra"

echo "== db-migrate guard =="

if [ ! -f justfile ]; then
  echo "justfile nicht gefunden. Bitte im Repo-Root ausfuehren."
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Kein Git-Arbeitsverzeichnis — der Guard kann nicht pruefen, was ausgerollt wuerde."
  exit 1
fi

fail=0

# --- Check 1: the deploy payload must be exactly what git tracks -------------
dirty="$(git status --porcelain -- "$MIG_DIR")"
if [ -n "$dirty" ]; then
  echo "FEHLER: uncommittete oder untracked Dateien unter $MIG_DIR/"
  echo "$dirty" | sed 's/^/  /'
  echo "  Diese Dateien wuerden mitgepusht, obwohl sie nicht reviewed sind."
  fail=1
else
  echo "OK: $MIG_DIR/ entspricht dem committeten Stand."
fi

# --- Check 2: deploy a reviewed, merged state --------------------------------
if ! git fetch origin main --quiet 2>/dev/null; then
  echo "FEHLER: 'git fetch origin main' schlug fehl — ohne origin/main laesst sich"
  echo "  nicht pruefen, ob dieser Stand reviewed ist. Kein Push."
  fail=1
elif [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  echo "FEHLER: HEAD ist nicht origin/main."
  echo "  HEAD        $(git rev-parse --short HEAD)  ($(git rev-parse --abbrev-ref HEAD))"
  echo "  origin/main $(git rev-parse --short origin/main)"
  echo "  Ausgerollt wird nur ein gemergter Stand."
  fail=1
else
  echo "OK: HEAD ist origin/main ($(git rev-parse --short HEAD))."
fi

# --- Hinweis: Testdateien werden nicht gepusht, sind aber ein Signal ----------
# Geaenderte Vertraege bedeuten meist, dass gerade jemand an Migrationen
# arbeitet. Das blockiert nicht, soll aber vor dem Bestaetigen sichtbar sein.
tests_dirty="$(git status --porcelain -- "$TEST_DIR")"
if [ -n "$tests_dirty" ]; then
  echo "HINWEIS: geaenderte pgTAP-Vertraege im Arbeitsverzeichnis (werden nicht gepusht):"
  echo "$tests_dirty" | sed 's/^/  /'
  echo "  Deutet auf laufende Migrationsarbeit hin — genau hinsehen."
fi

if [ "$fail" -ne 0 ]; then
  echo "Abbruch: es wurde nichts an die Cloud gesendet."
  exit 1
fi

# --- Check 3: show what would happen, then ask -------------------------------
echo "-- dry run"
supabase db push --dry-run --workdir "$WORKDIR"

if [ ! -t 0 ]; then
  echo "Abbruch: nicht-interaktiv, keine Bestaetigung moeglich. Es wurde nichts gesendet."
  exit 1
fi

printf 'Diese Migrationen an das verlinkte CLOUD-Projekt senden? Tippe "push": '
read -r answer
if [ "$answer" != "push" ]; then
  echo "Abgebrochen. Es wurde nichts gesendet."
  exit 1
fi

echo "Bestaetigt."
