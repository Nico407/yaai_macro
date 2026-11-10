-- Today's plan (meal_logs) and the week planner (planned_meals) stay in step.
--
--   * A meal on a day's plan has a twin in the week planner (planned_meals.log_id = its meal_logs.id). Adding,
--     changing or removing it on either side does the same on the other.
--   * When a day starts, the meals planned for it move onto its plan: sync_meal_day(day) puts every planned meal
--     of that day that isn't on the plan yet onto it (once: planned_meals.logged). The app calls it when the Today
--     page opens and from "Log day"; YAAI calls it for the Hub, /meal and before planning.
--   * A meal added in the week planner for today goes straight onto today's plan.
--
-- "Today" is Zurich time. The triggers only act on the outermost change (pg_trigger_depth() = 1), so a change
-- copied to the twin doesn't bounce back.

alter table public.planned_meals add column if not exists log_id uuid;
alter table public.planned_meals add column if not exists logged boolean not null default false;
create index if not exists planned_meals_log_id on public.planned_meals (log_id) where log_id is not null;

create or replace function public.zurich_today() returns date language sql stable as $$
  select (now() at time zone 'Europe/Zurich')::date
$$;

-- the week planner shows one meal per slot: a second one in a taken slot becomes an extra (slot null)
create or replace function public.planner_slot(p_user uuid, p_date date, p_slot text, p_except uuid default null)
returns text language sql stable as $$
  select case when p_slot is null or exists (
    select 1 from public.planned_meals where user_id = p_user and plan_date = p_date and slot = p_slot
      and id is distinct from p_except) then null else p_slot end
$$;

-- meal_logs -> planned_meals
create or replace function public.mirror_log_to_planner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then return null; end if;
  if tg_op = 'DELETE' then
    delete from planned_meals where log_id = old.id;
    return null;
  end if;
  if tg_op = 'INSERT' then
    if new.user_id is null or new.log_date is null
       or exists (select 1 from planned_meals where log_id = new.id) then return null; end if;
    insert into planned_meals (user_id, plan_date, slot, recipe_id, recipe_name, total_grams, kcal, protein_g,
                               carbs_g, fat_g, is_fixed, instructions, ingredients_json, log_id, logged)
    values (new.user_id, new.log_date, planner_slot(new.user_id, new.log_date, new.slot), new.recipe_id,
            new.recipe_name, coalesce(new.total_grams, 0), coalesce(new.kcal, 0), coalesce(new.protein_g, 0),
            coalesce(new.carbs_g, 0), coalesce(new.fat_g, 0), coalesce(new.is_fixed, false), new.instructions,
            coalesce(new.ingredients_json, '[]'::jsonb), new.id, true);
    return null;
  end if;
  -- UPDATE: same meal, new amounts / dish / slot / day
  update planned_meals p set
    plan_date = new.log_date, recipe_id = new.recipe_id, recipe_name = new.recipe_name,
    total_grams = coalesce(new.total_grams, 0), kcal = coalesce(new.kcal, 0), protein_g = coalesce(new.protein_g, 0),
    carbs_g = coalesce(new.carbs_g, 0), fat_g = coalesce(new.fat_g, 0), is_fixed = coalesce(new.is_fixed, false),
    instructions = new.instructions, ingredients_json = coalesce(new.ingredients_json, '[]'::jsonb),
    slot = case when new.slot is distinct from old.slot or new.log_date is distinct from old.log_date
                then planner_slot(new.user_id, new.log_date, new.slot, p.id) else p.slot end
  where p.log_id = new.id;
  return null;
end $$;

drop trigger if exists meal_logs_mirror on public.meal_logs;
create trigger meal_logs_mirror after insert or update or delete on public.meal_logs
  for each row execute function public.mirror_log_to_planner();

-- planned_meals -> meal_logs
create or replace function public.mirror_planner_to_log() returns trigger
language plpgsql security definer set search_path = public as $$
declare lid uuid;
begin
  if pg_trigger_depth() > 1 then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'INSERT' then
    -- planned for today in the week planner: onto today's plan right away
    if new.log_id is null and new.plan_date = zurich_today() and new.user_id is not null then
      lid := gen_random_uuid();
      new.log_id := lid;
      new.logged := true;
      insert into meal_logs (id, user_id, log_date, slot, recipe_id, recipe_name, total_grams, kcal, protein_g,
                             carbs_g, fat_g, is_fixed, instructions, ingredients_json, eaten)
      values (lid, new.user_id, new.plan_date, new.slot, new.recipe_id, new.recipe_name, new.total_grams, new.kcal,
              new.protein_g, new.carbs_g, new.fat_g, new.is_fixed, new.instructions, new.ingredients_json, false);
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    -- removing today's or a coming day's meal in the planner takes it off that day's plan too (past days are history)
    if old.log_id is not null and old.plan_date >= zurich_today() then
      delete from meal_logs where id = old.log_id and not eaten;
    end if;
    return old;
  end if;
  -- UPDATE: amounts / dish changed in the planner (rebalanced day, swapped meal); slot only when it has one
  if new.log_id is not null then
    update meal_logs l set
      log_date = new.plan_date, recipe_id = new.recipe_id, recipe_name = new.recipe_name,
      total_grams = new.total_grams, kcal = new.kcal, protein_g = new.protein_g, carbs_g = new.carbs_g,
      fat_g = new.fat_g, is_fixed = new.is_fixed, instructions = new.instructions,
      ingredients_json = new.ingredients_json, slot = coalesce(new.slot, l.slot)
    where l.id = new.log_id;
  end if;
  return new;
