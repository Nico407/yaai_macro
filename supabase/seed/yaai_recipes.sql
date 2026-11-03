-- YAAI recipes: tasty high-protein dishes, added to the account of the Pi's login (psql -v email=...).
-- Generated once; deploy/seed-recipes.sh runs it a single time (recorded in macro_schema_migrations), so recipes
-- you delete or rename stay that way. Ingredients are matched by name (case-insensitive) and only added if missing.
-- Every recipe carries the cuisine tag 'yaai'.
\set ON_ERROR_STOP on
begin;
select set_config('seed.email', :'email', false) \gset
create temp table seed_user on commit drop as
  select id from auth.users where lower(email) = lower(current_setting('seed.email'));
do $$ begin
  if (select count(*) from seed_user) <> 1 then raise exception 'No account with the Pi login email'; end if;
end $$;

insert into public.ingredients (name, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, dietary_tags)
select v.* from (values
  ('Avocado', 160, 2.0, 8.5, 14.7, array['vegan','vegetarian','pescatarian']::text[]),
  ('Basmati rice (dry)', 350, 8.0, 78.0, 0.6, array['vegan','vegetarian','pescatarian']::text[]),
  ('Beef mince 5% fat (raw)', 137, 21.4, 0, 5.0, '{}'::text[]),
  ('Bell pepper', 31, 1.0, 6.0, 0.3, array['vegan','vegetarian','pescatarian']::text[]),
  ('Black beans (canned, drained)', 91, 6.0, 16.6, 0.3, array['vegan','vegetarian','pescatarian']::text[]),
  ('Blueberries', 57, 0.7, 14.5, 0.3, array['vegan','vegetarian','pescatarian']::text[]),
  ('Broccoli', 34, 2.8, 7.0, 0.4, array['vegan','vegetarian','pescatarian']::text[]),
  ('Canned tomatoes', 24, 1.2, 4.0, 0.2, array['vegan','vegetarian','pescatarian']::text[]),
  ('Carrot', 41, 0.9, 9.6, 0.2, array['vegan','vegetarian','pescatarian']::text[]),
  ('Cherry tomatoes', 18, 0.9, 3.9, 0.2, array['vegan','vegetarian','pescatarian']::text[]),
  ('Chia seeds', 486, 16.5, 42.0, 30.7, array['vegan','vegetarian','pescatarian']::text[]),
  ('Chicken breast (raw)', 120, 22.5, 0, 2.6, '{}'::text[]),
  ('Chicken thigh, skinless (raw)', 121, 19.7, 0, 4.1, '{}'::text[]),
  ('Chickpeas (canned, drained)', 139, 7.0, 22.5, 2.6, array['vegan','vegetarian','pescatarian']::text[]),
  ('Coconut milk (light)', 74, 0.7, 2.9, 6.7, array['vegan','vegetarian','pescatarian']::text[]),
  ('Cod fillet (raw)', 82, 18.0, 0, 0.7, array['pescatarian','contains_fish']::text[]),
  ('Cottage cheese', 98, 11.0, 3.4, 4.3, array['vegetarian','pescatarian','contains_lactose']::text[]),
  ('Cucumber', 15, 0.7, 3.6, 0.1, array['vegan','vegetarian','pescatarian']::text[]),
  ('Edamame (shelled)', 122, 11.9, 8.9, 5.2, array['vegan','vegetarian','pescatarian','contains_soy']::text[]),
  ('Egg whites', 52, 11.0, 0.7, 0.2, array['vegetarian','pescatarian','contains_eggs']::text[]),
  ('Eggs', 143, 12.6, 0.7, 9.5, array['vegetarian','pescatarian','contains_eggs']::text[]),
  ('Feta', 264, 14.2, 4.1, 21.3, array['vegetarian','pescatarian','contains_lactose']::text[]),
  ('Firm tofu', 144, 15.8, 2.8, 8.7, array['vegan','vegetarian','pescatarian','contains_soy']::text[]),
  ('Fresh herbs (cilantro, basil, parsley)', 23, 2.1, 3.7, 0.5, array['vegan','vegetarian','pescatarian']::text[]),
  ('Garlic', 149, 6.4, 33.0, 0.5, array['vegan','vegetarian','pescatarian']::text[]),
  ('Ginger', 80, 1.8, 18.0, 0.8, array['vegan','vegetarian','pescatarian']::text[]),
  ('Gochujang', 197, 4.0, 42.0, 1.5, array['vegan','vegetarian','pescatarian','contains_soy','contains_gluten']::text[]),
  ('Greek yogurt 0%', 59, 10.0, 3.6, 0.4, array['vegetarian','pescatarian','contains_lactose']::text[]),
  ('Honey', 304, 0.3, 82.0, 0, array['vegetarian','pescatarian']::text[]),
  ('Jasmine rice (dry)', 355, 7.1, 79.0, 0.6, array['vegan','vegetarian','pescatarian']::text[]),
  ('Lime juice', 25, 0.4, 8.4, 0.1, array['vegan','vegetarian','pescatarian']::text[]),
  ('Mango', 60, 0.8, 15.0, 0.4, array['vegan','vegetarian','pescatarian']::text[]),
  ('Milk 1.5%', 46, 3.4, 4.9, 1.5, array['vegetarian','pescatarian','contains_lactose']::text[]),
  ('Miso paste', 199, 12.0, 26.0, 6.0, array['vegan','vegetarian','pescatarian','contains_soy']::text[]),
  ('Mushrooms', 22, 3.1, 3.3, 0.3, array['vegan','vegetarian','pescatarian']::text[]),
  ('Oats', 379, 13.0, 68.0, 6.5, array['vegan','vegetarian','pescatarian','contains_gluten']::text[]),
  ('Olive oil', 884, 0, 0, 100, array['vegan','vegetarian','pescatarian']::text[]),
  ('Onion', 40, 1.1, 9.3, 0.1, array['vegan','vegetarian','pescatarian']::text[]),
  ('Parmesan', 392, 35.8, 3.2, 25.8, array['vegetarian','pescatarian','contains_lactose']::text[]),
  ('Peanut butter', 588, 25.0, 20.0, 50.0, array['vegan','vegetarian','pescatarian','contains_nuts']::text[]),
  ('Potatoes', 77, 2.0, 17.0, 0.1, array['vegan','vegetarian','pescatarian']::text[]),
  ('Quinoa (dry)', 368, 14.1, 64.0, 6.1, array['vegan','vegetarian','pescatarian']::text[]),
  ('Red cabbage', 31, 1.4, 7.4, 0.2, array['vegan','vegetarian','pescatarian']::text[]),
  ('Red curry paste', 110, 2.0, 12.0, 6.0, array['contains_shellfish']::text[]),
  ('Red lentils (dry)', 358, 24.6, 63.0, 2.2, array['vegan','vegetarian','pescatarian']::text[]),
  ('Rice noodles (dry)', 364, 6.0, 80.0, 0.6, array['vegan','vegetarian','pescatarian']::text[]),
  ('Salmon fillet (raw)', 208, 20.0, 0, 13.0, array['pescatarian','contains_fish']::text[]),
  ('Sesame oil', 884, 0, 0, 100, array['vegan','vegetarian','pescatarian']::text[]),
  ('Shrimp (raw)', 85, 20.1, 0, 0.5, array['pescatarian','contains_shellfish']::text[]),
  ('Skyr (natural)', 63, 11.0, 4.0, 0.2, array['vegetarian','pescatarian','contains_lactose']::text[]),
  ('Soba noodles (dry)', 336, 14.0, 74.0, 0.7, array['vegan','vegetarian','pescatarian','contains_gluten']::text[]),
  ('Sourdough bread', 259, 9.0, 50.0, 1.8, array['vegan','vegetarian','pescatarian','contains_gluten']::text[]),
  ('Soy sauce', 53, 8.1, 4.9, 0.6, array['vegan','vegetarian','pescatarian','contains_soy','contains_gluten']::text[]),
  ('Spices (mixed)', 300, 12.0, 40.0, 10.0, array['vegan','vegetarian','pescatarian']::text[]),
  ('Spinach', 23, 2.9, 3.6, 0.4, array['vegan','vegetarian','pescatarian']::text[]),
  ('Sweet potato', 86, 1.6, 20.1, 0.1, array['vegan','vegetarian','pescatarian']::text[]),
  ('Sweetcorn (canned)', 81, 2.6, 16.0, 1.2, array['vegan','vegetarian','pescatarian']::text[]),
  ('Whey protein powder', 380, 75.0, 8.0, 5.0, array['vegetarian','pescatarian','contains_lactose']::text[]),
  ('Whole wheat pasta (dry)', 348, 13.0, 68.0, 2.5, array['vegan','vegetarian','pescatarian','contains_gluten']::text[]),
  ('Whole wheat tortilla', 306, 9.0, 50.0, 7.0, array['vegan','vegetarian','pescatarian','contains_gluten']::text[]),
  ('Zucchini', 17, 1.2, 3.1, 0.3, array['vegan','vegetarian','pescatarian']::text[])
) as v(name, k, p, c, f, t)
where not exists (select 1 from public.ingredients i where lower(i.name) = lower(v.name));

