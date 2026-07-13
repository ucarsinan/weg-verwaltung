#!/usr/bin/env sh
# Deterministisch, git-only, keine Secrets/Cloud-Zugriffe.
#
# Prueft, ob PROJECT_REALITY.md seit dem letzten Refresh-Commit hinter dem
# tatsaechlichen Produktcode zurueckgefallen ist. Ersetzt keine inhaltliche
# Audit-Arbeit (die bleibt Menschen-/Agenten-Urteil), macht Staleness aber
# systematisch sichtbar statt beilaeufig zu vergessen.
#
# Methode:
#   1. Letzten Commit finden, der PROJECT_REALITY.md veraendert hat.
#   2. Alle Commits seither zaehlen, die Produktcode beruehren
#      (apps/, infra/supabase/migrations/, packages/).
#   3. Ueber COMMIT_THRESHOLD oder DAY_THRESHOLD -> Warnung mit Commit-Liste.
#
# Exit-Code: immer 0, ausser mit --strict (dann 1 bei Staleness). Damit ist
# der Check standardmaessig informativ (verify.sh, lokale Nutzung) und kann
# in CI optional als eigener, klar benannter Non-Blocking-Job laufen.

set -eu

COMMIT_THRESHOLD="${PROJECT_REALITY_COMMIT_THRESHOLD:-8}"
DAY_THRESHOLD="${PROJECT_REALITY_DAY_THRESHOLD:-10}"
STRICT=0
if [ "${1:-}" = "--strict" ]; then
  STRICT=1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "check-project-reality-freshness: kein Git-Repository, ueberspringe."
  exit 0
fi

if [ ! -f PROJECT_REALITY.md ]; then
  echo "check-project-reality-freshness: PROJECT_REALITY.md nicht gefunden, ueberspringe."
  exit 0
fi

last_touch="$(git log -1 --format=%H -- PROJECT_REALITY.md || true)"
if [ -z "$last_touch" ]; then
  echo "check-project-reality-freshness: PROJECT_REALITY.md ist nicht versioniert, ueberspringe."
  exit 0
fi

last_touch_date="$(git log -1 --format=%ad --date=short -- PROJECT_REALITY.md)"
days_since="$(( ( $(date +%s) - $(git log -1 --format=%at -- PROJECT_REALITY.md) ) / 86400 ))"

relevant_commits="$(git log "${last_touch}..HEAD" --format=%H -- apps/ infra/supabase/migrations/ packages/ 2>/dev/null || true)"
commit_count=0
if [ -n "$relevant_commits" ]; then
  commit_count="$(printf '%s\n' "$relevant_commits" | wc -l | tr -d ' ')"
fi

echo "== PROJECT_REALITY.md Freshness =="
echo "Letzter Refresh: $last_touch_date ($last_touch), vor $days_since Tag(en)."
echo "Produktcode-Commits seither: $commit_count (Schwelle: $COMMIT_THRESHOLD)"

stale=0
if [ "$commit_count" -ge "$COMMIT_THRESHOLD" ] || [ "$days_since" -ge "$DAY_THRESHOLD" ]; then
  stale=1
fi

if [ "$stale" -eq 1 ]; then
  echo ""
  echo "STALE: PROJECT_REALITY.md sollte vor der naechsten groesseren Aufgabe aktualisiert werden."
  echo "Nicht dokumentierte Commits (apps/, infra/supabase/migrations/, packages/):"
  git log "${last_touch}..HEAD" --format='  %h %ad %s' --date=short -- apps/ infra/supabase/migrations/ packages/
  echo ""
  echo "Naechster Schritt: PROJECT_REALITY.md gemaess der bestehenden Audit-Methode"
  echo "(Implemented / Partially implemented / Not verified / Next Logical Step) neu schreiben."
  if [ "$STRICT" -eq 1 ]; then
    exit 1
  fi
else
  echo "OK: kein Staleness-Schwellenwert ueberschritten."
fi

exit 0
