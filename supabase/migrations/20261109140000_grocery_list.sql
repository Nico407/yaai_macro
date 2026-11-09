-- Grocery list from the week planner, the same list in the app (Groceries page) and on Telegram (/groceries).
--
-- build_grocery_list(from, to) adds up the ingredients of the meals planned in those days (planned_meals.
-- ingredients_json, already sized to each portion) plus each recipe's unweighed extras (salt, hot sauce, ...), and
-- writes them to grocery_items: one row per food, sorted into a shop aisle, staples (salt, oil, spices, sauces)
-- marked to check at home. Ticks survive a rebuild for foods that stay on the list; items added by hand stay too.
-- Both the app (as the signed-in user) and YAAI on the Pi (service key, passing p_user) call it, so the list is
-- built in exactly one place.

create table if not exists public.grocery_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  key text not null,                         -- lower-case name, one row per food
  name text not null,
  grams numeric,                             -- null: no amount (to taste)
  aisle text not null default 'Other',
  staple boolean not null default false,     -- usually at home: check before you go
  recipes text[] not null default '{}',
  checked boolean not null default false,
  by_hand boolean not null default false,    -- added on the list itself, not from the planner
  from_date date,
  to_date date,
  created_at timestamptz not null default now(),
  unique (user_id, key)
);

grant select, insert, update, delete on public.grocery_items to authenticated;
grant all on public.grocery_items to service_role;
alter table public.grocery_items enable row level security;
drop policy if exists "Users manage their own grocery items" on public.grocery_items;
create policy "Users manage their own grocery items" on public.grocery_items for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 'Leek, raw' -> 'Leek', 'Milk (average)' -> 'Milk': what you'd write on a shopping list
create or replace function public.grocery_name(n text) returns text language sql immutable as $$
  select upper(left(t.s, 1)) || substr(t.s, 2)
  from (select btrim(regexp_replace(regexp_replace(btrim(n), '\s*\((average|durchschnitt|raw|roh)\)', '', 'gi'),
                                    ',\s*(raw|uncooked|dry|fresh|roh|frisch|average)\M.*$', '', 'i')) as s) t
$$;

-- usually at home: salt, oil, spices, sauces (not 'bell pepper', which is a vegetable)
create or replace function public.grocery_staple(n text) returns boolean language sql immutable as $$
  select lower(n) ~ '^(black |white |ground )?pepper(corns?)?( |,|$)'
      or lower(n) ~ ('(^|[^a-z])(salt|oil|vinegar|soy sauce|fish sauce|hot sauce|sriracha|tabasco|mustard|ketchup|'
        || 'honey|sugar|sweetener|stock cube|bouillon|baking powder|baking soda|vanilla|paprika|cumin|turmeric|'
        || 'cinnamon|oregano|thyme|rosemary|chil+i flakes|chil+i powder|curry powder|garam masala|garlic powder|'
        || 'onion powder|spice|seasoning|nutmeg|bay lea|sesame seed|cooking spray|gochujang|miso|tahini|worcestershire)')
$$;