-- Gochujang chicken rice bowl
with r as (
  insert into public.recipes (user_id, name, description, instructions, default_serving_g, min_total_g, max_total_g,
                              is_fixed, cuisine_tags, base_tags, protein_tags, lifestyle, country)
  select id, 'Gochujang chicken rice bowl', 'Sticky-spicy gochujang chicken over jasmine rice with edamame, crunchy cucumber and carrot.', 'Cook the rice.
Cut the chicken into bites, sear in the sesame oil until golden.
Stir gochujang, soy sauce, honey and grated garlic, toss the chicken in it for 1 min.
Bowl: rice, chicken, edamame, sliced cucumber and grated carrot.', 465, 232, 1395, false, array['asian','quick','yaai']::text[],
         array['Rice']::text[], array['Chicken']::text[], 'Omnivore', 'Korea'
  from seed_user
  where not exists (select 1 from public.recipes x where x.user_id = seed_user.id and lower(x.name) = lower('Gochujang chicken rice bowl'))
  returning id
)
insert into public.recipe_ingredients (recipe_id, ingredient_id, ratio)
select r.id, i.id, v.grams / 465.0 from r
join (values ('Chicken breast (raw)', 160), ('Jasmine rice (dry)', 70), ('Edamame (shelled)', 60), ('Cucumber', 80), ('Carrot', 50), ('Gochujang', 20), ('Soy sauce', 10), ('Honey', 6), ('Sesame oil', 5), ('Garlic', 4)) as v(name, grams) on true
join lateral (select id from public.ingredients i where lower(i.name) = lower(v.name) order by created_at limit 1) i on true;

