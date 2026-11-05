import { describe, expect, it } from "vitest";
import { balancedGramsForShare, fitRecipe, macrosFor, portionLimits, portionOf, recipePerGram, rescaledLog, servingGrams } from "./scaling";
import type { RecipeRow } from "@/hooks/useRecipes";

const ing = (name: string, kcal: number, p: number, c: number, f: number) =>
  ({ id: name, name, kcal_per_100g: kcal, protein_per_100g: p, carbs_per_100g: c, fat_per_100g: f });
// chicken & rice, 50/50 by weight
const recipe = {
  id: "r", name: "Chicken rice", default_serving_g: 400, min_total_g: 50, max_total_g: 1200, is_fixed: false,
  recipe_ingredients: [
    { id: "a", ingredient_id: "chicken", ratio: 0.5, ingredient: ing("Chicken breast", 120, 23, 0, 2.5) },
    { id: "b", ingredient_id: "rice", ratio: 0.5, ingredient: ing("Rice, cooked", 130, 2.7, 28, 0.3) },
  ],
} as unknown as RecipeRow;
// one of four meals of a 2050 kcal / 160 P / 230 C / 57 F day
const share = { kcal: 512, protein_g: 40, carbs_g: 57, fat_g: 14 };
const miss = (m: { kcal: number; protein_g: number; carbs_g: number; fat_g: number }) =>
  (["kcal", "protein_g", "carbs_g", "fat_g"] as const).map((k) => Math.abs(m[k] - share[k]) / share[k]);

describe("per gram", () => {
  it("adds up the ingredients by their share of the weight", () => {
    const p = recipePerGram(recipe);
    expect(p.kcal).toBeCloseTo(1.25, 5);                 // (120 + 130) / 2 / 100
    expect(p.protein_g).toBeCloseTo(0.1285, 5);
    expect(macrosFor(p, 400).kcal).toBeCloseTo(500, 5);
  });
});

describe("balanced fit", () => {
  it("weighs every macro by how far off it is, not by its size in grams or kcal", () => {
    const g = balancedGramsForShare(recipePerGram(recipe), share);
    // the old raw-unit fit was the calorie fit (410 g); now protein and carbs pull too
    expect(g).toBeGreaterThan(300);
    expect(g).toBeLessThan(410);
  });
});

describe("fitting ingredients one by one", () => {
  it("lands closer to the share than scaling the whole recipe", () => {
    const uniform = macrosFor(recipePerGram(recipe), balancedGramsForShare(recipePerGram(recipe), share));
    const fitted = fitRecipe(recipe, share);
    const err = (m: typeof uniform) => miss(m).reduce((a, b) => a + b, 0);
    expect(err(fitted.totals)).toBeLessThan(err(uniform));
    const chicken = fitted.breakdown.find((b) => b.name === "Chicken breast")!.grams;
    const rice = fitted.breakdown.find((b) => b.name === "Rice, cooked")!.grams;
    // 40 g protein ≈ 150-170 g chicken, 57 g carbs ≈ 190-210 g rice: no longer the fixed 50/50 split
    expect(chicken).toBeGreaterThan(140);
    expect(chicken).toBeLessThan(190);
    expect(rice).toBeGreaterThan(180);
    expect(rice).toBeLessThan(220);
    expect(fitted.grams).toBeCloseTo(chicken + rice, 5);
    // macros of the meal are exactly its ingredients' macros
    expect(fitted.totals.protein_g).toBeCloseTo((chicken * 23 + rice * 2.7) / 100, 5);
  });
  it("keeps every ingredient between half and double of the plain scaled recipe", () => {
    const fitted = fitRecipe(recipe, { kcal: 512, protein_g: 120, carbs_g: 5, fat_g: 14 });   // extreme: protein only
    const rice = fitted.breakdown.find((b) => b.name === "Rice, cooked")!.grams;
    const chicken = fitted.breakdown.find((b) => b.name === "Chicken breast")!.grams;
    expect(chicken / rice).toBeLessThanOrEqual(4.0001);   // at most 2x vs 0.5x
  });
});

describe("rescaling a planned meal", () => {
  it("moves the ingredient grams along with the portion", () => {
    const u = rescaledLog({ total_grams: 400, kcal: 500, protein_g: 51.4, carbs_g: 56, fat_g: 5.6,
      ingredients_json: [{ name: "Chicken breast", grams: 200 }, { name: "Rice, cooked", grams: 200 }] }, share)!;
    const f = Number(u.total_grams) / 400;
    expect((u.ingredients_json as { grams: number }[])[0].grams).toBe(Math.round(200 * f));
    expect(Number(u.kcal)).toBe(Math.round(500 * f));
  });
});

