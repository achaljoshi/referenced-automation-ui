#!/usr/bin/env bash
# ============================================================================
# Runs the full suite, and if any scenarios failed, re-runs exactly those
# scenarios once from the Cucumber rerun file. Mirrors the retry step used
# in .gitlab-ci.yml / .github/workflows/ci.yml so you can reproduce a CI
# retry locally.
#
# Usage: ./scripts/retry-failed.sh [extra mvn args...]
#   e.g. ./scripts/retry-failed.sh -Dbrowser=firefox -Denv=stage
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

RERUN_FILE="target/cucumber-reports/rerun.txt"
MVN="./mvnw"
[ -x "$MVN" ] || MVN="mvn"

echo "== First attempt =========================================="
rm -f "$RERUN_FILE"
$MVN -q clean test "$@" || true

if [ ! -s "$RERUN_FILE" ]; then
  echo "No failed scenarios recorded in $RERUN_FILE - nothing to retry."
  exit 0
fi

echo ""
echo "== Failures detected, retrying just the failed scenarios =="
cat "$RERUN_FILE"
echo ""

# cucumber-junit-platform-engine's `cucumber.features` property takes a
# comma-separated list of feature paths - it does NOT understand the
# classic Cucumber CLI's "@rerun.txt" indirection (that's a
# io.cucumber.core.cli.Main-only convention). Passing "@$RERUN_FILE"
# directly silently discovers zero tests instead of erroring, so build the
# comma-separated list ourselves from the rerun file's lines.
RETRY_FEATURES=$(paste -sd, "$RERUN_FILE")

# Maven Surefire is configured with testFailureIgnore=true (see pom.xml) so
# it always exits 0 here regardless of outcome - re-check the rerun file
# itself (rewritten fresh by the "rerun:" plugin on every invocation, empty
# when everything passes) rather than trusting $?.
$MVN -q test "$@" "-Dcucumber.features=${RETRY_FEATURES}" || true

if [ -s "$RERUN_FILE" ]; then
  echo "Scenarios still failing after retry - treat this as a real failure:"
  cat "$RERUN_FILE"
  exit 1
fi
echo "All previously-failed scenarios passed on retry."
exit 0