-- Greek chicken with tzatziki potatoes
with r as (
  insert into public.recipes (user_id, name, description, instructions, default_serving_g, min_total_g, max_total_g,
                              is_fixed, cuisine_tags, base_tags, protein_tags, lifestyle, country)
  select id, 'Greek chicken with tzatziki potatoes', 'Lemon-oregano chicken, crispy oven potatoes, a big spoon of tzatziki, tomatoes and feta.', 'Potato wedges with half the oil and spices, 220 °C for 30 min.
Rub the chicken with oil, spices and lime juice, pan-fry 6 min per side.
Tzatziki: yogurt, grated cucumber, garlic, salt.
Serve with tomatoes, red onion and crumbled feta.', 754, 377, 2262, false, array['mediterranean','yaai']::text[],
         array['Potatoes']::text[], array['Chicken','Dairy']::text[], 'Omnivore', 'Greece'
  from seed_user
  where not exists (select 1 from public.recipes x where x.user_id = seed_user.id and lower(x.name) = lower('Greek chicken with tzatziki potatoes'))
  returning id
)
insert into public.recipe_ingredients (recipe_id, ingredient_id, ratio)
select r.id, i.id, v.grams / 754.0 from r
join (values ('Chicken breast (raw)', 170), ('Potatoes', 250), ('Greek yogurt 0%', 100), ('Cucumber', 60), ('Cherry tomatoes', 100), ('Onion', 30), ('Feta', 20), ('Olive oil', 8), ('Garlic', 3), ('Lime juice', 10), ('Spices (mixed)', 3)) as v(name, grams) on true
join lateral (select id from public.ingredients i where lower(i.name) = lower(v.name) order by created_at limit 1) i on true;

