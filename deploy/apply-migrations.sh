#!/usr/bin/env bash
# Apply the macro tracker's database migrations (supabase/migrations/*.sql) to MacroTacker, each file once,
# recorded in public.macro_schema_migrations.
#
# MacroTacker got the macro tables when the data moved there, but not the week planner (planned_meals, August).
# So on the first run, every migration before the week planner is recorded as applied without running it, and
# the week planner and anything newer is applied.
#
# Needs MACRO_DB_URL in .env.local (the Session pooler connection string, the same as Lingo's LINGO_DB_URL;
# pi-update.sh copies it over).
set -euo pipefail
cd "$(dirname "$0")/.."

db_url=$(grep -E '^MACRO_DB_URL=' .env.local 2>/dev/null | head -n1 | cut -d= -f2- | sed -E "s/^\"(.*)\"\$/\1/; s/^'(.*)'\$/\1/")
if [ -z "$db_url" ]; then
  echo "No MACRO_DB_URL in .env.local, skipping database migrations."
  exit 0
fi
command -v psql >/dev/null 2>&1 || sudo apt-get install -y postgresql-client >/dev/null

q() { psql "$db_url" -v ON_ERROR_STOP=1 -qtAX -c "set client_min_messages = warning" "$@"; }
q -c "create table if not exists public.macro_schema_migrations (name text primary key, applied_at timestamptz not null default now());
      alter table public.macro_schema_migrations enable row level security;"

BASELINE="20260811000000"   # migrations before this were already in MacroTacker
if [ "$(q -c "select count(*) from public.macro_schema_migrations")" = "0" ] &&
   [ "$(q -c "select count(*) from information_schema.tables where table_schema='public' and table_name='meal_logs'")" = "1" ]; then
  for f in supabase/migrations/*.sql; do
    name=$(basename "$f")
    if [[ "$name" < "$BASELINE" ]]; then
      q -c "insert into public.macro_schema_migrations(name) values ('$name') on conflict do nothing"
    fi
  done
  echo "Macro tables exist already: recorded the migrations before the week planner as applied."
fi

applied=0
for f in $(ls supabase/migrations/*.sql | sort); do
  name=$(basename "$f")
  [ "$(q -c "select count(*) from public.macro_schema_migrations where name = '$name'")" = "1" ] && continue
  echo "==> Applying $name"
  { echo "begin;"; cat "$f"; echo; echo "insert into public.macro_schema_migrations(name) values ('$name');"; echo "commit;"; } | q -f -
  applied=$((applied + 1))
done
echo "Database up to date ($applied migration(s) applied)."
