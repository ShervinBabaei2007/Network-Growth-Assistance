#!/usr/bin/env bash
# Rehearses a backup and restore against the LOCAL Supabase database (`npm run db:start` first):
# dumps the public and auth schemas, restores them into a scratch database and compares the row count of
# every public table. It proves the backup is complete and that a restore works, and tells you how long it takes.
# It does not touch a hosted project. For that, see "Backups and restore" in docs/DEPLOYMENT.md.
#
#   bash scripts/restore-rehearsal.sh
set -euo pipefail
export MSYS_NO_PATHCONV=1

DB="$(docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -1)"
[ -n "$DB" ] || { echo "No local Supabase database is running. Run: npm run db:start" >&2; exit 1; }
SCRATCH=rehearsal
psqlx() { docker exec -i "$DB" psql -v ON_ERROR_STOP=1 -U supabase_admin "$@"; }

echo "Backing up from $DB ..."
start=$(date +%s)
docker exec "$DB" pg_dump -U postgres -Fc --no-owner -n public -n auth -f /tmp/rehearsal.dump postgres

echo "Restoring into a scratch database ..."
psqlx -d postgres -qc "drop database if exists $SCRATCH" -c "create database $SCRATCH"
# A fresh database needs the extensions schema first (embeddings use pgvector).
psqlx -d $SCRATCH -q -c "create schema extensions" -c 'create extension "uuid-ossp" with schema extensions' \
  -c "create extension pgcrypto with schema extensions" -c "create extension pg_trgm with schema extensions" -c "create extension vector with schema extensions"
# The one expected message is 'schema "public" already exists'; anything else is a real problem.
errors=$(docker exec "$DB" pg_restore -U supabase_admin -d $SCRATCH --no-owner /tmp/rehearsal.dump 2>&1 | grep '^pg_restore: error' | grep -v 'schema "public" already exists' || true)
end=$(date +%s)
if [ -n "$errors" ]; then echo "Restore reported problems:" >&2; echo "$errors" >&2; exit 1; fi

echo "Comparing row counts ..."
counts_sql="select string_agg(format('select %L as t, count(*) as n from public.%I', table_name, table_name), ' union all ' order by table_name) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'"
counts() { docker exec "$DB" psql -U postgres -d "$1" -At -c "$(docker exec "$DB" psql -U postgres -d "$1" -At -c "$counts_sql") order by 1"; }
a=$(counts postgres); b=$(counts $SCRATCH)
psqlx -d postgres -qc "drop database $SCRATCH"
if [ "$a" = "$b" ]; then
  echo "OK: $(echo "$b" | wc -l | tr -d ' ') tables match. Backup and restore took $((end - start)) seconds."
else
  echo "Row counts differ between the original and the restore:" >&2
  diff <(echo "$a") <(echo "$b") >&2 || true
  exit 1
fi