create or replace function public.grocery_aisle(n text) returns text language sql immutable as $$
  select case
    when lower(n) ~ '(^|[^a-z])(coconut milk|peanut butter|almond butter|passata|tomato paste|tomato puree|canned|tinned|chickpea|lentil|kidney bean|black bean|white bean|beans|curry paste|stock|broth|jam|olives|capers|pesto|salsa|nuts|almond|cashew|walnut|peanut|seeds|chia|protein powder|whey)'
      then 'Pantry'
    when lower(n) ~ '(^|[^a-z])(chicken|beef|pork|lamb|turkey|veal|mince|steak|bacon|ham|prosciutto|sausage|chorizo|salmon|tuna|cod|trout|fish|shrimp|prawn|seafood)'
      then 'Meat & fish'
    when lower(n) ~ '(^|[^a-z])(milk|cheese|yogurt|yoghurt|skyr|quark|cream|butter|egg|feta|mozzarella|parmesan|cottage|ricotta|halloumi|tofu|tempeh)' and lower(n) !~ 'eggplant'
      then 'Dairy, eggs & tofu'
    when lower(n) ~ '(^|[^a-z])(bread|toast|tortilla|wrap|pita|bun|bagel|naan|rice|pasta|spaghetti|penne|noodle|soba|udon|ramen|oat|quinoa|couscous|bulgur|polenta|flour|granola|muesli|cereal)'
      then 'Bread, rice & pasta'
    when lower(n) ~ '(^|[^a-z])(frozen|edamame|ice)'
      then 'Frozen'
    when lower(n) ~ '(^|[^a-z])(leek|potato|onion|shallot|garlic|ginger|tomato|cucumber|carrot|bell pepper|red pepper|green pepper|yellow pepper|broccoli|cauliflower|spinach|lettuce|salad|rocket|arugula|zucchini|courgette|mushroom|cabbage|kale|avocado|lemon|lime|apple|banana|berr|mango|orange|pear|grape|kiwi|pineapple|herb|coriander|cilantro|parsley|basil|mint|dill|chive|spring onion|scallion|celery|aubergine|eggplant|sweet potato|corn|peas|pumpkin|squash|beetroot|radish|asparagus|fennel|chili|chilli|jalape)'
      then 'Fruit & veg'
    else 'Other' end
$$;

create or replace function public.build_grocery_list(p_from date, p_to date, p_user uuid default null)
returns setof public.grocery_items
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := coalesce(auth.uid(), p_user);   -- signed in: always yourself; the service key names the user
  ticked text[];
begin
  if uid is null then raise exception 'build_grocery_list: no user'; end if;
  if p_to < p_from then raise exception 'build_grocery_list: % is before %', p_to, p_from; end if;
  select coalesce(array_agg(key) filter (where checked), '{}') into ticked from grocery_items where user_id = uid;
  delete from grocery_items where user_id = uid and not by_hand;

  insert into grocery_items (user_id, key, name, grams, aisle, staple, recipes, checked, from_date, to_date)
  select uid, lower(g.name), g.name, g.grams, public.grocery_aisle(g.name), public.grocery_staple(g.name), g.recipes,
         lower(g.name) = any(ticked), p_from, p_to
  from (
    select min(name) as name, sum(grams) as grams, array_agg(distinct recipe order by recipe) as recipes
    from (
      -- weighed ingredients of every planned meal, at that meal's portion
      select public.grocery_name(coalesce(i.name, x->>'name')) as name, (x->>'grams')::numeric as grams, p.recipe_name as recipe
      from planned_meals p
      cross join lateral jsonb_array_elements(case when jsonb_typeof(p.ingredients_json) = 'array' then p.ingredients_json else '[]' end) x
      left join ingredients i on i.id::text = x->>'ingredient_id'
      where p.user_id = uid and p.plan_date between p_from and p_to
        and coalesce(nullif(x->>'grams', '')::numeric, 0) > 0
      union all
      -- the recipe's extras: 'salt' (no amount) or '222 g leek' (weighed but not in the ingredient list)
      select public.grocery_name(coalesce(substring(e from '^\s*[0-9.]+\s*g\s+(.+)$'), e)),
             nullif(substring(e from '^\s*([0-9.]+)\s*g\s+'), '')::numeric       -- the whole recipe's amount,
               * coalesce(p.total_grams / nullif(r.default_serving_g, 0), 1),          -- so this meal's share of it
             p.recipe_name
      from planned_meals p
      join recipes r on r.id = p.recipe_id
      cross join lateral unnest(coalesce(r.extra_ingredients, '{}')) e
      where p.user_id = uid and p.plan_date between p_from and p_to and btrim(e) <> ''
    ) rows
    group by lower(name)
  ) g
  on conflict (user_id, key) do nothing;           -- the same food added by hand stays as it was

  return query select * from grocery_items where user_id = uid order by staple, aisle, name;
end $$;

revoke all on function public.build_grocery_list(date, date, uuid) from public, anon;
grant execute on function public.build_grocery_list(date, date, uuid) to authenticated, service_role;
