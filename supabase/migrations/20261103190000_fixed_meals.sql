-- Fixed recipes (e.g. a protein shake) are never rescaled. Meals planned before their recipe was switched to "fixed"
-- were saved as scalable and got rescaled; mark them fixed, and put today's and future ones back to the recipe's
-- own amounts (macros and ingredient grams from the recipe). Past days are left as they were eaten.
update public.meal_logs l set is_fixed = true
from public.recipes r where l.recipe_id = r.id and r.is_fixed and not l.is_fixed;
update public.planned_meals p set is_fixed = true
from public.recipes r where p.recipe_id = r.id and r.is_fixed and not p.is_fixed;

create temp table fixed_amounts on commit drop as
select r.id as recipe_id, r.default_serving_g as grams,
  sum(ri.ratio * r.default_serving_g * i.kcal_per_100g / 100) as kcal,
  sum(ri.ratio * r.default_serving_g * i.protein_per_100g / 100) as protein_g,
  sum(ri.ratio * r.default_serving_g * i.carbs_per_100g / 100) as carbs_g,
  sum(ri.ratio * r.default_serving_g * i.fat_per_100g / 100) as fat_g,
  jsonb_agg(jsonb_build_object('ingredient_id', i.id, 'name', i.name, 'grams', round(ri.ratio * r.default_serving_g))
            order by ri.ratio desc) as ingredients_json
from public.recipes r
join public.recipe_ingredients ri on ri.recipe_id = r.id
join public.ingredients i on i.id = ri.ingredient_id
where r.is_fixed and r.default_serving_g > 0
group by r.id, r.default_serving_g;

update public.meal_logs l set total_grams = round(f.grams), kcal = round(f.kcal), protein_g = round(f.protein_g, 1),
  carbs_g = round(f.carbs_g, 1), fat_g = round(f.fat_g, 1), ingredients_json = f.ingredients_json
from fixed_amounts f
where l.recipe_id = f.recipe_id and l.log_date >= (now() at time zone 'Europe/Zurich')::date
  and round(l.total_grams) <> round(f.grams);

update public.planned_meals p set total_grams = round(f.grams), kcal = round(f.kcal), protein_g = round(f.protein_g, 1),
  carbs_g = round(f.carbs_g, 1), fat_g = round(f.fat_g, 1), ingredients_json = f.ingredients_json
from fixed_amounts f
where p.recipe_id = f.recipe_id and p.plan_date >= (now() at time zone 'Europe/Zurich')::date
  and round(p.total_grams) <> round(f.grams);
