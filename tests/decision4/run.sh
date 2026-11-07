#!/usr/bin/env bash
# Negative fixtures for the decision4 check (TEST-19): bad-* must fail, good-* must pass.
set -u
root=$(cd "$(dirname "$0")/../.." && pwd)
status=0
for d in "$root"/tests/decision4/*/; do
  name=$(basename "$d")
  BODY=$(cat "$d/body.md") FILES="$d/files.txt" MAP="$root/boundary-map.yaml" \
    python3 "$root/.github/scripts/decision4.py" >/dev/null 2>&1
  rc=$?
  case $name in
    bad-*) [ $rc -ne 0 ] || { echo "FAIL $name: gate passed"; status=1; } ;;
    good-*) [ $rc -eq 0 ] || { echo "FAIL $name: gate failed"; status=1; } ;;
  esac
done
[ $status -eq 0 ] && echo "decision4 fixtures ok"
exit $status
