/** Ingredient search over your list (now ~800 with the Swiss foods): every typed word must appear in the English
 *  or German name; names starting with the first word come first, then your own (not imported), then shorter. */
export type Searchable = { id: string; name: string; name_de?: string | null; source?: string | null };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function searchIngredients<T extends Searchable>(list: T[], query: string, limit = 60): T[] {
  const words = norm(query).split(/[\s,]+/).filter(Boolean);
  if (!words.length) return list.slice(0, limit);
  const scored: { i: T; s: number }[] = [];
  for (const i of list) {
    const hay = norm(`${i.name} ${i.name_de ?? ""}`);
    if (!words.every((w) => hay.includes(w))) continue;
    const n = norm(i.name), de = norm(i.name_de ?? "");
    let s = 0;
    if (n.startsWith(words[0]) || de.startsWith(words[0])) s -= 100;
    if (!i.source) s -= 50;                                // your own first
    s += Math.min(i.name.length, 60);
    scored.push({ i, s });
  }
  return scored.sort((a, b) => a.s - b.s).slice(0, limit).map((x) => x.i);
}

/** Same words in any order, plural s and raw / fresh ignored: to spot an ingredient you already have. */
export function sameFood(a: string, b: string) {
  const key = (s: string) => {
    const filler = new Set(["raw", "roh", "fresh", "frisch", "natural", "nature", "plain", "average"]);
    const ws = new Set(norm(s).match(/[a-z0-9]+/g)?.map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w)) ?? []);
    return [...ws].filter((w) => !filler.has(w)).sort().join(" ");
  };
  return key(a) === key(b);
}
