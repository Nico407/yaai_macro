CREATE TABLE public.cookbook_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country text,
  name text NOT NULL,
  description text,
  kcal numeric NOT NULL,
  protein_g numeric NOT NULL DEFAULT 0,
  carbs_g numeric NOT NULL DEFAULT 0,
  fat_g numeric NOT NULL DEFAULT 0,
  cook_time_min integer NOT NULL DEFAULT 20,
  image_url text,
  ingredients text[] NOT NULL DEFAULT '{}',
  instructions text[] NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 0,
  is_favorite boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cookbook_recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public all cookbook_recipes"
ON public.cookbook_recipes
FOR ALL
USING (true)
WITH CHECK (true);

CREATE INDEX idx_cookbook_recipes_country ON public.cookbook_recipes(country);