-- Salmon soba with ginger broccoli
with r as (
  insert into public.recipes (user_id, name, description, instructions, default_serving_g, min_total_g, max_total_g,
                              is_fixed, cuisine_tags, base_tags, protein_tags, lifestyle, country)
  select id, 'Salmon soba with ginger broccoli', 'Glazed salmon on buckwheat noodles with ginger-garlic broccoli.', 'Mix soy sauce, honey, grated ginger and garlic.
Pan-fry the salmon skin side down 4 min, turn, add half the glaze, 2 min.
Cook the soba, steam the broccoli for the last 3 min.
Toss noodles and broccoli with the rest of the glaze and sesame oil, top with the salmon.', 354, 177, 1062, false, array['japanese','asian','yaai']::text[],
         array['Pasta & noodles']::text[], array['Fish & seafood']::text[], 'Omnivore', 'Japan'
  from seed_user
  where not exists (select 1 from public.recipes x where x.user_id = seed_user.id and lower(x.name) = lower('Salmon soba with ginger broccoli'))
  returning id
)
insert into public.recipe_ingredients (recipe_id, ingredient_id, ratio)
select r.id, i.id, v.grams / 354.0 from r
join (values ('Salmon fillet (raw)', 130), ('Soba noodles (dry)', 70), ('Broccoli', 120), ('Soy sauce', 15), ('Honey', 8), ('Ginger', 5), ('Garlic', 3), ('Sesame oil', 3)) as v(name, grams) on true
join lateral (select id from public.ingredients i where lower(i.name) = lower(v.name) order by created_at limit 1) i on true;

-- Shrimp & mango tacos
with r as (
  insert into public.recipes (user_id, name, description, instructions, default_serving_g, min_total_g, max_total_g,
                              is_fixed, cuisine_tags, base_tags, protein_tags, lifestyle, country)
  select id, 'Shrimp & mango tacos', 'Smoky shrimp, sweet mango, crunchy red cabbage and lime-yogurt in warm tortillas.', 'Toss shrimp with spices (smoked paprika, cumin, chili), sear 2 min per side.
Stir yogurt with lime juice and salt.
Warm the tortillas, fill with cabbage, shrimp, mango and avocado.
Top with lime yogurt and cilantro.', 508, 254, 1524, false, array['mexican','quick','yaai']::text[],
         array['Bread & wraps']::text[], array['Fish & seafood']::text[], 'Omnivore', 'Mexico'
  from seed_user
  where not exists (select 1 from public.recipes x where x.user_id = seed_user.id and lower(x.name) = lower('Shrimp & mango tacos'))
  returning id
)
insert into public.recipe_ingredients (recipe_id, ingredient_id, ratio)
select r.id, i.id, v.grams / 508.0 from r
join (values ('Shrimp (raw)', 180), ('Whole wheat tortilla', 80), ('Mango', 80), ('Red cabbage', 60), ('Avocado', 40), ('Greek yogurt 0%', 50), ('Lime juice', 10), ('Spices (mixed)', 3), ('Fresh herbs (cilantro, basil, parsley)', 5)) as v(name, grams) on true
join lateral (select id from public.ingredients i where lower(i.name) = lower(v.name) order by created_at limit 1) i on true;

