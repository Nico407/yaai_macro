-- Analytics foundation: one row per day joining nutrition, body and training (the "personal improvement log").
--
-- Read by the Hub's Analytics tab, exports, YAAI's weekly review and the dataset for training a model.
-- Built from views only, so nothing is copied and old days are always recomputed from the source rows.
--
-- 1. body_metrics takes more metrics: sleep (hours, the night before the day), steps, resting heart rate (bpm),
--    energy (how I feel in the morning, 1-5). Same append-only table; the wearable writes here later.
-- 2. workout_sessions.rating: how the session went, 1-5 (set at "finish workout"). Forge owns the table; added here
--    with "if not exists" so day_summary can read it whichever repo's migration runs first.
-- 3. Views: body_days (extended), nutrition_days, training_days, day_summary.

-- 1. more body metrics -------------------------------------------------------------------------------------------
alter table public.body_metrics drop constraint if exists body_metrics_metric_check;
alter table public.body_metrics add constraint body_metrics_metric_check
  check (metric in ('weight', 'water', 'sleep', 'steps', 'rhr', 'energy'));

-- weight: first reading of the day (morning weigh-in); water: sum; sleep / rhr / energy: latest; steps: highest
-- (a step counter only goes up during the day). New columns go at the end so the view can be replaced in place.
create or replace view public.body_days with (security_invoker = true) as
select user_id, day,
       (array_agg(value order by measured_at) filter (where metric = 'weight'))[1] as weight_kg,
       coalesce(sum(value) filter (where metric = 'water'), 0) as water_ml,
       (array_agg(value order by measured_at desc) filter (where metric = 'sleep'))[1] as sleep_h,
       max(value) filter (where metric = 'steps') as steps,
       (array_agg(value order by measured_at desc) filter (where metric = 'rhr'))[1] as rhr_bpm,
       (array_agg(value order by measured_at desc) filter (where metric = 'energy'))[1] as energy
from public.body_metrics
group by user_id, day;
grant select on public.body_days to authenticated, service_role;

-- 2. session rating ----------------------------------------------------------------------------------------------
alter table public.workout_sessions
  add column if not exists rating smallint check (rating between 1 and 5);

-- 3a. nutrition per day ------------------------------------------------------------------------------------------
-- Macros of the meals ticked as eaten. kcal_logged counts every meal on the log (eaten or not), for days before
-- ticking existed. Fibre and salt come from the saved ingredient grams × the ingredient's value per 100 g
-- (ingredients without a known value count as 0).
create or replace view public.nutrition_days with (security_invoker = true) as
with micro as (
  select l.id,
         sum((i->>'grams')::numeric * coalesce(ing.fibre_per_100g, 0) / 100) as fibre_g,
         sum((i->>'grams')::numeric * coalesce(ing.salt_per_100g, 0) / 100)  as salt_g
  from public.meal_logs l
  cross join lateral jsonb_array_elements(case when jsonb_typeof(l.ingredients_json) = 'array'
                                               then l.ingredients_json else '[]'::jsonb end) i
  left join public.ingredients ing on ing.id::text = i->>'ingredient_id'
  where l.eaten
  group by l.id
), logs as (
  select l.user_id, l.log_date as day,
         count(*)                                         as meals_logged,
         count(*) filter (where l.eaten)                  as meals_eaten,
         coalesce(sum(l.kcal), 0)                         as kcal_logged,
         coalesce(sum(l.kcal)      filter (where l.eaten), 0) as kcal,
         coalesce(sum(l.protein_g) filter (where l.eaten), 0) as protein_g,
         coalesce(sum(l.carbs_g)   filter (where l.eaten), 0) as carbs_g,
         coalesce(sum(l.fat_g)     filter (where l.eaten), 0) as fat_g,
         coalesce(sum(m.fibre_g), 0)                      as fibre_g,
         coalesce(sum(m.salt_g), 0)                       as salt_g
  from public.meal_logs l
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

-- 3b. training per day -------------------------------------------------------------------------------------------
-- Every logged set counts, finished session or not. The day is the Zurich date the session started.
-- volume_kg = reps × added weight (bodyweight work counts 0 there; reps and hold seconds carry it).
-- muscle_sets: {"lats": 6, "chest": 4, ...}, skill sets without a library exercise count under "skill".
-- skill_steps: highest step reached per ladder that day, {"Pull-up": 4, ...}.
create or replace view public.training_days with (security_invoker = true) as
with sets as (
  select w.user_id, (w.started_at at time zone 'Europe/Zurich')::date as day, w.id as session_id,
         s.reps, s.weight, s.seconds, s.rpe,
         coalesce(e.muscle_group, case when s.skill_step_id is not null then 'skill' else 'other' end) as muscle,
         sl.name as ladder, st.step_order
  from public.session_sets s
  join public.workout_sessions w on w.id = s.session_id
  left join public.exercise_library e on e.id = s.exercise_id
  left join public.skill_steps st on st.id = s.skill_step_id
  left join public.skill_ladders sl on sl.id = coalesce(s.skill_ladder_id, st.ladder_id)
), per_day as (
  select user_id, day,
         count(distinct session_id)           as sessions,
         count(*)                             as sets,
         coalesce(sum(reps), 0)               as reps,
         coalesce(sum(seconds), 0)            as hold_s,
         coalesce(sum(reps * weight), 0)      as volume_kg,
         round(avg(rpe), 1)                   as avg_rpe
  from sets group by user_id, day
), muscles as (
  select user_id, day, jsonb_object_agg(muscle, n) as muscle_sets
  from (select user_id, day, muscle, count(*) as n from sets group by 1, 2, 3) x
  group by user_id, day
), skills as (
  select user_id, day, jsonb_object_agg(ladder, top_step) as skill_steps
  from (select user_id, day, ladder, max(step_order) as top_step from sets
        where ladder is not null and step_order is not null group by 1, 2, 3) x
  group by user_id, day
), sessions as (
  select user_id, (started_at at time zone 'Europe/Zurich')::date as day,
         round(sum(extract(epoch from (completed_at - started_at)) / 60)
               filter (where completed_at is not null))::int as minutes,
         round(avg(rating), 1) as rating
  from public.workout_sessions group by 1, 2
)
select d.user_id, d.day, d.sessions, s.minutes, d.sets, d.reps, d.hold_s, d.volume_kg, d.avg_rpe, s.rating,
       coalesce(m.muscle_sets, '{}'::jsonb) as muscle_sets,
       coalesce(k.skill_steps, '{}'::jsonb) as skill_steps
from per_day d
left join muscles m  using (user_id, day)
left join skills k   using (user_id, day)
left join sessions s using (user_id, day);
grant select on public.training_days to authenticated, service_role;

-- 3c. one row per day --------------------------------------------------------------------------------------------
-- Every day from the first record to today, so gaps (no log, rest day) show as rows with nulls / zeros and rolling
-- windows are by calendar day. 7-day averages ignore days without a value. Targets are the current profile values
-- (the profile keeps no history).
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
       round(nullif(j.protein_g, 0) / nullif(avg(j.weight_kg) over w, 0), 2) as protein_per_kg
from joined j
left join public.profile p on p.user_id = j.user_id
window w as (partition by j.user_id order by j.day range between interval '6 days' preceding and current row);
grant select on public.day_summary to authenticated, service_role;
