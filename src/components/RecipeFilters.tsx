import { useMemo } from "react";
import { Search, Star, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { RecipeRow } from "@/hooks/useRecipes";
import type { CookbookRecipe } from "@/hooks/useCookbookRecipes";
import { BASES, LIFESTYLES, PROTEINS, facetsOf, fitsLifestyle, storedFacets, type Facets, type Lifestyle } from "@/lib/recipeFacets";
import { cn } from "@/lib/utils";

export const ALL = "__all__";
export type RecipeFilter = { base: string; protein: string; country: string; lifestyle: string };
export const NO_FILTER: RecipeFilter = { base: ALL, protein: ALL, country: ALL, lifestyle: ALL };

/** The tags of every recipe (stored ones; suggested only for recipes that were never tagged), and the countries used. */
export function useRecipeFacets(own: RecipeRow[], cookbook: CookbookRecipe[]) {
  return useMemo(() => {
    const ownFacets = new Map<string, Facets>(own.map((r) => [r.id, storedFacets(r, () => facetsOf(
      (r.recipe_ingredients ?? []).map((ri) => ri.ingredient?.name ?? ""),
      { name: r.name, cuisineTags: r.cuisine_tags, dietaryTags: (r.recipe_ingredients ?? []).map((ri) => ri.ingredient?.dietary_tags ?? []) },
    ))]));
    const cbFacets = new Map<string, Facets>(cookbook.map((r) => [r.id, storedFacets(r, () => facetsOf(
      r.ingredients ?? [], { name: r.name, country: r.country },
    ))]));
    const countries = [...new Set([...ownFacets.values(), ...cbFacets.values()]
      .map((f) => f.country).filter((c): c is string => !!c))].sort();
    return { ownFacets, cbFacets, countries };
  }, [own, cookbook]);
}

/** Does a recipe pass the search text and the four dropdowns? */
export function passes(f: Facets | undefined, name: string, desc: string | null | undefined, filter: RecipeFilter, query: string) {
  if (!f) return false;
  const q = query.trim().toLowerCase();
  if (q && !name.toLowerCase().includes(q) && !(desc ?? "").toLowerCase().includes(q)) return false;
  if (filter.base !== ALL && !(filter.base === "none" ? f.bases.length === 0 : f.bases.includes(filter.base))) return false;
  if (filter.protein !== ALL && !f.proteins.includes(filter.protein)) return false;
  if (filter.country !== ALL && f.country !== filter.country) return false;
  if (filter.lifestyle !== ALL && !fitsLifestyle(f.lifestyle, filter.lifestyle as Lifestyle)) return false;
  return true;
}

/** Search box and the four dropdowns (base, protein, country, lifestyle); optionally a favourites-only chip. */
export function RecipeFilterBar({ query, onQuery, filter, onFilter, countries, favoritesOnly, onFavoritesOnly, onClear }: {
  query: string; onQuery: (q: string) => void;
  filter: RecipeFilter; onFilter: (key: keyof RecipeFilter, value: string) => void;
  countries: string[];
  favoritesOnly?: boolean; onFavoritesOnly?: (v: boolean) => void;
  onClear: () => void;
}) {
  const active = Object.values(filter).filter((v) => v !== ALL).length + (query ? 1 : 0) + (favoritesOnly ? 1 : 0);
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search recipes…" className="pl-9" />
        </div>
        {onFavoritesOnly && (
          <button type="button" onClick={() => onFavoritesOnly(!favoritesOnly)} title="Favourites only"
            className={cn("inline-flex items-center gap-1 rounded-xl border px-3 text-sm transition-colors",
              favoritesOnly ? "border-primary/60 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
            <Star className={cn("h-4 w-4", favoritesOnly && "fill-yellow-400 text-yellow-400")} />
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <FilterSelect label="Base" value={filter.base} onChange={(v) => onFilter("base", v)}
          options={[...BASES.map(([b]) => b), "none"]} labels={{ none: "No carb base" }} />
        <FilterSelect label="Protein" value={filter.protein} onChange={(v) => onFilter("protein", v)} options={PROTEINS.map(([p]) => p)} />
        <FilterSelect label="Country" value={filter.country} onChange={(v) => onFilter("country", v)} options={countries} />
        <FilterSelect label="Lifestyle" value={filter.lifestyle} onChange={(v) => onFilter("lifestyle", v)} options={LIFESTYLES} />
      </div>
      {active > 0 && (
        <div className="flex justify-end">
          <button type="button" onClick={onClear} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <X className="h-3 w-3" /> Clear filters
          </button>
        </div>
      )}
    </div>
  );
}

function FilterSelect({ label, value, onChange, options, labels = {} }: {
  label: string; value: string; onChange: (v: string) => void; options: readonly string[]; labels?: Record<string, string>;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn("rounded-xl", value !== ALL && "border-primary/60 text-primary")} aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{label}: all</SelectItem>
        {options.map((o) => <SelectItem key={o} value={o}>{labels[o] ?? o}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
