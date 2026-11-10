-- Body log: weight and water (later sleep, steps, heart rate from the wearable: same table, a new metric).
--
-- Append-only, one row per reading: nothing is overwritten, the current value is the latest row (YAAI's Shared
-- Context rule). day is the Zurich date the reading belongs to. Weight: the first reading of a day counts (the
-- morning weigh-in); water: the day's readings add up. The latest weight also goes into profile.weight_kg, so
-- target calculations use the current weight.

create table if not exists public.body_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  measured_at timestamptz not null default now(),
  day date not null default ((now() at time zone 'Europe/Zurich')::date),
  metric text not null check (metric in ('weight', 'water')),
  value numeric not null check (value > 0),
  unit text not null,                          -- kg / ml
  source text,                                 -- telegram / hub / app / voice
  created_at timestamptz not null default now()
);
create index if not exists body_metrics_user_day on public.body_metrics (user_id, metric, day);

grant select, insert, update, delete on public.body_metrics to authenticated;
grant all on public.body_metrics to service_role;
alter table public.body_metrics enable row level security;
drop policy if exists "Users manage their own body metrics" on public.body_metrics;
create policy "Users manage their own body metrics" on public.body_metrics for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.profile add column if not exists water_goal_ml integer not null default 2500;

-- per day: the morning weight and the water drunk (what exports, charts and the day log read)
create or replace view public.body_days with (security_invoker = true) as
select user_id, day,
       (array_agg(value order by measured_at) filter (where metric = 'weight'))[1] as weight_kg,
       coalesce(sum(value) filter (where metric = 'water'), 0) as water_ml
from public.body_metrics
group by user_id, day;
grant select on public.body_days to authenticated, service_role;

-- the newest weigh-in is the profile's weight
create or replace function public.body_weight_to_profile() returns trigger
language plpgsql security definer set search_path = public as $$
declare latest numeric;
begin
  if coalesce(new.metric, old.metric) <> 'weight' then return null; end if;
  select value into latest from body_metrics
   where user_id = coalesce(new.user_id, old.user_id) and metric = 'weight'
   order by measured_at desc limit 1;
  if latest is not null then
    update profile set weight_kg = latest, updated_at = now() where user_id = coalesce(new.user_id, old.user_id);
  end if;
  return null;
end $$;

drop trigger if exists body_weight_to_profile on public.body_metrics;
create trigger body_weight_to_profile after insert or delete on public.body_metrics
  for each row execute function public.body_weight_to_profile();