-- Smoky beef & black bean chili
with r as (
  insert into public.recipes (user_id, name, description, instructions, default_serving_g, min_total_g, max_total_g,
                              is_fixed, cuisine_tags, base_tags, protein_tags, lifestyle, country)
  select id, 'Smoky beef & black bean chili', 'Rich beef and bean chili with peppers and corn, a skyr topping and a little rice.', 'Brown the mince, add onion, pepper and garlic for 3 min.
Add spices, tomatoes, beans and corn, simmer 20 min.
Cook the rice.
Serve with a spoon of skyr.', 769, 384, 2307, false, array['mexican','comfort','high-protein','yaai']::text[],
         array['Rice']::text[], array['Beef','Legumes']::text[], 'Omnivore', 'Mexico'
  from seed_user
  where not exists (select 1 from public.recipes x where x.user_id = seed_user.id and lower(x.name) = lower('Smoky beef & black bean chili'))
  returning id
)
insert into public.recipe_ingredients (recipe_id, ingredient_id, ratio)
select r.id, i.id, v.grams / 769.0 from r
join (values ('Beef mince 5% fat (raw)', 150), ('Black beans (canned, drained)', 120), ('Canned tomatoes', 200), ('Bell pepper', 80), ('Onion', 50), ('Sweetcorn (canned)', 50), ('Basmati rice (dry)', 50), ('Skyr (natural)', 60), ('Spices (mixed)', 5), ('Garlic', 4)) as v(name, grams) on true
join lateral (select id from public.ingredients i where lower(i.name) = lower(v.name) order by created_at limit 1) i on true;

-- Thai red curry chicken
with r as (
  insert into public.recipes (user_id, name, description, instructions, default_serving_g, min_total_g, max_total_g,
                              is_fixed, cuisine_tags, base_tags, protein_tags, lifestyle, country)
  select id, 'Thai red curry chicken', 'Creamy light-coconut red curry with chicken thigh, peppers and zucchini over jasmine rice.', 'Cook the rice.
Fry the curry paste 1 min, add the chicken pieces, 3 min.
Add coconut milk, pepper and zucchini, simmer 10 min.
Finish with lime juice and basil.', 535, 268, 1605, false, array['thai','asian','yaai']::text[],
         array['Rice']::text[], array['Chicken']::text[], 'Omnivore', 'Thailand'
  from seed_user
  where not exists (select 1 from public.recipes x where x.user_id = seed_user.id and lower(x.name) = lower('Thai red curry chicken'))
  returning id
)
insert into public.recipe_ingredients (recipe_id, ingredient_id, ratio)
select r.id, i.id, v.grams / 535.0 from r
join (values ('Chicken thigh, skinless (raw)', 160), ('Coconut milk (light)', 120), ('Red curry paste', 15), ('Bell pepper', 80), ('Zucchini', 80), ('Jasmine rice (dry)', 65), ('Lime juice', 10), ('Fresh herbs (cilantro, basil, parsley)', 5)) as v(name, grams) on true
join lateral (select id from public.ingredients i where lower(i.name) = lower(v.name) order by created_at limit 1) i on true;

-- Protein shakshuka
with r as (
  insert into public.recipes (user_id, name, description, instructions, default_serving_g, min_total_g, max_total_g,
                              is_fixed, cuisine_tags, base_tags, protein_tags, lifestyle, country)
  select id, 'Protein shakshuka', 'Eggs and extra egg whites in spiced tomato-pepper sauce with feta and sourdough to dip.', 'Soften onion and pepper, add spices (cumin, paprika) and tomatoes, simmer 8 min.
Pour in the egg whites, make two wells, crack in the eggs.
Cover, cook 6-8 min until the whites set.
Top with feta, serve with toasted sourdough.', 678, 339, 2034, false, array['middle-eastern','breakfast','yaai']::text[],
         array['Bread & wraps']::text[], array['Eggs','Dairy']::text[], 'Vegetarian', 'Middle East'
  from seed_user
  where not exists (select 1 from public.recipes x where x.user_id = seed_user.id and lower(x.name) = lower('Protein shakshuka'))
  returning id
)
insert into public.recipe_ingredients (recipe_id, ingredient_id, ratio)
select r.id, i.id, v.grams / 678.0 from r
join (values ('Eggs', 110), ('Egg whites', 100), ('Canned tomatoes', 250), ('Bell pepper', 80), ('Onion', 50), ('Feta', 25), ('Sourdough bread', 60), ('Spices (mixed)', 3)) as v(name, grams) on true
join lateral (select id from public.ingredients i where lower(i.name) = lower(v.name) order by created_at limit 1) i on true;

