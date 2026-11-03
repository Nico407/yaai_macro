-- Remove the cook book recipes that came with the app (asked for on 2026-11-03). Meals already eaten or planned
-- from them keep their own copy (name, grams, macros), so history doesn't change.
delete from public.cookbook_recipes;
