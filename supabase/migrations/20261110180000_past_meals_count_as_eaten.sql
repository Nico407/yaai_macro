-- Days that are over: every meal on the log counts as eaten, ticked or not (ticking gets forgotten; a meal that
-- wasn't eaten is deleted from the log). Today: only the ticked meals, so the day fills up as meals are ticked.
-- meals_eaten still counts the ticked ones.

create or replace view public.nutrition_days with (security_invoker = true) as
with counted as (   -- every meal on the log, with whether it counts as eaten
  select l.*, l.eaten or l.log_date < (now() at time zone 'Europe/Zurich')::date as counts
  from public.meal_logs l
), micro as (
  select l.id,
         sum((i->>'grams')::numeric * coalesce(ing.fibre_per_100g, 0) / 100) as fibre_g,
         sum((i->>'grams')::numeric * coalesce(ing.salt_per_100g, 0) / 100)  as salt_g
  from counted l
  cross join lateral jsonb_array_elements(case when jsonb_typeof(l.ingredients_json) = 'array'
                                               then l.ingredients_json else '[]'::jsonb end) i
  left join public.ingredients ing on ing.id::text = i->>'ingredient_id'
  where l.counts
  group by l.id
), logs as (
  select l.user_id, l.log_date as day,
         count(*)                                         as meals_logged,
         count(*) filter (where l.eaten)                  as meals_eaten,
         coalesce(sum(l.kcal), 0)                         as kcal_logged,
         coalesce(sum(l.kcal)      filter (where l.counts), 0) as kcal,
         coalesce(sum(l.protein_g) filter (where l.counts), 0) as protein_g,
         coalesce(sum(l.carbs_g)   filter (where l.counts), 0) as carbs_g,
         coalesce(sum(l.fat_g)     filter (where l.counts), 0) as fat_g,
         coalesce(sum(m.fibre_g), 0)                      as fibre_g,
         coalesce(sum(m.salt_g), 0)                       as salt_g
  from counted l
  left join micro m on m.id = l.id
  group by l.user_id, l.log_date
), plan as (
  select user_id, plan_date as day, count(*) as meals_planned, coalesce(sum(kcal), 0) as kcal_planned
  from public.planned_meals
  group by user_id, plan_date
)
select coalesce(l.user_id, p.user_id) as user_id,
       coalesce(l.day, p.day)         as day,
       coalesce(p.meals_planned, 0)   as meals_planned,
       coalesce(l.meals_logged, 0)    as meals_logged,
       coalesce(l.meals_eaten, 0)     as meals_eaten,
       coalesce(p.kcal_planned, 0)    as kcal_planned,
       coalesce(l.kcal_logged, 0)     as kcal_logged,
       coalesce(l.kcal, 0)            as kcal,
       coalesce(l.protein_g, 0)       as protein_g,
       coalesce(l.carbs_g, 0)         as carbs_g,
       coalesce(l.fat_g, 0)           as fat_g,
       round(coalesce(l.fibre_g, 0), 1) as fibre_g,
       round(coalesce(l.salt_g, 0), 2)  as salt_g
from logs l
full join plan p on p.user_id = l.user_id and p.day = l.day;
grant select on public.nutrition_days to authenticated, service_role;
