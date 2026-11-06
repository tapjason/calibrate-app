#!/usr/bin/env bash
# The repo's one check (HANDOFF.md, "Checks"): types, then every test.
# Stops at the first failure. Prints CHECK PASSED only when both pass.
#
#   bash scripts/check.sh

set -euo pipefail

cd "$(dirname "$0")/.."

echo "== Types (tsc --noEmit)"
npx tsc --noEmit

echo "== Tests (jest --ci)"
npx jest --ci

echo "CHECK PASSED"