-- Miso tofu quinoa bowl
with r as (
  insert into public.recipes (user_id, name, description, instructions, default_serving_g, min_total_g, max_total_g,
                              is_fixed, cuisine_tags, base_tags, protein_tags, lifestyle, country)
  select id, 'Miso tofu quinoa bowl', 'Crispy miso-glazed tofu, nutty quinoa, edamame, avocado and crunchy veg.', 'Cook the quinoa.
Press and cube the tofu, fry in sesame oil until crisp.
Stir miso, soy sauce and lime juice with a splash of water, glaze the tofu.
Bowl it up with edamame, cucumber, carrot and avocado.', 504, 252, 1512, false, array['japanese','asian','yaai']::text[],
         array['Oats & grains']::text[], array['Tofu & tempeh']::text[], 'Vegan', 'Japan'
  from seed_user
  where not exists (select 1 from public.recipes x where x.user_id = seed_user.id and lower(x.name) = lower('Miso tofu quinoa bowl'))
  returning id
)
insert into public.recipe_ingredients (recipe_id, ingredient_id, ratio)
select r.id, i.id, v.grams / 504.0 from r
join (values ('Firm tofu', 200), ('Quinoa (dry)', 60), ('Edamame (shelled)', 60), ('Cucumber', 60), ('Carrot', 50), ('Avocado', 40), ('Miso paste', 15), ('Soy sauce', 10), ('Sesame oil', 4), ('Lime juice', 5)) as v(name, grams) on true
join lateral (select id from public.ingredients i where lower(i.name) = lower(v.name) order by created_at limit 1) i on true;

-- Red lentil & chickpea dal
with r as (
  insert into public.recipes (user_id, name, description, instructions, default_serving_g, min_total_g, max_total_g,
                              is_fixed, cuisine_tags, base_tags, protein_tags, lifestyle, country)
  select id, 'Red lentil & chickpea dal', 'Warming coconut dal with lentils, chickpeas and spinach over basmati.', 'Soften onion, ginger and garlic, add spices (garam masala, turmeric, cumin).
Add lentils, tomatoes, coconut milk and 200 ml water, simmer 15 min.
Stir in chickpeas and spinach for the last 3 min.
Serve over basmati.', 584, 292, 1752, false, array['indian','comfort','yaai']::text[],
         array['Rice']::text[], array['Legumes']::text[], 'Vegan', 'India'
  from seed_user
  where not exists (select 1 from public.recipes x where x.user_id = seed_user.id and lower(x.name) = lower('Red lentil & chickpea dal'))
  returning id
)
insert into public.recipe_ingredients (recipe_id, ingredient_id, ratio)
select r.id, i.id, v.grams / 584.0 from r
join (values ('Red lentils (dry)', 70), ('Chickpeas (canned, drained)', 120), ('Canned tomatoes', 150), ('Coconut milk (light)', 80), ('Spinach', 60), ('Onion', 50), ('Basmati rice (dry)', 40), ('Ginger', 5), ('Garlic', 4), ('Spices (mixed)', 5)) as v(name, grams) on true
join lateral (select id from public.ingredients i where lower(i.name) = lower(v.name) order by created_at limit 1) i on true;

