-- YAAI now keeps a copy of today's plan in the week planner, so the planner's meals for a day that has its own
-- plan (meal_logs) are left out of the grocery list; before, a copied meal with another slot counted twice.
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
  with meals as (
    -- today's plan (meal_logs, not eaten yet: what's eaten was bought already) ...
    select l.recipe_id, l.recipe_name, l.total_grams, l.ingredients_json
    from meal_logs l
    where l.user_id = uid and l.log_date between p_from and p_to and not l.eaten
    union all
    -- ... and the week planner for the days that have no plan of their own yet (a day with meals on its plan:
    -- the week planner only holds a copy of them)
    select p.recipe_id, p.recipe_name, p.total_grams, p.ingredients_json
    from planned_meals p
    where p.user_id = uid and p.plan_date between p_from and p_to
      and not exists (select 1 from meal_logs l where l.user_id = uid and l.log_date = p.plan_date)
  )
  select uid, lower(g.name), g.name, g.grams, public.grocery_aisle(g.name), public.grocery_staple(g.name), g.recipes,
         lower(g.name) = any(ticked), p_from, p_to
  from (
    select min(name) as name, sum(grams) as grams, array_agg(distinct recipe order by recipe) as recipes
    from (
      -- weighed ingredients of every planned meal, at that meal's portion
      select public.grocery_name(coalesce(i.name, x->>'name')) as name, (x->>'grams')::numeric as grams, p.recipe_name as recipe
      from meals p
      cross join lateral jsonb_array_elements(case when jsonb_typeof(p.ingredients_json) = 'array' then p.ingredients_json else '[]' end) x
      left join ingredients i on i.id::text = x->>'ingredient_id'
      where coalesce(nullif(x->>'grams', '')::numeric, 0) > 0
      union all
      -- the recipe's extras: 'salt' (no amount) or '222 g leek' (weighed but not in the ingredient list)
      select public.grocery_name(coalesce(substring(e from '^\s*[0-9.]+\s*g\s+(.+)$'), e)),
             nullif(substring(e from '^\s*([0-9.]+)\s*g\s+'), '')::numeric       -- the whole recipe's amount,
               * coalesce(p.total_grams / nullif(r.default_serving_g, 0), 1),          -- so this meal's share of it
             p.recipe_name
      from meals p
      join recipes r on r.id = p.recipe_id
      cross join lateral unnest(coalesce(r.extra_ingredients, '{}')) e
      where btrim(e) <> ''
    ) rows
    group by lower(name)
  ) g
  on conflict (user_id, key) do nothing;           -- the same food added by hand stays as it was

  return query select * from grocery_items where user_id = uid order by staple, aisle, name;
end $$;

revoke all on function public.build_grocery_list(date, date, uuid) from public, anon;
grant execute on function public.build_grocery_list(date, date, uuid) to authenticated, service_role;
