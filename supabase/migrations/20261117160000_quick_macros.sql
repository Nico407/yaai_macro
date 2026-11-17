-- Quick entries: macros logged as numbers only ("500 kcal, 30 g protein"), no recipe or ingredients.
-- Logged by YAAI (log_macros, Telegram "500 kcal 30p 50c 20f", /macros). Saved eaten and fixed, so they count toward
-- the day and the other meals are sized to fill what's left; replanning keeps them (only uneaten meals are replaced).
-- They stay off the week planner.

alter table public.meal_logs add column if not exists kind text not null default 'meal';
alter table public.meal_logs drop constraint if exists meal_logs_kind_check;
alter table public.meal_logs add constraint meal_logs_kind_check check (kind in ('meal', 'quick'));

create or replace function public.mirror_log_to_planner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then return null; end if;
  if tg_op = 'DELETE' then
    delete from planned_meals where log_id = old.id;
    return null;
  end if;
  -- quick entries (just numbers, no recipe) are only for the day's log, not the week planner
  if new.kind = 'quick' then
    delete from planned_meals where log_id = new.id;
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

