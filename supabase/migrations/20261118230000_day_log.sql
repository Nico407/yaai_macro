-- Day log: nicotine and drinks (yes / no per day) and dancing and wrestling (how often, every tap +1), in the body
-- log like water and sleep. Logged from the Hub's Day log widget, Telegram (/log, "danced", "wrestled twice",
-- "had drinks"), the morning check-in ("Yesterday: nicotine? drinks?") and YAAI. Shown in Analytics (Recovery,
-- Weight, Relationships).
--
-- body_metrics: nicotine / drinks are 1 (yes) or 0 (no, answered), at most one per day (the app replaces it);
-- dancing / wrestling one row per tap (value = how many times, usually 1).
-- body_days and day_summary get the four as new last columns.

alter table public.body_metrics drop constraint if exists body_metrics_metric_check;
alter table public.body_metrics add constraint body_metrics_metric_check
  check (metric in ('weight', 'water', 'sleep', 'steps', 'rhr', 'energy', 'nicotine', 'drinks', 'dancing', 'wrestling'));

-- a "no" for nicotine / drinks is stored as 0; every other reading stays above 0
alter table public.body_metrics drop constraint if exists body_metrics_value_check;
alter table public.body_metrics add constraint body_metrics_value_check
  check (value > 0 or (value = 0 and metric in ('nicotine', 'drinks')));

create or replace view public.body_days with (security_invoker = true) as
select user_id, day,
       (array_agg(value order by measured_at) filter (where metric = 'weight'))[1] as weight_kg,
       coalesce(sum(value) filter (where metric = 'water'), 0) as water_ml,
       (array_agg(value order by measured_at desc) filter (where metric = 'sleep'))[1] as sleep_h,
       max(value) filter (where metric = 'steps') as steps,
       (array_agg(value order by measured_at desc) filter (where metric = 'rhr'))[1] as rhr_bpm,
       (array_agg(value order by measured_at desc) filter (where metric = 'energy'))[1] as energy,
       max(value) filter (where metric = 'nicotine') as nicotine,
       max(value) filter (where metric = 'drinks') as drinks,
       sum(value) filter (where metric = 'dancing') as dancing,
       sum(value) filter (where metric = 'wrestling') as wrestling
from public.body_metrics
group by user_id, day;
grant select on public.body_days to authenticated, service_role;

create or replace view public.day_summary with (security_invoker = true) as
with first_day as (
  select user_id, min(day) as d from (
    select user_id, day from public.nutrition_days
    union all select user_id, day from public.body_days
    union all select user_id, day from public.training_days) x
  group by user_id
), days as (
  select f.user_id, g::date as day
  from first_day f
  cross join lateral generate_series(f.d, (now() at time zone 'Europe/Zurich')::date, interval '1 day') g
), joined as (
  select d.user_id, d.day,
         n.kcal, n.protein_g, n.carbs_g, n.fat_g, n.fibre_g, n.salt_g, n.kcal_logged, n.kcal_planned,
         n.meals_planned, n.meals_eaten,
         b.weight_kg, b.water_ml, b.sleep_h, b.steps, b.rhr_bpm, b.energy,
         b.nicotine, b.drinks, b.dancing, b.wrestling,
         t.sessions, t.minutes, t.sets, t.reps, t.hold_s, t.volume_kg, t.avg_rpe, t.rating,
         t.muscle_sets, t.skill_steps
  from days d
  left join public.nutrition_days n using (user_id, day)
  left join public.body_days b      using (user_id, day)
  left join public.training_days t  using (user_id, day)
)
select j.user_id, j.day,
       -- nutrition (null = nothing eaten logged that day)
       nullif(j.kcal, 0) as kcal,
       case when j.kcal > 0 then j.protein_g end as protein_g, case when j.kcal > 0 then j.carbs_g end as carbs_g,
       case when j.kcal > 0 then j.fat_g end as fat_g, case when j.kcal > 0 then j.fibre_g end as fibre_g,
       case when j.kcal > 0 then j.salt_g end as salt_g,
       j.kcal_logged, j.kcal_planned, coalesce(j.meals_planned, 0) as meals_planned,
       coalesce(j.meals_eaten, 0) as meals_eaten,
       p.target_calories as kcal_target, p.target_protein_g as protein_target_g,
       -- body
       j.weight_kg, nullif(j.water_ml, 0) as water_ml, p.water_goal_ml, j.sleep_h, j.steps, j.rhr_bpm, j.energy,
       -- training (0 sessions = rest day)
       coalesce(j.sessions, 0) as sessions, j.minutes, coalesce(j.sets, 0) as sets, coalesce(j.reps, 0) as reps,
       coalesce(j.hold_s, 0) as hold_s, coalesce(j.volume_kg, 0) as volume_kg, j.avg_rpe, j.rating,
       coalesce(j.muscle_sets, '{}'::jsonb) as muscle_sets, coalesce(j.skill_steps, '{}'::jsonb) as skill_steps,
       -- 7-day averages (this day and the 6 before)
       round(avg(j.weight_kg) over w, 2)          as weight_7d,
       round(avg(nullif(j.kcal, 0)) over w)       as kcal_7d,
       round(avg(nullif(j.protein_g, 0)) over w)  as protein_7d,
       round(avg(nullif(j.water_ml, 0)) over w)   as water_7d,
       round(avg(j.sleep_h) over w, 1)            as sleep_7d,
       -- protein per kg bodyweight (7-day weight, so one heavy morning doesn't move it)
       round(nullif(j.protein_g, 0) / nullif(avg(j.weight_kg) over w, 0), 2) as protein_per_kg,
       -- day log: nicotine / drinks yes (1) or no (0; also when nothing was logged), dancing / wrestling how often
       coalesce(j.nicotine, 0)::int as nicotine, coalesce(j.drinks, 0)::int as drinks,
       coalesce(j.dancing, 0)::int as dancing, coalesce(j.wrestling, 0)::int as wrestling
from joined j
left join public.profile p on p.user_id = j.user_id
window w as (partition by j.user_id order by j.day range between interval '6 days' preceding and current row);
grant select on public.day_summary to authenticated, service_role;
