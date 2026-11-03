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

type Share = { kcal: number; protein_g: number; carbs_g: number; fat_g: number };
type Weights = { kcal?: number; protein_g?: number; carbs_g?: number; fat_g?: number };
const MACRO_KEYS: (keyof PerGram)[] = ["kcal", "protein_g", "carbs_g", "fat_g"];
const weightsOf = (w: Weights) => ({
  kcal: w.kcal ?? 1,
  protein_g: w.protein_g ?? 1.5, // protein matters most for body comp
  carbs_g: w.carbs_g ?? 1,
  fat_g: w.fat_g ?? 1,
});

/**
 * Balanced fit: choose grams so the meal lands as close as possible to the given share of EACH macro (kcal,
 * protein, carbs, fat), not just one. Least squares on the RELATIVE miss of each macro:
 *   minimise Σ w·((pm·g − Tm) / Tm)²   →   g* = Σ(w·pm/Tm) / Σ(w·pm²/Tm²)
 * (Before, the misses were in raw units, so kcal, in the hundreds, outweighed protein, in the tens, about 100:1
 * and the fit was really "hit the calories"; the protein weight did almost nothing.)
 */
export function balancedGramsForShare(perGram: PerGram, share: Share, weights: Weights = {}): number {
  const w = weightsOf(weights);
  let num = 0;
  let den = 0;
  for (const k of MACRO_KEYS) {
    const pm = perGram[k];
    const tm = share[k];
    if (!pm || pm <= 0 || !tm || tm <= 0) continue;
    num += (w[k] * pm) / tm;
    den += (w[k] * pm * pm) / (tm * tm);
  }
  if (den <= 0) return 0;
  return num / den;
}

/**
 * Fit a recipe to a macro share by changing the amount of EACH ingredient, not just the whole portion: e.g. a bit
 * more chicken and less rice when protein is short. Each ingredient stays between half and double of its share in
 * the uniformly scaled recipe, so the dish stays the dish, and a small pull towards the recipe's proportions keeps
 * changes no bigger than they need to be.
 *   minimise Σm w·((Σi a_im·x_i − Tm)/Tm)²  +  λ·Σi ((x_i − b_i)/b_i)²,   0.5·b_i ≤ x_i ≤ 2·b_i
 * solved by coordinate descent (a convex quadratic with box limits, a handful of ingredients).
 * Returns the grams per ingredient (same order as recipe_ingredients) and the meal's total.
 */
export function fitIngredients(recipe: RecipeRow, share: Share, opts: { weights?: Weights; lambda?: number } = {}) {
  const ris = recipe.recipe_ingredients;
  const per = ris.map((ri) => ({
    kcal: Number(ri.ingredient.kcal_per_100g) / 100,
    protein_g: Number(ri.ingredient.protein_per_100g) / 100,
    carbs_g: Number(ri.ingredient.carbs_per_100g) / 100,
    fat_g: Number(ri.ingredient.fat_per_100g) / 100,
  }));
  const uniform = clampGrams(balancedGramsForShare(recipePerGram(recipe), share, opts.weights) || Number(recipe.default_serving_g), 30, 5000);
  const base = ris.map((ri) => Math.max(0.1, Number(ri.ratio) * uniform));
  const x = [...base];
  const w = weightsOf(opts.weights ?? {});
  const lambda = opts.lambda ?? 0.15;
  const keys = MACRO_KEYS.filter((k) => share[k] > 0);
  const c = Object.fromEntries(keys.map((k) => [k, w[k] / (share[k] * share[k])])) as Record<keyof PerGram, number>;
  const total = (k: keyof PerGram) => x.reduce((s, xi, i) => s + per[i][k] * xi, 0);
  for (let sweep = 0; sweep < 200; sweep++) {
    let moved = 0;
    for (let i = 0; i < x.length; i++) {
      let grad = (lambda * (x[i] - base[i])) / (base[i] * base[i]);
      let curv = lambda / (base[i] * base[i]);
      for (const k of keys) {
        const miss = total(k) - share[k];
        grad += c[k] * per[i][k] * miss;
        curv += c[k] * per[i][k] * per[i][k];
      }
      const next = Math.min(2 * base[i], Math.max(0.5 * base[i], x[i] - grad / curv));
      moved = Math.max(moved, Math.abs(next - x[i]));
      x[i] = next;
    }
    if (moved < 0.01) break;
  }
  const grams = x.reduce((s, v) => s + v, 0);
  return { ingredientGrams: x, grams };
}

