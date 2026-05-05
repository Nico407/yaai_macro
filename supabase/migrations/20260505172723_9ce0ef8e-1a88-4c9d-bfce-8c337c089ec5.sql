ALTER TABLE public.profile DROP CONSTRAINT IF EXISTS profile_goal_check;
ALTER TABLE public.profile ADD CONSTRAINT profile_goal_check CHECK (goal IN ('hard_cut','cut','maintain','bulk','hard_bulk'));