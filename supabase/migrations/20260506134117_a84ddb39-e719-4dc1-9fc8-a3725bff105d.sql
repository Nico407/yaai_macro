
-- 1. Wipe test data so we can add NOT NULL user_id cleanly
DELETE FROM public.recipe_ingredients;
DELETE FROM public.recipes;
DELETE FROM public.meal_logs;
DELETE FROM public.profile;

-- 2. Add user_id columns
ALTER TABLE public.profile ADD COLUMN user_id uuid NOT NULL;
ALTER TABLE public.recipes ADD COLUMN user_id uuid NOT NULL;
ALTER TABLE public.meal_logs ADD COLUMN user_id uuid NOT NULL;

CREATE INDEX idx_profile_user_id ON public.profile(user_id);
CREATE INDEX idx_recipes_user_id ON public.recipes(user_id);
CREATE INDEX idx_meal_logs_user_id ON public.meal_logs(user_id);

-- 3. Drop old permissive policies
DROP POLICY IF EXISTS "public all profile" ON public.profile;
DROP POLICY IF EXISTS "public all recipes" ON public.recipes;
DROP POLICY IF EXISTS "public all meal_logs" ON public.meal_logs;
DROP POLICY IF EXISTS "public all recipe_ingredients" ON public.recipe_ingredients;
DROP POLICY IF EXISTS "public all ingredients" ON public.ingredients;
DROP POLICY IF EXISTS "public all cookbook_recipes" ON public.cookbook_recipes;

-- 4. Per-user policies: profile
CREATE POLICY "Users view own profile" ON public.profile FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own profile" ON public.profile FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own profile" ON public.profile FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own profile" ON public.profile FOR DELETE USING (auth.uid() = user_id);

-- 5. Per-user policies: recipes
CREATE POLICY "Users view own recipes" ON public.recipes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own recipes" ON public.recipes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own recipes" ON public.recipes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own recipes" ON public.recipes FOR DELETE USING (auth.uid() = user_id);

-- 6. Per-user policies: meal_logs
CREATE POLICY "Users view own meal_logs" ON public.meal_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own meal_logs" ON public.meal_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own meal_logs" ON public.meal_logs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own meal_logs" ON public.meal_logs FOR DELETE USING (auth.uid() = user_id);

-- 7. recipe_ingredients: scoped via parent recipe ownership
CREATE POLICY "Users view ingredients of own recipes" ON public.recipe_ingredients FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = recipe_id AND r.user_id = auth.uid()));
CREATE POLICY "Users insert ingredients of own recipes" ON public.recipe_ingredients FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = recipe_id AND r.user_id = auth.uid()));
CREATE POLICY "Users update ingredients of own recipes" ON public.recipe_ingredients FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = recipe_id AND r.user_id = auth.uid()));
CREATE POLICY "Users delete ingredients of own recipes" ON public.recipe_ingredients FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = recipe_id AND r.user_id = auth.uid()));

-- 8. Shared library: ingredients (public read, authenticated write)
CREATE POLICY "Anyone can view ingredients" ON public.ingredients FOR SELECT USING (true);
CREATE POLICY "Authenticated can insert ingredients" ON public.ingredients FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update ingredients" ON public.ingredients FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete ingredients" ON public.ingredients FOR DELETE TO authenticated USING (true);

-- 9. Shared library: cookbook_recipes (public read, authenticated write)
CREATE POLICY "Anyone can view cookbook_recipes" ON public.cookbook_recipes FOR SELECT USING (true);
CREATE POLICY "Authenticated can insert cookbook_recipes" ON public.cookbook_recipes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update cookbook_recipes" ON public.cookbook_recipes FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete cookbook_recipes" ON public.cookbook_recipes FOR DELETE TO authenticated USING (true);
