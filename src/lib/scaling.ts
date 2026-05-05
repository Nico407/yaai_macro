import type { RecipeRow } from "@/hooks/useRecipes";

export type PerGram = {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export function recipePerGram(recipe: RecipeRow): PerGram {
  // Each ingredient contributes (ratio * macro_per_100g / 100) per 1g of finished meal.
  let kcal = 0,
    protein = 0,
    carbs = 0,
    fat = 0;
  recipe.recipe_ingredients.forEach((ri) => {
    const r = Number(ri.ratio);
    const ing = ri.ingredient;
    kcal += (r * Number(ing.kcal_per_100g)) / 100;
    protein += (r * Number(ing.protein_per_100g)) / 100;
    carbs += (r * Number(ing.carbs_per_100g)) / 100;
    fat += (r * Number(ing.fat_per_100g)) / 100;
  });
  return { kcal, protein_g: protein, carbs_g: carbs, fat_g: fat };
}

export type FitTarget = "protein_g" | "kcal" | "carbs_g" | "fat_g";

export function gramsForTarget(
  perGram: PerGram,
  target: FitTarget,
  remaining: number,
): number {
  const denom = perGram[target];
  if (!denom || denom <= 0) return 0;
  return Math.max(0, remaining) / denom;
}

export function clampGrams(
  grams: number,
  min: number,
  max: number,
): number {
  return Math.max(min, Math.min(max, grams));
}

export function macrosFor(perGram: PerGram, grams: number) {
  return {
    kcal: perGram.kcal * grams,
    protein_g: perGram.protein_g * grams,
    carbs_g: perGram.carbs_g * grams,
    fat_g: perGram.fat_g * grams,
  };
}

export function ingredientBreakdown(recipe: RecipeRow, totalGrams: number) {
  return recipe.recipe_ingredients
    .map((ri) => {
      const grams = Number(ri.ratio) * totalGrams;
      const ing = ri.ingredient;
      return {
        id: ri.id,
        name: ing.name,
        ingredient_id: ing.id,
        grams,
        kcal: (Number(ing.kcal_per_100g) * grams) / 100,
        protein_g: (Number(ing.protein_per_100g) * grams) / 100,
        carbs_g: (Number(ing.carbs_per_100g) * grams) / 100,
        fat_g: (Number(ing.fat_per_100g) * grams) / 100,
      };
    })
    .sort((a, b) => b.grams - a.grams);
}
