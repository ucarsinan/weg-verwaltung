#!/usr/bin/env sh
set -eu

echo "== WEG-Verwaltung verify =="

if [ ! -f justfile ]; then
  echo "justfile nicht gefunden. Bitte im Repo-Root ausfuehren."
  exit 1
fi

if ! command -v just >/dev/null 2>&1; then
  echo "just ist nicht verfuegbar."
  exit 1
fi

echo "-- just lint"
just lint

echo "-- just typecheck"
just typecheck

echo "-- just test"
just test

echo "-- just build"
just build

check_untracked_file_whitespace() {
  file="$1"
  failed=0

  if grep -n '[[:blank:]]$' "$file" >/dev/null 2>&1; then
    echo "Trailing whitespace in untracked file: $file"
    grep -n '[[:blank:]]$' "$file" || true
    failed=1
  fi

  if [ -s "$file" ] && [ "$(tail -c 1 "$file" | wc -l | tr -d ' ')" = "0" ]; then
    echo "No newline at end of untracked file: $file"
    failed=1
  fi

  return "$failed"
}

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "-- git diff --check"
  git diff --check

  echo "-- untracked relevant files whitespace check"
  untracked_files="$(git ls-files --others --exclude-standard -- \
    '*.md' '*.ts' '*.tsx' '*.js' '*.jsx' '*.mjs' '*.cjs' '*.json' '*.yml' '*.yaml' '*.css' '*.sh' '*.py' '*.sql' '*.toml')"

  if [ -n "$untracked_files" ]; then
    echo "$untracked_files" | while IFS= read -r file; do
      [ -n "$file" ] || continue
      check_untracked_file_whitespace "$file"
    done
  else
    echo "Keine relevanten untracked Dateien gefunden."
  fi
else
  echo "-- skip git checks (kein Git-Repository erkannt)"
fi

echo "-- Remote-Sicherheitscheck"
echo "Nicht ausgefuehrt ohne Freigabe: just e2e, just db-migrate, just seed-admin, Supabase-Linked-Kommandos."

echo "== verify complete =="
