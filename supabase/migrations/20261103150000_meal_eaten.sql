-- "Eaten" mark for the Hub's meal ticker: a meal on today's plan stays planned until it's ticked as eaten.
-- Earlier days count as eaten (that's what they were).
alter table public.meal_logs add column if not exists eaten boolean not null default false;
update public.meal_logs set eaten = true where log_date < (now() at time zone 'Europe/Zurich')::date and not eaten;
