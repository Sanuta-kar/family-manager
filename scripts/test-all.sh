#!/usr/bin/env bash
#
# Run every test in the workspace, ensuring the API integration test database
# exists and is migrated first. Idempotent and safe to re-run.
#
# Env overrides:
#   TEST_DATABASE_URL   full connection string for the test DB
#   ADMIN_DATABASE_URL  connection string used to CREATE the test DB (defaults to
#                       the same server, "family_manager" maintenance database)
#
# Usage: pnpm test:all   (or: bash scripts/test-all.sh)
set -euo pipefail

cd "$(dirname "$0")/.."

TEST_DATABASE_URL="${TEST_DATABASE_URL:-postgresql://family:family@localhost:5433/family_manager_test?schema=public}"
ADMIN_DATABASE_URL="${ADMIN_DATABASE_URL:-postgresql://family:family@localhost:5433/family_manager?schema=public}"

# Test DB name = path segment of TEST_DATABASE_URL (strip query string).
TEST_DB_NAME="$(printf '%s' "$TEST_DATABASE_URL" | sed -E 's#.*/([^/?]+).*#\1#')"

echo "==> Ensuring integration test database '$TEST_DB_NAME' exists"
# CREATE DATABASE has no IF NOT EXISTS; ignore the "already exists" error on re-runs.
echo "CREATE DATABASE \"$TEST_DB_NAME\";" \
  | pnpm --filter @family-manager/api exec prisma db execute --url "$ADMIN_DATABASE_URL" --stdin \
  >/dev/null 2>&1 \
  && echo "    created" \
  || echo "    already present (or server unreachable) — continuing"

echo "==> Applying migrations to the test database"
DATABASE_URL="$TEST_DATABASE_URL" \
  pnpm --filter @family-manager/api exec prisma migrate deploy

echo "==> Running all workspace tests"
TEST_DATABASE_URL="$TEST_DATABASE_URL" pnpm -r test