end $$;

drop trigger if exists planned_meals_mirror on public.planned_meals;
create trigger planned_meals_mirror before insert or update or delete on public.planned_meals
  for each row execute function public.mirror_planner_to_log();

-- A day's planned meals onto its plan (the day has started, or "Log day"). Returns how many were added.
create or replace function public.sync_meal_day(p_date date default null, p_user uuid default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  uid uuid := coalesce(auth.uid(), p_user);
  d date := coalesce(p_date, zurich_today());
  p record;
  lid uuid;
  n integer := 0;
begin
  if uid is null then raise exception 'sync_meal_day: no user'; end if;
  for p in select * from planned_meals where user_id = uid and plan_date = d and not logged and log_id is null
           order by created_at loop
    lid := gen_random_uuid();
    -- link first, so the new log row's trigger sees its twin and doesn't make another one
    update planned_meals set log_id = lid, logged = true where id = p.id;
    insert into meal_logs (id, user_id, log_date, slot, recipe_id, recipe_name, total_grams, kcal, protein_g,
                           carbs_g, fat_g, is_fixed, instructions, ingredients_json, eaten)
    values (lid, uid, d, p.slot, p.recipe_id, p.recipe_name, p.total_grams, p.kcal, p.protein_g, p.carbs_g,
            p.fat_g, p.is_fixed, p.instructions, p.ingredients_json, false);
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function public.sync_meal_day(date, uuid) from public, anon;
grant execute on function public.sync_meal_day(date, uuid) to authenticated, service_role;

-- Existing data. Past days: the planner is history, leave it. Today: pair planned meals with plan meals by name
-- (YAAI already copied today into both); then plan meals without a twin get one, planned ones without a twin go
-- onto the plan. Coming days: untouched (they move over when their day starts).
do $$
declare
  today date := zurich_today();
begin
  update planned_meals set logged = true where plan_date < today and not logged;

  with p as (
    select id, user_id, recipe_name, row_number() over (partition by user_id, recipe_name order by created_at) n
    from planned_meals where plan_date = today and log_id is null
  ), l as (
    select id, user_id, recipe_name, row_number() over (partition by user_id, recipe_name order by logged_at) n
    from meal_logs where log_date = today
      and not exists (select 1 from planned_meals x where x.log_id = meal_logs.id)
  )
  update planned_meals t set log_id = l.id, logged = true
  from p join l on l.user_id = p.user_id and l.recipe_name = p.recipe_name and l.n = p.n
  where t.id = p.id;

  insert into planned_meals (user_id, plan_date, slot, recipe_id, recipe_name, total_grams, kcal, protein_g, carbs_g,
                             fat_g, is_fixed, instructions, ingredients_json, log_id, logged)
  select l.user_id, l.log_date, null, l.recipe_id, l.recipe_name, coalesce(l.total_grams, 0), coalesce(l.kcal, 0),
         coalesce(l.protein_g, 0), coalesce(l.carbs_g, 0), coalesce(l.fat_g, 0), coalesce(l.is_fixed, false),
         l.instructions, coalesce(l.ingredients_json, '[]'::jsonb), l.id, true
  from meal_logs l
  where l.log_date = today and l.user_id is not null
    and not exists (select 1 from planned_meals x where x.log_id = l.id);
  -- give those extras their slot where it's free
  update planned_meals t set slot = l.slot
  from meal_logs l
  where t.log_id = l.id and t.plan_date = today and t.slot is null and l.slot is not null
    and not exists (select 1 from planned_meals o where o.user_id = t.user_id and o.plan_date = today and o.slot = l.slot);
end $$;

-- the planned meals of today without a twin go onto today's plan (as if the day had just started)
do $$
declare u uuid;
begin
  for u in select distinct user_id from planned_meals
           where plan_date = zurich_today() and log_id is null and user_id is not null loop
    perform sync_meal_day(zurich_today(), u);
  end loop;
end $$;