-- Creamy chicken & mushroom pasta
with r as (
  insert into public.recipes (user_id, name, description, instructions, default_serving_g, min_total_g, max_total_g,
                              is_fixed, cuisine_tags, base_tags, protein_tags, lifestyle, country)
  select id, 'Creamy chicken & mushroom pasta', 'Silky skyr-parmesan sauce, golden chicken, mushrooms and spinach on whole wheat pasta.', 'Cook the pasta, keep a cup of the water.
Sear the chicken, add mushrooms and garlic until browned.
Off the heat stir in skyr, parmesan and a splash of pasta water.
Toss with pasta and spinach until it wilts.', 494, 247, 1482, false, array['italian','comfort','yaai']::text[],
         array['Pasta & noodles']::text[], array['Chicken','Dairy']::text[], 'Omnivore', 'Italy'
  from seed_user
  where not exists (select 1 from public.recipes x where x.user_id = seed_user.id and lower(x.name) = lower('Creamy chicken & mushroom pasta'))
  returning id
)
insert into public.recipe_ingredients (recipe_id, ingredient_id, ratio)
select r.id, i.id, v.grams / 494.0 from r
join (values ('Whole wheat pasta (dry)', 80), ('Chicken breast (raw)', 140), ('Mushrooms', 120), ('Spinach', 50), ('Skyr (natural)', 80), ('Parmesan', 15), ('Garlic', 4), ('Olive oil', 5)) as v(name, grams) on true
join lateral (select id from public.ingredients i where lower(i.name) = lower(v.name) order by created_at limit 1) i on true;

-- Crispy cod with sweet potato wedges
with r as (
  insert into public.recipes (user_id, name, description, instructions, default_serving_g, min_total_g, max_total_g,
                              is_fixed, cuisine_tags, base_tags, protein_tags, lifestyle, country)
  select id, 'Crispy cod with sweet potato wedges', 'Spiced cod, crispy sweet potato wedges, broccoli and a herby yogurt dip.', 'Wedges with most of the oil and spices, 220 °C for 25 min; broccoli on the tray for the last 10.
Season the cod, pan-fry 3-4 min per side in the rest of the oil.
Dip: yogurt, chopped herbs, garlic, lime juice.', 632, 316, 1896, false, array['quick','high-protein','yaai']::text[],
         array['Potatoes']::text[], array['Fish & seafood','Dairy']::text[], 'Omnivore', null
  from seed_user
  where not exists (select 1 from public.recipes x where x.user_id = seed_user.id and lower(x.name) = lower('Crispy cod with sweet potato wedges'))
  returning id
)
insert into public.recipe_ingredients (recipe_id, ingredient_id, ratio)
select r.id, i.id, v.grams / 632.0 from r
join (values ('Cod fillet (raw)', 200), ('Sweet potato', 250), ('Broccoli', 100), ('Greek yogurt 0%', 60), ('Olive oil', 7), ('Fresh herbs (cilantro, basil, parsley)', 5), ('Lime juice', 5), ('Garlic', 2), ('Spices (mixed)', 3)) as v(name, grams) on true
join lateral (select id from public.ingredients i where lower(i.name) = lower(v.name) order by created_at limit 1) i on true;

-- Berry protein overnight oats
with r as (
  insert into public.recipes (user_id, name, description, instructions, default_serving_g, min_total_g, max_total_g,
                              is_fixed, cuisine_tags, base_tags, protein_tags, lifestyle, country)
  select id, 'Berry protein overnight oats', 'Creamy skyr oats with whey, chia, blueberries and a swirl of peanut butter. Make it the night before.', 'Stir oats, skyr, milk, whey and chia.
Fridge overnight.
Top with blueberries and peanut butter.', 430, 215, 1290, false, array['breakfast','quick','yaai']::text[],
         array['Oats & grains']::text[], array['Dairy','Protein powder']::text[], 'Vegetarian', null
  from seed_user
  where not exists (select 1 from public.recipes x where x.user_id = seed_user.id and lower(x.name) = lower('Berry protein overnight oats'))
  returning id
)
insert into public.recipe_ingredients (recipe_id, ingredient_id, ratio)
select r.id, i.id, v.grams / 430.0 from r
join (values ('Oats', 60), ('Skyr (natural)', 150), ('Milk 1.5%', 100), ('Whey protein powder', 20), ('Blueberries', 80), ('Chia seeds', 10), ('Peanut butter', 10)) as v(name, grams) on true
join lateral (select id from public.ingredients i where lower(i.name) = lower(v.name) order by created_at limit 1) i on true;

