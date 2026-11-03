-- Made re-runnable for the Pi (MacroTacker didn't get this table when the data moved there).
CREATE TABLE IF NOT EXISTS public.planned_meals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  plan_date DATE NOT NULL,
  slot TEXT,
  recipe_id UUID,
  recipe_name TEXT NOT NULL,
  total_grams NUMERIC NOT NULL DEFAULT 0,
  kcal NUMERIC NOT NULL DEFAULT 0,
  protein_g NUMERIC NOT NULL DEFAULT 0,
  carbs_g NUMERIC NOT NULL DEFAULT 0,
  fat_g NUMERIC NOT NULL DEFAULT 0,
  is_fixed BOOLEAN NOT NULL DEFAULT false,
  instructions TEXT,
  ingredients_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS planned_meals_user_date_idx ON public.planned_meals (user_id, plan_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.planned_meals TO authenticated;
GRANT ALL ON public.planned_meals TO service_role;

ALTER TABLE public.planned_meals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own planned meals" ON public.planned_meals;
CREATE POLICY "Users can manage their own planned meals"
ON public.planned_meals FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);