import { cookbookPerGram, cookbookServing } from "./scaling";

describe("cook book recipes", () => {
  it("are per serving: per gram is macros / serving weight", () => {
    const salmon = { kcal: 520, protein_g: 38, carbs_g: 45, fat_g: 20, serving_g: 415 };
    expect(cookbookPerGram(salmon).kcal).toBeCloseTo(520 / 415, 5);
    expect(cookbookServing(salmon)).toBe(415);
  });
  it("fall back to an average meal without a serving weight", () => {
    expect(cookbookServing({ kcal: 640 })).toBe(400);
    expect(cookbookPerGram({ kcal: 640, protein_g: 40, carbs_g: 60, fat_g: 20 }).kcal).toBeCloseTo(1.6, 5);
  });
});

import { isFixedMeal } from "./scaling";

describe("fixed meals", () => {
  it("are fixed if saved as fixed or if their recipe is fixed now", () => {
    const fixedRecipes = new Set(["shake"]);
    expect(isFixedMeal({ is_fixed: false, recipe_id: "shake" }, fixedRecipes)).toBe(true);
    expect(isFixedMeal({ is_fixed: true, recipe_id: null }, fixedRecipes)).toBe(true);
    expect(isFixedMeal({ is_fixed: false, recipe_id: "bowl" }, fixedRecipes)).toBe(false);
  });
});

describe("servings and batch cooking", () => {
  const soup = {
    ...recipe, id: "soup", name: "Leek potato soup", default_serving_g: 1142, servings: 4, batch_cooked: true, cooked_weight_g: 1000,
    recipe_ingredients: [
      { id: "a", ratio: 222 / 1142, ingredient: { id: "leek", name: "Leek", kcal_per_100g: 29, protein_per_100g: 2.2, carbs_per_100g: 3.3, fat_per_100g: 0.3, dietary_tags: [] } },
      { id: "b", ratio: 600 / 1142, ingredient: { id: "pot", name: "Potato", kcal_per_100g: 72, protein_per_100g: 2, carbs_per_100g: 15.2, fat_per_100g: 0.1, dietary_tags: [] } },
      { id: "c", ratio: 320 / 1142, ingredient: { id: "milk", name: "Milk", kcal_per_100g: 46, protein_per_100g: 3.4, carbs_per_100g: 4.9, fat_per_100g: 1.5, dietary_tags: [] } },
    ],
  } as unknown as RecipeRow;
  const bigShare = { kcal: 800, protein_g: 50, carbs_g: 90, fat_g: 25 };

  it("one serving is the batch / servings", () => {
    expect(servingGrams(soup)).toBeCloseTo(285.5, 1);
  });
  it("a batch-cooked meal stays within 1.5 servings and keeps the pot's proportions", () => {
    const m = fitRecipe(soup, bigShare);
    expect(m.grams).toBeCloseTo(1.5 * 285.5, 0);           // the soup can't fill an 800 kcal meal: capped
    const leek = m.breakdown.find((b) => b.name === "Leek")!.grams;
    const pot = m.breakdown.find((b) => b.name === "Potato")!.grams;
    expect(pot / leek).toBeCloseTo(600 / 222, 5);            // nothing changed one by one
    const p = portionOf(soup, m.grams);
    expect(p.servings).toBeCloseTo(1.5, 2);
    expect(p.portion_g).toBe(375);                            // 1.5 servings of a 1000 g cooked pot
  });
  it("a fresh recipe with servings stays within 0.5-2 servings; a one-serving recipe as before", () => {
    const fresh = { ...soup, batch_cooked: false } as RecipeRow;
    expect(fitRecipe(fresh, bigShare).grams).toBeLessThanOrEqual(2 * 285.5 + 0.01);
    expect(portionLimits({ ...soup, servings: 1, batch_cooked: false })).toEqual({ min: 30, max: 5000 });
  });
  it("rescaling a planned meal keeps its limits and moves servings and plate grams along", () => {
    const u = rescaledLog({ total_grams: 285.5, kcal: 150, protein_g: 6, carbs_g: 25, fat_g: 2, servings: 1, portion_g: 250 },
      bigShare, portionLimits(soup))!;
    expect(Number(u.total_grams)).toBe(428);
    expect(u.servings).toBe(1.5);
    expect(u.portion_g).toBe(375);
  });
});
