
-- Single-user macro tracker (no auth yet). Public read/write policies.

create table public.profile (
  id uuid primary key default gen_random_uuid(),
  display_name text,
  age int,
  sex text check (sex in ('male','female')),
  height_cm numeric,
  weight_kg numeric,
  activity_level text check (activity_level in ('sedentary','light','moderate','active','very_active')),
  goal text check (goal in ('cut','maintain','bulk')),
  target_calories numeric,
  target_protein_g numeric,
  target_carbs_g numeric,
  target_fat_g numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  -- macros per 100g
  kcal_per_100g numeric not null,
  protein_per_100g numeric not null default 0,
  carbs_per_100g numeric not null default 0,
  fat_per_100g numeric not null default 0,
  created_at timestamptz not null default now()
);

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  -- default total grams per serving (used as a starting point before scaling)
  default_serving_g numeric not null default 400,
  -- minimum and maximum total grams allowed when scaling, to keep portions sensible
  min_total_g numeric not null default 150,
  max_total_g numeric not null default 1200,
  created_at timestamptz not null default now()
);

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  -- weight ratio of this ingredient relative to the whole recipe (0..1). Ratios per recipe should sum to 1.
  ratio numeric not null check (ratio > 0 and ratio <= 1),
  unique (recipe_id, ingredient_id)
);

create table public.meal_logs (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid references public.recipes(id) on delete set null,
  recipe_name text not null,
  total_grams numeric not null,
  kcal numeric not null,
  protein_g numeric not null,
  carbs_g numeric not null,
  fat_g numeric not null,
  -- ingredient breakdown after scaling, stored for history
  ingredients_json jsonb,
  logged_at timestamptz not null default now(),
  log_date date not null default (now() at time zone 'utc')::date
);

create index meal_logs_log_date_idx on public.meal_logs(log_date);
create index recipe_ingredients_recipe_idx on public.recipe_ingredients(recipe_id);

-- Enable RLS, permissive policies (single-user, no auth phase)
alter table public.profile enable row level security;
alter table public.ingredients enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.meal_logs enable row level security;

create policy "public all profile" on public.profile for all using (true) with check (true);
create policy "public all ingredients" on public.ingredients for all using (true) with check (true);
create policy "public all recipes" on public.recipes for all using (true) with check (true);
create policy "public all recipe_ingredients" on public.recipe_ingredients for all using (true) with check (true);
create policy "public all meal_logs" on public.meal_logs for all using (true) with check (true);

-- updated_at trigger for profile
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profile_set_updated_at
before update on public.profile
for each row execute function public.set_updated_at();
