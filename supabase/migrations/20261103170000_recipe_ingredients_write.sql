-- MacroTacker only had a read rule on recipe_ingredients, so saving a recipe's ingredients (new recipe or edit)
-- failed with "new row violates row-level security policy". Owners of a recipe may now add, change and delete its
-- ingredients.
drop policy if exists "Users manage ingredients of own recipes" on public.recipe_ingredients;
create policy "Users manage ingredients of own recipes" on public.recipe_ingredients
  for all to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id and r.user_id = auth.uid()))
  with check (exists (select 1 from public.recipes r where r.id = recipe_id and r.user_id = auth.uid()));
