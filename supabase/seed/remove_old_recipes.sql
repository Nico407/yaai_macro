-- Remove the Pi login's own recipes from before the YAAI recipes, except the protein shake (asked for on 2026-11-03).
-- Eaten meals stay in the history (meal_logs.recipe_id becomes null, name and macros are kept); planned meals that
-- point at a removed recipe go. Stops without changing anything if no protein shake is found.
\set ON_ERROR_STOP on
begin;
select set_config('seed.email', :'email', false) \gset
create temp table me on commit drop as
  select id from auth.users where lower(email) = lower(current_setting('seed.email'));
create temp table gone on commit drop as
  select r.id, r.name from public.recipes r join me on r.user_id = me.id
  where not ('yaai' = any(coalesce(r.cuisine_tags, '{}'))) and r.name !~* 'protein\s*shake';
do $$ begin
  if (select count(*) from me) <> 1 then raise exception 'No account with the Pi login email'; end if;
  if not exists (select 1 from public.recipes r join me on r.user_id = me.id where r.name ~* 'protein\s*shake') then
    raise exception 'No protein shake recipe found, nothing removed';
  end if;
end $$;
\echo '    removing:'
select '      ' || name from gone order by name;
delete from public.planned_meals where recipe_id in (select id from gone);
delete from public.recipes where id in (select id from gone);
commit;
