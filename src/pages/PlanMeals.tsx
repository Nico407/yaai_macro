import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ChefHat, Pencil, Plus, Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useRecipes, type RecipeRow } from "@/hooks/useRecipes";
import { useAllCookbookRecipes } from "@/hooks/useAllCookbookRecipes";
import type { CookbookRecipe } from "@/hooks/useCookbookRecipes";
import { CookbookList } from "@/components/CookbookList";
import { ALL, RecipeFilterBar, passes, useRecipeFacets, type RecipeFilter } from "@/components/RecipeFilters";
import type { Facets } from "@/lib/recipeFacets";

/** One page with every recipe (yours, the cook book, the country recipes), filtered by base, protein, country and
 *  lifestyle. The filters are kept in the address (?base=Rice&protein=Chicken…), so YAAI can open a filtered list. */
export default function PlanMeals() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const { data: own = [], isLoading: l1 } = useRecipes();
  const { data: cookbook = [], isLoading: l2 } = useAllCookbookRecipes();

  const filter: RecipeFilter = {
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
  const { ownFacets, cbFacets, countries } = useRecipeFacets(own, cookbook);
  const fits = (f: Facets | undefined, name: string, desc: string | null) => passes(f, name, desc, filter, query);
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

        <RecipeFilterBar query={query} onQuery={setQuery} filter={filter} onFilter={setFilter} countries={countries}
          onClear={() => { setQuery(""); setParams(new URLSearchParams(), { replace: true }); }} />
        <div className="mb-5 mt-2 text-xs text-muted-foreground tabular-nums">
          {l1 || l2 ? "Loading…" : `${total} recipe${total === 1 ? "" : "s"}`}
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
