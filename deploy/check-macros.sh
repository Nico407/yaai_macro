#!/usr/bin/env bash
# Health check of the macro tracker's data in MacroTacker. Prints no emails, keys or passwords: safe to paste.
#   1. who owns the recipes, meal logs and profile (the Pi's login, another account, or nobody)
#   2. the access rules on recipes and their ingredients
#   3. ingredients whose kcal don't match their protein / carbs / fat (4 / 4 / 9 kcal per gram, ±15 %)
#   4. recipes whose ingredient shares don't add up to 100 %
#   5. how the cook book's kcal look (per 100 g or per serving)
set -euo pipefail
cd "$(dirname "$0")/.."
val() { grep -E "^$1=" .env.local | head -n1 | cut -d= -f2- | sed -E "s/^\"(.*)\"\$/\1/; s/^'(.*)'\$/\1/"; }
db=$(val MACRO_DB_URL); email=$(val VITE_AUTO_LOGIN_EMAIL)
[ -n "$db" ] && [ -n "$email" ] || { echo "MACRO_DB_URL and VITE_AUTO_LOGIN_EMAIL are needed in .env.local"; exit 1; }
{ echo "select set_config('check.email', :'email', false) \\gset"; cat <<'SQL'
\pset footer off
\echo '== 1. Owners (you = the Pi login)'
with me as (select id from auth.users where lower(email) = lower(current_setting('check.email')))
select t as "table", case when owner is null then 'nobody' when owner = (select id from me) then 'you' else 'other account' end as owner, count(*)
from (select 'recipes' t, user_id owner from public.recipes
      union all select 'meal_logs', user_id from public.meal_logs
      union all select 'profile', user_id from public.profile) x
group by 1, 2 order by 1, 2;
\echo '== 1b. Accounts in MacroTacker'
select count(*) as accounts from auth.users;
\echo '== 2. Access rules'
select tablename, policyname, cmd from pg_policies where schemaname = 'public' and tablename in ('recipes', 'recipe_ingredients') order by 1, 3;
\echo '== 3. Ingredients whose kcal do not match their macros (more than 15 % off)'
select name, kcal_per_100g as kcal, round(4 * protein_per_100g + 4 * carbs_per_100g + 9 * fat_per_100g) as from_macros
from public.ingredients
where abs(kcal_per_100g - (4 * protein_per_100g + 4 * carbs_per_100g + 9 * fat_per_100g)) > greatest(15, 0.15 * kcal_per_100g)
order by name;
\echo '== 4. Recipes whose ingredient shares do not add up to 100 % (0 = no ingredients saved)'
select r.name, round(coalesce(sum(ri.ratio), 0) * 100, 1) as percent from public.recipes r left join public.recipe_ingredients ri on ri.recipe_id = r.id
group by r.id, r.name having abs(coalesce(sum(ri.ratio), 0) - 1) > 0.01;
\echo '== 5. Cook book kcal'
select count(*) as recipes, min(kcal), round(avg(kcal)) as avg, max(kcal) from public.cookbook_recipes;
SQL
} | psql "$db" -X -q -v email="$email" -f -
