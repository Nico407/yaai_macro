-- Where an ingredient came from, so imports never add the same food twice:
--   source 'swiss-fcdb' + the food's ID (Swiss Food Composition Database, deploy/import-swiss-foods.sh)
--   source 'off' + barcode (Open Food Facts, added in the app)
-- name_de: the German name, so the ingredient search finds "Poulet" as well as "Chicken".
alter table public.ingredients add column if not exists name_de text;
alter table public.ingredients add column if not exists source text;
alter table public.ingredients add column if not exists source_id text;
create unique index if not exists ingredients_source_uniq on public.ingredients (source, source_id) where source is not null;
