-- Photos of your own recipes, added when you cook them. One per recipe, kept in the database as a small JPEG
-- (resized in the browser to 800 px, about 60-120 kB), so no storage bucket or extra access rules are needed.
create table if not exists public.recipe_photos (
  recipe_id uuid primary key references public.recipes(id) on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  image text not null,              -- data:image/jpeg;base64,...
  updated_at timestamptz not null default now()
);
alter table public.recipe_photos enable row level security;
drop policy if exists "Users manage own recipe photos" on public.recipe_photos;
create policy "Users manage own recipe photos" on public.recipe_photos for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and exists (select 1 from public.recipes r where r.id = recipe_id and r.user_id = auth.uid()));
grant select, insert, update, delete on public.recipe_photos to authenticated;
grant all on public.recipe_photos to service_role;
