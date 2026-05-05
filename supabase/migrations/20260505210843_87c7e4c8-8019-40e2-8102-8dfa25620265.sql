
ALTER TABLE public.ingredients ADD COLUMN IF NOT EXISTS dietary_tags text[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS cuisine_tags text[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE public.cookbook_recipes ADD COLUMN IF NOT EXISTS cuisine_tags text[] NOT NULL DEFAULT '{}'::text[];
CREATE INDEX IF NOT EXISTS idx_ingredients_dietary_tags ON public.ingredients USING GIN(dietary_tags);
CREATE INDEX IF NOT EXISTS idx_recipes_cuisine_tags ON public.recipes USING GIN(cuisine_tags);
CREATE INDEX IF NOT EXISTS idx_cookbook_recipes_cuisine_tags ON public.cookbook_recipes USING GIN(cuisine_tags);
