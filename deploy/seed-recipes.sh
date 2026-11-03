#!/usr/bin/env bash
# Add the YAAI recipes (supabase/seed/yaai_recipes.sql) to the Pi login's account, once. Recorded in
# macro_schema_migrations as seed:yaai_recipes_v1, so recipes you delete later don't come back on the next update.
# Run by apply-migrations.sh; safe to run by hand. Prints no emails or keys.
set -euo pipefail
cd "$(dirname "$0")/.."
val() { grep -E "^$1=" .env.local 2>/dev/null | head -n1 | cut -d= -f2- | sed -E "s/^\"(.*)\"\$/\1/; s/^'(.*)'\$/\1/"; }
db=$(val MACRO_DB_URL); email=$(val VITE_AUTO_LOGIN_EMAIL)
[ -n "$db" ] && [ -n "$email" ] || { echo "No MACRO_DB_URL / VITE_AUTO_LOGIN_EMAIL in .env.local, skipping the YAAI recipes."; exit 0; }
name="seed:yaai_recipes_v1"
done_=$(psql "$db" -qtAX -c "select count(*) from public.macro_schema_migrations where name = '$name'")
[ "$done_" = "1" ] && exit 0
echo "==> Adding the YAAI recipes"
psql "$db" -X -q -v ON_ERROR_STOP=1 -v email="$email" -f supabase/seed/yaai_recipes.sql
psql "$db" -qtAX -c "insert into public.macro_schema_migrations(name) values ('$name')"
echo "    $(psql "$db" -qtAX -c "select count(*) from public.recipes where 'yaai' = any(cuisine_tags)") YAAI recipes in your account."
