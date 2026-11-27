#!/usr/bin/env bash
# Copy the local Invex database (schema invex, tables, data, functions, triggers, views) into the team's
# Supabase project. Run it once, from the repo root, by one person. See docs/supabase-setup.md.
#
#   SUPABASE_DB_URL='postgresql://postgres.<project-ref>:<password>@<pooler-host>:5432/postgres?sslmode=require' \
#     ./scripts/supabase-push.sh
#
# It refuses to run if Supabase already has schema invex, and loads everything in one transaction,
# so a failure leaves Supabase unchanged.
set -euo pipefail

: "${SUPABASE_DB_URL:?Set SUPABASE_DB_URL to the Session pooler connection string (docs/supabase-setup.md)}"
cd "$(dirname "$0")/.."
set -a; . backend/.env; set +a                     # local database settings (DB_HOST, DB_NAME, ...)
export PGPASSWORD="${DB_PASSWORD:-}"               # for the local dump; the Supabase URL carries its own password

if [ "${DB_SSL:-false}" = "true" ]; then
  echo "backend/.env already points at a hosted database. Run this with your LOCAL settings in backend/.env." >&2
  exit 1
fi

if psql "$SUPABASE_DB_URL" -Atc "SELECT 1 FROM information_schema.schemata WHERE schema_name = 'invex'" | grep -q 1; then
  echo "Supabase already has schema invex. Nothing was changed." >&2
  exit 1
fi

dump="$(mktemp -t invex-dump)"
trap 'rm -f "$dump"' EXIT
echo "Dumping ${DB_NAME} (schema invex) from ${DB_HOST}..."
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  --schema=invex --no-owner --no-privileges -f "$dump"
sed -i '' -e '/^SET transaction_timeout/d' "$dump"   # PostgreSQL 17+ only; harmless to drop

echo "Loading into Supabase (one transaction)..."
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 --single-transaction -q -f "$dump"

echo "Check:"
psql "$SUPABASE_DB_URL" -At -c "
  SELECT 'tables   ' || count(*) FROM information_schema.tables WHERE table_schema = 'invex' AND table_type = 'BASE TABLE'
  UNION ALL SELECT 'views    ' || count(*) FROM information_schema.views WHERE table_schema = 'invex'
  UNION ALL SELECT 'triggers ' || count(DISTINCT trigger_name) FROM information_schema.triggers WHERE trigger_schema = 'invex'
  UNION ALL SELECT 'users    ' || count(*) FROM invex.users
  UNION ALL SELECT 'products ' || count(*) FROM invex.products;"
echo "Done. Compare these with the same counts on your local database."
