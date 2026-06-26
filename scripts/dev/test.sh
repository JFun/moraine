#!/usr/bin/env bash
# Gravity-puzzle self-test (port of Lanthorn's discipline). Run after EVERY code
# change — it is the cost of a code change, not a separate decision.
#   syntax → engine determinism + rules → board solvability/par invariants.
set -euo pipefail
cd "$(dirname "$0")/../.."

echo "— syntax —"
for f in web/js/*.js scripts/dev/*.cjs; do
  node --check "$f"
done
echo "ok"

echo "— engine tests —"
node scripts/dev/engine-tests.cjs

echo "— board report (solvable + par + mash) —"
node scripts/dev/solver.cjs

echo "— growth-loop determinism golden —"
node scripts/dev/golden.cjs

echo "ALL TESTS PASSED"
