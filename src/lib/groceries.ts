// Grocery list display: aisle order in the shop and how an amount reads. The list itself is built in the database
// (build_grocery_list, migration 20261109140000_grocery_list.sql), so the app and YAAI on Telegram show the same
// items and ticks. YAAI formats amounts the same way (modules/macros/groceries.py in yaai_pi).

export type GroceryItem = {
  id: string;
  key: string;
  name: string;
  grams: number | null;
  aisle: string;
  staple: boolean;
  recipes: string[];
  checked: boolean;
  by_hand: boolean;
  from_date: string | null;
  to_date: string | null;
};

export const AISLES = ["Fruit & veg", "Bread, rice & pasta", "Meat & fish", "Dairy, eggs & tofu", "Frozen", "Pantry", "Other"];
export const STAPLES = "Check at home";

/** '350 g', '1.3 kg', '≈ 4 eggs (220 g)'; '' when there's no amount. Grams round up to 10, as you'd buy them. */
export function amountLabel(grams: number | null | undefined, name = ""): string {
  const g = Number(grams);
  if (!g || g <= 0) return "";
  const n = name.toLowerCase();
  if (/(^|[^a-z])eggs?($|[^a-z])/.test(n) && !/white|yolk|plant/.test(n)) {
    const count = Math.max(1, Math.round(g / 55));
    return `≈ ${count} egg${count === 1 ? "" : "s"} (${Math.ceil(g / 10) * 10} g)`;
  }
  if (g >= 1000) return `${(Math.ceil(g / 100) / 10).toFixed(1).replace(/\.0$/, "")} kg`;
  return `${Math.max(10, Math.ceil(g / 10) * 10)} g`;
}

/** [[section, items]] in shop order: the aisles, then the staples to check at home. Pure. */
export function groupItems(items: GroceryItem[]): [string, GroceryItem[]][] {
  const sections = new Map<string, GroceryItem[]>();
  for (const it of items) {
    const s = it.staple ? STAPLES : AISLES.includes(it.aisle) ? it.aisle : "Other";
    sections.set(s, [...(sections.get(s) ?? []), it]);
  }
  const order = [...AISLES, STAPLES];
  return order
    .filter((s) => sections.has(s))
    .map((s) => [s, sections.get(s)!.sort((a, b) => Number(a.checked) - Number(b.checked) || a.name.localeCompare(b.name))]);
}
