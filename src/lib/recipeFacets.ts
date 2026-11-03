// What a recipe is made of, worked out from its ingredient text, for the filters on "Plan my meals":
// base (the carb source), protein, lifestyle (vegan / vegetarian / omnivore) and country.

export type Facets = { bases: string[]; proteins: string[]; lifestyle: Lifestyle; country: string | null };
export type Lifestyle = "Vegan" | "Vegetarian" | "Omnivore";

// [label, words]. A word matches at the start of a word ("rice" matches "rice noodles", not "price").
export const BASES: [string, string[]][] = [
  ["Rice", ["rice", "risotto"]],
  ["Pasta & noodles", ["pasta", "spaghetti", "penne", "fusilli", "linguine", "tagliatelle", "macaroni", "lasagn", "gnocchi", "noodle", "ramen", "udon", "soba"]],
  ["Potatoes", ["potato", "rösti", "rosti", "fries", "hash brown"]],
  ["Bread & wraps", ["bread", "toast", "tortilla", "wrap", "pita", "bun", "bagel", "naan", "baguette", "sourdough"]],
  ["Oats & grains", ["oat", "granola", "muesli", "quinoa", "couscous", "bulgur", "barley", "polenta", "millet"]],
];

export const PROTEINS: [string, string[]][] = [
  ["Chicken", ["chicken"]],
  ["Beef", ["beef", "steak", "veal"]],
  ["Pork", ["pork", "bacon", "ham", "prosciutto", "sausage", "chorizo"]],
  ["Lamb", ["lamb"]],
  ["Turkey", ["turkey"]],
  ["Fish & seafood", ["fish", "salmon", "tuna", "cod", "trout", "mackerel", "sardine", "anchov", "shrimp", "prawn", "crab", "squid", "scallop", "mussel", "seafood"]],
  ["Eggs", ["egg"]],
  ["Tofu & tempeh", ["tofu", "tempeh", "seitan", "edamame"]],
  ["Legumes", ["lentil", "chickpea", "bean", "dal", "hummus", "falafel"]],
  ["Dairy", ["skyr", "quark", "yogurt", "yoghurt", "cottage", "cheese", "ricotta", "feta", "mozzarella", "parmesan", "halloumi", "paneer"]],
  ["Protein powder", ["whey", "protein powder", "casein", "protein shake"]],
];

const MEAT = ["chicken", "beef", "steak", "veal", "pork", "bacon", "ham", "prosciutto", "sausage", "chorizo", "lamb", "turkey",
  "duck", "fish", "salmon", "tuna", "cod", "trout", "mackerel", "sardine", "anchov", "shrimp", "prawn", "crab", "squid",
  "scallop", "mussel", "seafood", "gelatin", "fish sauce"];
const ANIMAL = ["egg", "milk", "butter", "cream", "cheese", "yogurt", "yoghurt", "skyr", "quark", "cottage", "ricotta", "feta",
  "mozzarella", "parmesan", "halloumi", "paneer", "ghee", "honey", "whey", "casein", "mayo"];
// look-alikes that aren't what they seem
const NOT = ["eggplant", "green bean", "coconut milk", "almond milk", "oat milk", "soy milk", "rice milk", "peanut butter",
  "almond butter", "cocoa butter", "vegan", "plant-based", "plant based", "cream of tartar", "rice vinegar", "jelly bean"];

const CUISINE_COUNTRY: Record<string, string> = {
  italian: "Italy", mexican: "Mexico", indian: "India", japanese: "Japan", thai: "Thailand", greek: "Greece",
  chinese: "China", french: "France", american: "USA", korean: "Korea", spanish: "Spain", turkish: "Turkey",
  vietnamese: "Vietnam", "middle-eastern": "Middle East", swiss: "Switzerland",
};

function clean(text: string): string {
  let t = ` ${text.toLowerCase()} `;
  for (const n of NOT) t = t.split(n).join(" ");
  return t;
}

function has(text: string, word: string): boolean {
  const w = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-zäöüß])${w}`).test(text);
}

const pick = (text: string, groups: [string, string[]][]) =>
  groups.filter(([, words]) => words.some((w) => has(text, w))).map(([label]) => label);

/** Facets of a recipe from its ingredient lines (plus its name), its country and cuisine tags.
 *  dietaryTags: the ingredients' dietary_tags, when every ingredient has them (own recipes). */
export function facetsOf(
  ingredients: string[],
  opts: { name?: string; country?: string | null; cuisineTags?: string[]; dietaryTags?: string[][] } = {},
): Facets {
  const text = clean([opts.name ?? "", ...ingredients].join(" | "));
  let lifestyle: Lifestyle = MEAT.some((w) => has(text, w)) ? "Omnivore" : ANIMAL.some((w) => has(text, w)) ? "Vegetarian" : "Vegan";
  const tags = opts.dietaryTags;
  if (tags?.length && tags.every((t) => t.length)) {
    if (tags.every((t) => t.includes("vegan"))) lifestyle = "Vegan";
    else if (tags.every((t) => t.includes("vegan") || t.includes("vegetarian"))) lifestyle = lifestyle === "Omnivore" ? "Vegetarian" : lifestyle;
  }
  const country = opts.country
    ?? (opts.cuisineTags ?? []).map((t) => CUISINE_COUNTRY[t.toLowerCase()]).find(Boolean)
    ?? null;
  return { bases: pick(text, BASES), proteins: pick(text, PROTEINS), lifestyle, country };
}

export const LIFESTYLES: Lifestyle[] = ["Vegan", "Vegetarian", "Omnivore"];

/** A recipe fits a lifestyle filter if it is at least that strict: vegan food also suits vegetarians and omnivores. */
export function fitsLifestyle(recipe: Lifestyle, filter: Lifestyle): boolean {
  const rank = { Vegan: 0, Vegetarian: 1, Omnivore: 2 };
  return rank[recipe] <= rank[filter];
}
