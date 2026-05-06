// Utilities for matching recipes against a user's nutrition preference + dietary restrictions.

export type NutritionPref = "omnivore" | "vegetarian" | "vegan" | "pescatarian";

export type ProfilePrefs = {
  nutrition_preference?: NutritionPref | string | null;
  dietary_restrictions?: string[] | null;
};

// ----- Tag-based check (for user recipes whose ingredients have dietary_tags) -----

function everyHas(ingredientTagSets: string[][], tag: string): boolean {
  return ingredientTagSets.every((tags) => tags.includes(tag));
}
function noneHas(ingredientTagSets: string[][], tag: string): boolean {
  return ingredientTagSets.every((tags) => !tags.includes(tag));
}

const RESTRICTION_TO_FORBIDDEN_TAG: Record<string, string> = {
  "Gluten-free": "contains_gluten",
  "Lactose-free": "contains_lactose",
  "Nut-free": "contains_nuts",
  "Soy-free": "contains_soy",
  "Egg-free": "contains_eggs",
  "Shellfish-free": "contains_shellfish",
};
const RESTRICTION_TO_REQUIRED_TAG: Record<string, string> = {
  Halal: "halal",
  Kosher: "kosher",
};

export function matchesByTags(
  ingredientTagSets: string[][],
  prefs: ProfilePrefs,
): boolean {
  if (ingredientTagSets.length === 0) return true;
  const pref = prefs.nutrition_preference;
  if (pref === "vegan" && !everyHas(ingredientTagSets, "vegan")) return false;
  if (
    pref === "vegetarian" &&
    !ingredientTagSets.every((t) => t.includes("vegetarian") || t.includes("vegan"))
  )
    return false;
  if (
    pref === "pescatarian" &&
    !ingredientTagSets.every(
      (t) => t.includes("pescatarian") || t.includes("vegetarian") || t.includes("vegan"),
    )
  )
    return false;

  for (const r of prefs.dietary_restrictions ?? []) {
    const forbidden = RESTRICTION_TO_FORBIDDEN_TAG[r];
    if (forbidden && !noneHas(ingredientTagSets, forbidden)) return false;
    const required = RESTRICTION_TO_REQUIRED_TAG[r];
    if (required && !everyHas(ingredientTagSets, required)) return false;
  }
  return true;
}

// ----- Keyword-based check (for cookbook recipes whose ingredients are plain strings) -----

const KW = {
  meat: ["chicken", "beef", "pork", "lamb", "bacon", "ham", "turkey", "sausage", "prosciutto", "veal", "duck", "steak"],
  fish: ["fish", "salmon", "tuna", "cod", "sardine", "anchovy", "trout", "mackerel"],
  shellfish: ["shrimp", "prawn", "crab", "lobster", "mussel", "oyster", "scallop", "clam"],
  dairy: ["milk", "cheese", "butter", "cream", "yogurt", "yoghurt", "ghee", "parmesan", "mozzarella", "feta", "ricotta"],
  eggs: ["egg"],
  gluten: ["bread", "pasta", "flour", "wheat", "noodle", "couscous", "bulgur", "soy sauce", "tortilla", "panko", "breadcrumb"],
  nuts: ["almond", "cashew", "peanut", "walnut", "pecan", "hazelnut", "pistachio"],
  soy: ["soy", "tofu", "edamame", "tempeh", "miso"],
  honey: ["honey"],
  pork: ["pork", "bacon", "ham", "prosciutto", "lard"],
};

function hasAny(text: string, words: string[]): boolean {
  return words.some((w) => text.includes(w));
}

export function matchesByKeywords(
  ingredientStrings: string[],
  prefs: ProfilePrefs,
): boolean {
  const text = ingredientStrings.join(" | ").toLowerCase();
  const pref = prefs.nutrition_preference;
  const hasMeat = hasAny(text, KW.meat);
  const hasFish = hasAny(text, KW.fish) || hasAny(text, KW.shellfish);
  const hasDairy = hasAny(text, KW.dairy);
  const hasEggs = hasAny(text, KW.eggs);
  const hasHoney = hasAny(text, KW.honey);

  if (pref === "vegan" && (hasMeat || hasFish || hasDairy || hasEggs || hasHoney)) return false;
  if (pref === "vegetarian" && (hasMeat || hasFish)) return false;
  if (pref === "pescatarian" && hasMeat) return false;

  for (const r of prefs.dietary_restrictions ?? []) {
    if (r === "Gluten-free" && hasAny(text, KW.gluten)) return false;
    if (r === "Lactose-free" && hasDairy) return false;
    if (r === "Nut-free" && hasAny(text, KW.nuts)) return false;
    if (r === "Soy-free" && hasAny(text, KW.soy)) return false;
    if (r === "Egg-free" && hasEggs) return false;
    if (r === "Shellfish-free" && hasAny(text, KW.shellfish)) return false;
    if (r === "Halal" && hasAny(text, KW.pork)) return false;
    if (r === "Kosher" && (hasAny(text, KW.pork) || hasAny(text, KW.shellfish))) return false;
  }
  return true;
}

export function hasAnyPrefs(prefs: ProfilePrefs): boolean {
  const pref = prefs.nutrition_preference;
  const hasNutrition = !!pref && pref !== "omnivore";
  const hasRestrictions = (prefs.dietary_restrictions ?? []).length > 0;
  return hasNutrition || hasRestrictions;
}