-- Egg white veggie omelette wrap
with r as (
  insert into public.recipes (user_id, name, description, instructions, default_serving_g, min_total_g, max_total_g,
                              is_fixed, cuisine_tags, base_tags, protein_tags, lifestyle, country)
  select id, 'Egg white veggie omelette wrap', 'Fluffy egg-white omelette with mushrooms, spinach, tomato and feta rolled in a tortilla.', 'Fry the mushrooms, add spinach until wilted.
Whisk egg and egg whites, pour over, cook on low until set.
Top with tomatoes and feta, slide onto the warm tortilla and roll.', 445, 222, 1335, false, array['breakfast','quick','yaai']::text[],
         array['Bread & wraps']::text[], array['Eggs','Dairy']::text[], 'Vegetarian', null
  from seed_user
  where not exists (select 1 from public.recipes x where x.user_id = seed_user.id and lower(x.name) = lower('Egg white veggie omelette wrap'))
  returning id
)
insert into public.recipe_ingredients (recipe_id, ingredient_id, ratio)
select r.id, i.id, v.grams / 445.0 from r
join (values ('Eggs', 55), ('Egg whites', 150), ('Whole wheat tortilla', 60), ('Spinach', 40), ('Mushrooms', 60), ('Cherry tomatoes', 60), ('Feta', 20)) as v(name, grams) on true
join lateral (select id from public.ingredients i where lower(i.name) = lower(v.name) order by created_at limit 1) i on true;

-- Peanut tofu rice noodles
with r as (
  insert into public.recipes (user_id, name, description, instructions, default_serving_g, min_total_g, max_total_g,
                              is_fixed, cuisine_tags, base_tags, protein_tags, lifestyle, country)
  select id, 'Peanut tofu rice noodles', 'Rice noodles in a zingy peanut-lime sauce with crispy tofu and rainbow veg.', 'Soak or cook the noodles.
Fry the cubed tofu until crisp.
Sauce: peanut butter, soy sauce, lime juice, chili, a splash of hot water.
Toss noodles, tofu and shredded veg with the sauce.', 462, 231, 1386, false, array['thai','asian','yaai']::text[],
         array['Pasta & noodles']::text[], array['Tofu & tempeh']::text[], 'Vegan', 'Thailand'
  from seed_user
  where not exists (select 1 from public.recipes x where x.user_id = seed_user.id and lower(x.name) = lower('Peanut tofu rice noodles'))
  returning id
)
insert into public.recipe_ingredients (recipe_id, ingredient_id, ratio)
select r.id, i.id, v.grams / 462.0 from r
join (values ('Rice noodles (dry)', 70), ('Firm tofu', 180), ('Peanut butter', 15), ('Soy sauce', 15), ('Lime juice', 10), ('Red cabbage', 60), ('Carrot', 50), ('Bell pepper', 60), ('Spices (mixed)', 2)) as v(name, grams) on true
join lateral (select id from public.ingredients i where lower(i.name) = lower(v.name) order by created_at limit 1) i on true;

-- Cottage cheese berry crunch bowl
with r as (
  insert into public.recipes (user_id, name, description, instructions, default_serving_g, min_total_g, max_total_g,
                              is_fixed, cuisine_tags, base_tags, protein_tags, lifestyle, country)
  select id, 'Cottage cheese berry crunch bowl', 'A quick high-protein snack: cottage cheese, berries, oats, chia and honey.', 'Bowl: cottage cheese, berries, oats and chia.
Drizzle with honey.', 333, 166, 999, false, array['breakfast','quick','yaai']::text[],
         array['Oats & grains']::text[], array['Dairy']::text[], 'Vegetarian', null
  from seed_user
  where not exists (select 1 from public.recipes x where x.user_id = seed_user.id and lower(x.name) = lower('Cottage cheese berry crunch bowl'))
  returning id
)
insert into public.recipe_ingredients (recipe_id, ingredient_id, ratio)
select r.id, i.id, v.grams / 333.0 from r
join (values ('Cottage cheese', 200), ('Blueberries', 100), ('Oats', 20), ('Chia seeds', 5), ('Honey', 8)) as v(name, grams) on true
join lateral (select id from public.ingredients i where lower(i.name) = lower(v.name) order by created_at limit 1) i on true;

commit;
