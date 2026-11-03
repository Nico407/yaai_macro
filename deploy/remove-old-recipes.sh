#!/usr/bin/env bash
# One-off: remove the own recipes from before the YAAI recipes, keeping the protein shake (supabase/seed/
# remove_old_recipes.sql). Runs once, recorded as cleanup:old_recipes_v1. Prints recipe names only.
set -euo pipefail
cd "$(dirname "$0")/.."
val() { grep -E "^$1=" .env.local 2>/dev/null | head -n1 | cut -d= -f2- | sed -E "s/^\"(.*)\"\$/\1/; s/^'(.*)'\$/\1/"; }
db=$(val MACRO_DB_URL); email=$(val VITE_AUTO_LOGIN_EMAIL)
[ -n "$db" ] && [ -n "$email" ] || exit 0
name="cleanup:old_recipes_v1"
[ "$(psql "$db" -qtAX -c "select count(*) from public.macro_schema_migrations where name = '$name'")" = "1" ] && exit 0
echo "==> Removing the old recipes (keeping the protein shake)"
psql "$db" -X -q -tA -v ON_ERROR_STOP=1 -v email="$email" -f supabase/seed/remove_old_recipes.sql
psql "$db" -qtAX -c "insert into public.macro_schema_migrations(name) values ('$name')"
