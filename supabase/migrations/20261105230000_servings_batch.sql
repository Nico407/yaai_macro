-- Servings and batch cooking.
--   servings: how many servings the recipe (its ingredient amounts) makes. 1 serving = the batch / servings, and
--             the planner works from one serving, never the whole pot.
--   batch_cooked: cooked ahead in a batch, so its ingredients can't be changed one by one any more: the planner
--             only changes how much you eat (0.5 to 1.5 servings), never the proportions.
--   cooked_weight_g: what the whole batch weighs once cooked (soups gain or lose water), so a meal can say how
--             much to put in the bowl.
alter table public.recipes add column if not exists servings integer not null default 1;
alter table public.recipes add column if not exists batch_cooked boolean not null default false;
alter table public.recipes add column if not exists cooked_weight_g numeric;
do $$ begin
  alter table public.recipes add constraint recipes_servings_positive check (servings >= 1);
exception when duplicate_object then null; end $$;

-- What a meal is in those terms: 1.2 servings, 372 g (cooked weight when known). Moves with the portion.
alter table public.meal_logs add column if not exists servings numeric;
alter table public.meal_logs add column if not exists portion_g numeric;