/** Macros and ingredient breakdown of a recipe made with the given grams per ingredient. */
export function mealFromIngredientGrams(recipe: RecipeRow, ingredientGrams: number[]) {
  const breakdown = recipe.recipe_ingredients.map((ri, i) => {
    const grams = ingredientGrams[i];
    const ing = ri.ingredient;
    return {
      id: ri.id, name: ing.name, ingredient_id: ing.id, grams,
      kcal: (Number(ing.kcal_per_100g) * grams) / 100,
      protein_g: (Number(ing.protein_per_100g) * grams) / 100,
      carbs_g: (Number(ing.carbs_per_100g) * grams) / 100,
      fat_g: (Number(ing.fat_per_100g) * grams) / 100,
    };
  }).sort((a, b) => b.grams - a.grams);
  const totals = breakdown.reduce((t, b) => ({ kcal: t.kcal + b.kcal, protein_g: t.protein_g + b.protein_g,
    carbs_g: t.carbs_g + b.carbs_g, fat_g: t.fat_g + b.fat_g }), { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  return { grams: breakdown.reduce((s, b) => s + b.grams, 0), totals, breakdown };
}

/** The meal for a recipe and a macro share: ingredients fitted one by one (own recipes), within 30-5000 g. */
export function fitRecipe(recipe: RecipeRow, share: Share) {
  const { ingredientGrams, grams } = fitIngredients(recipe, share);
  const f = grams > 5000 ? 5000 / grams : grams < 30 && grams > 0 ? 30 / grams : 1;
  return mealFromIngredientGrams(recipe, ingredientGrams.map((g) => g * f));
}

type LogLike = { total_grams: number | string; kcal: number | string; protein_g: number | string; carbs_g: number | string;
  fat_g: number | string; ingredients_json?: unknown };

/** The update that rescales an already planned meal to a new share: the whole portion (its ingredient proportions
 *  are kept), macros and the saved ingredient grams together. null if nothing to do. */
export function rescaledLog(l: LogLike, share: Share): Record<string, unknown> | null {
  const oldGrams = Number(l.total_grams);
  const oldKcal = Number(l.kcal);
  if (!oldGrams || !oldKcal) return null;
  const perGram: PerGram = { kcal: oldKcal / oldGrams, protein_g: Number(l.protein_g) / oldGrams,
    carbs_g: Number(l.carbs_g) / oldGrams, fat_g: Number(l.fat_g) / oldGrams };
  const newGrams = clampGrams(balancedGramsForShare(perGram, share) || oldGrams, 30, 5000);
  const f = newGrams / oldGrams;
  const update: Record<string, unknown> = {
    total_grams: Math.round(newGrams),
    kcal: Math.round(oldKcal * f),
    protein_g: Math.round(Number(l.protein_g) * f * 10) / 10,
    carbs_g: Math.round(Number(l.carbs_g) * f * 10) / 10,
    fat_g: Math.round(Number(l.fat_g) * f * 10) / 10,
  };
  // the ingredient list has to move with the portion, or it shows the old grams (it didn't, before)
  if (Array.isArray(l.ingredients_json)) {
    update.ingredients_json = (l.ingredients_json as Array<{ grams: number }>).map((i) => ({ ...i, grams: Math.round(Number(i.grams) * f) }));
  }
  return update;
}

/** Per gram of a cook book recipe. Its kcal / protein / carbs / fat are for ONE SERVING of serving_g grams (worked
 *  out from its ingredient lines); without serving_g, an average meal of 160 kcal per 100 g is assumed. */
export function cookbookPerGram(item: { kcal: number; protein_g: number; carbs_g: number; fat_g: number; serving_g?: number | null }): PerGram {
  const serving = Number(item.serving_g) || Math.max(150, Number(item.kcal) / 1.6);
  return {
    kcal: Number(item.kcal) / serving,
    protein_g: Number(item.protein_g) / serving,
    carbs_g: Number(item.carbs_g) / serving,
    fat_g: Number(item.fat_g) / serving,
  };
}

/** Grams of one serving of a cook book recipe (see cookbookPerGram). */
export function cookbookServing(item: { kcal: number; serving_g?: number | null }): number {
  return Number(item.serving_g) || Math.max(150, Number(item.kcal) / 1.6);
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
