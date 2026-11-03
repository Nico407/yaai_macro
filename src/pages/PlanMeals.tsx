import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ChefHat, Pencil, Plus, Search, Star, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRecipes, type RecipeRow } from "@/hooks/useRecipes";
import { useAllCookbookRecipes } from "@/hooks/useAllCookbookRecipes";
import type { CookbookRecipe } from "@/hooks/useCookbookRecipes";
import { CookbookList } from "@/components/CookbookList";
import { BASES, LIFESTYLES, PROTEINS, facetsOf, fitsLifestyle, type Facets, type Lifestyle } from "@/lib/recipeFacets";

const ALL = "__all__";

/** One page with every recipe (yours, the cook book, the country recipes), filtered by base, protein, country and
 *  lifestyle. The filters are kept in the address (?base=Rice&protein=Chicken…), so YAAI can open a filtered list. */
export default function PlanMeals() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const { data: own = [], isLoading: l1 } = useRecipes();
  const { data: cookbook = [], isLoading: l2 } = useAllCookbookRecipes();

  const filter = {
    base: params.get("base") ?? ALL,
    protein: params.get("protein") ?? ALL,
    country: params.get("country") ?? ALL,
    lifestyle: params.get("lifestyle") ?? ALL,
  };
  const setFilter = (key: keyof typeof filter, value: string) => {
    const next = new URLSearchParams(params);
    if (value === ALL) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };
  const active = Object.values(filter).filter((v) => v !== ALL).length + (query ? 1 : 0);

  const ownFacets = useMemo(() => new Map<string, Facets>(own.map((r) => [r.id, facetsOf(
    (r.recipe_ingredients ?? []).map((ri) => ri.ingredient?.name ?? ""),
    { name: r.name, cuisineTags: r.cuisine_tags, dietaryTags: (r.recipe_ingredients ?? []).map((ri) => ri.ingredient?.dietary_tags ?? []) },
  )])), [own]);
  const cbFacets = useMemo(() => new Map<string, Facets>(cookbook.map((r) => [r.id, facetsOf(
    r.ingredients ?? [], { name: r.name, country: r.country },
  )])), [cookbook]);

  const countries = useMemo(() => [...new Set([...ownFacets.values(), ...cbFacets.values()]
    .map((f) => f.country).filter((c): c is string => !!c))].sort(), [ownFacets, cbFacets]);

  const fits = (f: Facets | undefined, name: string, desc: string | null) => {
    if (!f) return false;
    const q = query.trim().toLowerCase();
    if (q && !name.toLowerCase().includes(q) && !(desc ?? "").toLowerCase().includes(q)) return false;
    if (filter.base !== ALL && !(filter.base === "none" ? f.bases.length === 0 : f.bases.includes(filter.base))) return false;
    if (filter.protein !== ALL && !f.proteins.includes(filter.protein)) return false;
    if (filter.country !== ALL && f.country !== filter.country) return false;
    if (filter.lifestyle !== ALL && !fitsLifestyle(f.lifestyle, filter.lifestyle as Lifestyle)) return false;
    return true;
  };
  const ownShown = own.filter((r) => fits(ownFacets.get(r.id), r.name, r.description));
  const cbShown: CookbookRecipe[] = cookbook.filter((r) => fits(cbFacets.get(r.id), r.name, r.description));
  const total = ownShown.length + cbShown.length;

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-3xl px-4 py-8 md:py-12">
        <header className="mb-6">
          <Link to="/main" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Plan my meals</p>
              <h1 className="font-display text-4xl font-bold md:text-5xl">Recipes</h1>
            </div>
            <Button asChild variant="outline" className="rounded-xl">
              <Link to="/recipes/new"><Plus className="mr-1 h-4 w-4" /> New recipe</Link>
            </Button>
          </div>
        </header>

        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search recipes…" className="pl-9" />
        </div>
        <div className="mb-2 grid grid-cols-2 gap-2 md:grid-cols-4">
          <FilterSelect label="Base" value={filter.base} onChange={(v) => setFilter("base", v)}
            options={[...BASES.map(([b]) => b), "none"]} labels={{ none: "No carb base" }} />
          <FilterSelect label="Protein" value={filter.protein} onChange={(v) => setFilter("protein", v)}
            options={PROTEINS.map(([p]) => p)} />
          <FilterSelect label="Country" value={filter.country} onChange={(v) => setFilter("country", v)} options={countries} />
          <FilterSelect label="Lifestyle" value={filter.lifestyle} onChange={(v) => setFilter("lifestyle", v)} options={LIFESTYLES} />
        </div>
        <div className="mb-5 flex items-center justify-between text-xs text-muted-foreground">
          <span className="tabular-nums">{l1 || l2 ? "Loading…" : `${total} recipe${total === 1 ? "" : "s"}`}</span>
          {active > 0 && (
            <button onClick={() => { setQuery(""); setParams(new URLSearchParams(), { replace: true }); }}
              className="inline-flex items-center gap-1 hover:text-foreground">
              <X className="h-3 w-3" /> Clear filters
            </button>
          )}
        </div>

        {!l1 && !l2 && total === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">No recipes match these filters.</p>
        )}

        <div className="space-y-3">
          {ownShown.map((r) => (
            <OwnRecipeCard key={r.id} r={r} f={ownFacets.get(r.id)!}
              onPlan={() => navigate(`/recipes/${r.id}/scale`)} onEdit={() => navigate(`/recipes/${r.id}/edit`)} />
          ))}
        </div>
        {cbShown.length > 0 && <div className={ownShown.length ? "mt-3" : ""}><CookbookList recipes={cbShown} bare /></div>}
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options, labels = {} }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]; labels?: Record<string, string>;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={`rounded-xl ${value !== ALL ? "border-primary/60 text-primary" : ""}`} aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{label}: all</SelectItem>
        {options.map((o) => <SelectItem key={o} value={o}>{labels[o] ?? o}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function FacetChips({ f }: { f: Facets }) {
  const chips = [...f.bases, ...f.proteins, ...(f.country ? [f.country] : []), f.lifestyle];
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {chips.map((c) => (
        <span key={c} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{c}</span>
      ))}
    </div>
  );
}

function OwnRecipeCard({ r, f, onPlan, onEdit }: { r: RecipeRow; f: Facets; onPlan: () => void; onEdit: () => void }) {
  return (
    <Card className="rounded-2xl p-5">
      <div className="flex items-start gap-4">
        <ChefHat className="mt-1 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-display text-lg font-bold">{r.name}</div>
            {r.is_favorite && <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />}
            <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">Your recipe</span>
          </div>
          {r.description && <div className="mt-1 text-xs text-muted-foreground">{r.description}</div>}
          <FacetChips f={f} />
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={onPlan} className="rounded-xl bg-accent text-accent-foreground hover:bg-accent/90">
              <Plus className="mr-1 h-4 w-4" /> Add to plan
            </Button>
            <Button size="sm" variant="ghost" onClick={onEdit} className="rounded-xl">
              <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
