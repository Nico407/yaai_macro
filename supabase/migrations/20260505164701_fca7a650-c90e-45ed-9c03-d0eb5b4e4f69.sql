ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS is_fixed boolean NOT NULL DEFAULT false;
ALTER TABLE public.meal_logs ADD COLUMN IF NOT EXISTS is_fixed boolean NOT NULL DEFAULT false;