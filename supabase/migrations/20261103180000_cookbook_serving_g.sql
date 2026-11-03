-- The cook book's kcal / protein / carbs / fat are per SERVING (280-640 kcal), but the app read them as per 100 g,
-- so the grams it showed for a cook book meal were 3-4 times too small. serving_g is the weight of one serving,
-- added up from the amounts in its ingredient lines: "150 g salmon", "200 ml milk", "1 tbsp oil" (15 g), "1 tsp" (5 g),
-- "2 eggs" (55 g each), "1 cup" (240 g). If that gives less than 150 g, or an implausible energy density (more than
-- 400 kcal per 100 g), it falls back to kcal / 1.6 (an average meal, about 160 kcal per 100 g).
alter table public.cookbook_recipes add column if not exists serving_g numeric;

create or replace function pg_temp.line_grams(line text) returns numeric language sql immutable as $fn$
  select case
    when m[1] is null then 0
    when lower(m[2]) in ('g', 'gr', 'gram', 'grams', 'ml') then m[1]::numeric
    when lower(m[2]) = 'kg' then m[1]::numeric * 1000
    when lower(m[2]) in ('l') then m[1]::numeric * 1000
    when lower(m[2]) in ('tbsp', 'el') then m[1]::numeric * 15
    when lower(m[2]) in ('tsp', 'tl') then m[1]::numeric * 5
    when lower(m[2]) in ('cup', 'cups') then m[1]::numeric * 240
    when lower(m[2]) in ('egg', 'eggs') then m[1]::numeric * 55
    else 0 end
  from (select regexp_match(lower(line),
    '(\d+(?:[.,]\d+)?)\s*(kg|grams|gram|gr|g|ml|l|tbsp|el|tsp|tl|cups|cup|eggs|egg)\M') as m) x
$fn$;

update public.cookbook_recipes c set serving_g = round(case
    when f.total >= 150 and c.kcal / f.total * 100 <= 400 then f.total
    else c.kcal / 1.6 end)
from (
  select c2.id, coalesce((select sum(pg_temp.line_grams(replace(x, ',', '.')))
                          from jsonb_array_elements_text(to_jsonb(c2.ingredients)) x), 0) as total
  from public.cookbook_recipes c2
) f
where f.id = c.id and c.serving_g is null;

-- meals already planned from the cook book: same macros, but their grams were worked out per 100 g; correct them
update public.meal_logs l set total_grams = round(l.kcal / (c.kcal / c.serving_g))
from public.cookbook_recipes c
where l.recipe_id is null and l.recipe_name = c.name and c.kcal > 0 and c.serving_g > 0 and l.kcal > 0;
