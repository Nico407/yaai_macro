import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useRecipes, type RecipeRow } from "@/hooks/useRecipes";
import { useProfile } from "@/hooks/useProfile";
import { useTodayLogs } from "@/hooks/useTodayLogs";
import { sumMacros, remaining as calcRemaining } from "@/lib/macros";
import { ingredientBreakdown, macrosFor, recipePerGram, fitRecipe, rescaledLog, isFixedMeal } from "@/lib/scaling";
import { supabase } from "@/integrations/supabase/client";
import { localDateISO } from "@/lib/dates";
import { toast } from "sonner";
import { ArrowLeft, Check, Loader2, Pencil, Plus, Search, Utensils } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { matchesByTags, hasAnyPrefs, type ProfilePrefs } from "@/lib/dietary";

const SLOTS = ["Breakfast", "Lunch", "Dinner", "Snack"] as const;
type Slot = (typeof SLOTS)[number];

export default function Recipes() {
  const qc = useQueryClient();
  const { data: recipes = [], isLoading } = useRecipes();
  const fixedRecipeIds = useMemo(() => new Set(recipes.filter((r) => r.is_fixed).map((r) => r.id)), [recipes]);
  const { data: profile } = useProfile();
  const { data: logs = [] } = useTodayLogs();
  const [editMode, setEditMode] = useState(false);
  const [picking, setPicking] = useState<RecipeRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [hideNonMatching, setHideNonMatching] = useState(true);

  const prefs: ProfilePrefs = {
    nutrition_preference: (profile as { nutrition_preference?: string } | undefined)?.nutrition_preference ?? null,
    dietary_restrictions: (profile as { dietary_restrictions?: string[] } | undefined)?.dietary_restrictions ?? [],
  };
  const prefsActive = hasAnyPrefs(prefs);

  const recipeMatches = useMemo(() => {
    const m = new Map<string, boolean>();
    recipes.forEach((r) => {
      const tagSets = r.recipe_ingredients.map((ri) => ri.ingredient.dietary_tags ?? []);
      m.set(r.id, matchesByTags(tagSets, prefs));
    });
    return m;
  }, [recipes, prefs]);

  const filteredRecipes = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = recipes;
    if (q) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.description ?? "").toLowerCase().includes(q),
      );
    }
    if (prefsActive && hideNonMatching) {
      list = list.filter((r) => recipeMatches.get(r.id));
    }
    return list;
  }, [recipes, query, prefsActive, hideNonMatching, recipeMatches]);

  const consumed = useMemo(
    () =>
      sumMacros(
        logs.map((l) => ({
          kcal: Number(l.kcal),
          protein_g: Number(l.protein_g),
          carbs_g: Number(l.carbs_g),
          fat_g: Number(l.fat_g),
        })),
      ),
    [logs],
  );

  const target = profile?.target_calories
    ? {
        kcal: Number(profile.target_calories),
        protein_g: Number(profile.target_protein_g ?? 0),
        carbs_g: Number(profile.target_carbs_g ?? 0),
        fat_g: Number(profile.target_fat_g ?? 0),
      }
    : null;

  const usedSlots = new Set(logs.map((l) => l.slot).filter(Boolean));
  const emptySlots = SLOTS.filter((s) => !usedSlots.has(s)).length;

  async function addRecipeToSlot(recipe: RecipeRow, slot: Slot | "__extra__") {
    const perGram = recipePerGram(recipe);
    if (!perGram.kcal) {
      toast.error("Recipe has no calories");
      return;
    }
    const isFixed = !!recipe.is_fixed;

    const fixedLogs = logs.filter((l) => isFixedMeal(l, fixedRecipeIds));
    const scalableLogs = logs.filter((l) => !isFixedMeal(l, fixedRecipeIds));

    let grams = Number(recipe.default_serving_g);
    let share = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
    let scalableCount = 0;
    if (target) {
      const fixedConsumed = {
        kcal: fixedLogs.reduce((s, l) => s + Number(l.kcal), 0) +
          (isFixed ? recipePerGram(recipe).kcal * Number(recipe.default_serving_g) : 0),
        protein_g: fixedLogs.reduce((s, l) => s + Number(l.protein_g), 0) +
          (isFixed ? perGram.protein_g * Number(recipe.default_serving_g) : 0),
        carbs_g: fixedLogs.reduce((s, l) => s + Number(l.carbs_g), 0) +
          (isFixed ? perGram.carbs_g * Number(recipe.default_serving_g) : 0),
        fat_g: fixedLogs.reduce((s, l) => s + Number(l.fat_g), 0) +
          (isFixed ? perGram.fat_g * Number(recipe.default_serving_g) : 0),
      };
      scalableCount = scalableLogs.length + (isFixed ? 0 : 1);
      const denom = Math.max(1, scalableCount);
      share = {
        kcal: Math.max(0, target.kcal - fixedConsumed.kcal) / denom,
        protein_g: Math.max(0, target.protein_g - fixedConsumed.protein_g) / denom,
        carbs_g: Math.max(0, target.carbs_g - fixedConsumed.carbs_g) / denom,
        fat_g: Math.max(0, target.fat_g - fixedConsumed.fat_g) / denom,
      };
    }
    // fixed meals keep their batch size; others get each ingredient's amount fitted to this meal's share
    const fitted = target && !isFixed ? fitRecipe(recipe, share) : null;
    if (fitted) grams = fitted.grams;
    const totals = fitted ? fitted.totals : macrosFor(perGram, grams);
    const breakdown = fitted ? fitted.breakdown : ingredientBreakdown(recipe, grams);

    setBusy(true);

    if (target && scalableCount > 0) {
      for (const l of scalableLogs) {
        // the whole portion moves to the new share, with its saved ingredient grams
        const update = rescaledLog(l, share);
        if (!update) continue;
        const { error: upErr } = await supabase
          .from("meal_logs")
          .update(update as never)
          .eq("id", l.id);
        if (upErr) {
          setBusy(false);
          toast.error("Couldn't rescale meals", { description: upErr.message });
          return;
        }
      }
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBusy(false); toast.error("Sign in required"); return; }
    const { error } = await supabase.from("meal_logs").insert({
      user_id: user.id,
      recipe_id: recipe.id,
      recipe_name: recipe.name,
      log_date: localDateISO(),   // today in Swiss time (the database default is UTC)
      total_grams: Math.round(grams),
      kcal: Math.round(totals.kcal),
      protein_g: Math.round(totals.protein_g * 10) / 10,
      carbs_g: Math.round(totals.carbs_g * 10) / 10,
      fat_g: Math.round(totals.fat_g * 10) / 10,
      slot: slot === "__extra__" ? null : slot,
      is_fixed: isFixed,
      instructions: recipe.instructions ?? null,
      ingredients_json: breakdown.map((b) => ({
        ingredient_id: b.ingredient_id,
        name: b.name,
        grams: Math.round(b.grams),
      })),
    });
    setBusy(false);
    if (error) {
      toast.error("Couldn't add", { description: error.message });
      return;
    }
    setPicking(null);
    await qc.invalidateQueries({ queryKey: ["meal_logs"] });
    toast.success(`${recipe.name} added${slot !== "__extra__" ? ` to ${slot}` : ""}`);
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 md:py-12">
        <header className="mb-8">
          <Link to="/main" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Cookbook</p>
              <h1 className="font-display text-4xl font-bold md:text-5xl">Recipes</h1>
            </div>
            <div className="flex flex-col gap-2">
              <Button asChild>
                <Link to="/recipes/new">
                  <Plus className="mr-1 h-4 w-4" /> New
                </Link>
              </Button>
              <Button variant={editMode ? "default" : "outline"} onClick={() => setEditMode((v) => !v)}>
                <Pencil className="mr-1 h-4 w-4" />
                {editMode ? "Done" : "Edit"}
              </Button>
            </div>
          </div>
          {editMode && (
            <p className="mt-3 text-xs text-muted-foreground">
              Tap any recipe to edit it. Tap <strong>Done</strong> to exit edit mode.
            </p>
          )}
        </header>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : recipes.length === 0 ? (
          <Card className="rounded-2xl p-10 text-center">
            <Utensils className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-muted-foreground">No recipes yet.</p>
            <Button asChild className="mt-4">
              <Link to="/recipes/new">
                <Plus className="mr-1 h-4 w-4" /> Build your first recipe
              </Link>
            </Button>
          </Card>
        ) : (
          <>
            <div className="relative mb-4">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search recipes…"
                className="pl-9"
              />
            </div>
            {prefsActive && (
              <div className="mb-4 flex items-center justify-between rounded-xl border bg-secondary/40 px-4 py-2.5">
                <Label htmlFor="r-hide" className="text-sm">
                  Hide recipes that don't match my prefs
                </Label>
                <Switch id="r-hide" checked={hideNonMatching} onCheckedChange={setHideNonMatching} />
              </div>
            )}
            {filteredRecipes.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No recipes match "{query}".
              </p>
            ) : (
          <div className="space-y-3">
            {filteredRecipes.map((r) => {
              const total = r.default_serving_g;
              let kcal = 0, protein = 0, carbs = 0, fat = 0;
              r.recipe_ingredients.forEach((ri) => {
                const g = Number(ri.ratio) * total;
                const ing = ri.ingredient;
                kcal += (Number(ing.kcal_per_100g) * g) / 100;
                protein += (Number(ing.protein_per_100g) * g) / 100;
                carbs += (Number(ing.carbs_per_100g) * g) / 100;
                fat += (Number(ing.fat_per_100g) * g) / 100;
              });

              const cardInner = (
                <Card
                  className={cn(
                    "rounded-2xl p-5 transition-colors",
                    editMode ? "border-primary/40 bg-primary/5 hover:border-primary" : "hover:border-primary/40",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="font-display text-lg font-bold">{r.name}</div>
                        {r.is_fixed && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                            Fixed
                          </span>
                        )}
                        {prefsActive && recipeMatches.get(r.id) && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent dark:text-emerald-400">
                            <Check className="h-3 w-3" /> matches your prefs
                          </span>
                        )}
                      </div>
                      {r.description && <div className="mt-0.5 text-xs text-muted-foreground">{r.description}</div>}
                      <div className="mt-2 text-xs text-muted-foreground">
                        {r.recipe_ingredients.length} ingredients · {Math.round(total)}g batch
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {Math.round(kcal)} kcal · P {Math.round(protein)} · C {Math.round(carbs)} · F {Math.round(fat)}
                      </div>
                    </div>
                    {editMode ? (
                      <Pencil className="h-4 w-4 shrink-0 text-primary" />
                    ) : (
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setPicking(r);
                        }}
                        className="shrink-0 rounded-xl bg-accent text-accent-foreground hover:bg-accent/90"
                      >
                        <Plus className="mr-1 h-4 w-4" /> Add to plan
                      </Button>
                    )}
                  </div>
                </Card>
              );

              return editMode ? (
                <Link key={r.id} to={`/recipes/${r.id}/edit`} className="block">
                  {cardInner}
                </Link>
              ) : (
                <div key={r.id}>{cardInner}</div>
              );
            })}
          </div>
            )}
          </>
        )}
      </div>

      <Dialog open={!!picking} onOpenChange={(o) => !o && setPicking(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add {picking?.name}</DialogTitle>
            <DialogDescription>Pick a slot — we'll auto-scale to fit your remaining macros.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {SLOTS.map((s) => {
              const taken = usedSlots.has(s);
              return (
                <Button
                  key={s}
                  variant="outline"
                  disabled={busy}
                  onClick={() => picking && addRecipeToSlot(picking, s)}
                  className="h-auto justify-start rounded-xl py-3"
                >
                  <div className="text-left">
                    <div className="font-semibold">{s}</div>
                    {taken && <div className="text-[10px] text-muted-foreground">Already filled</div>}
                  </div>
                </Button>
              );
            })}
          </div>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => picking && addRecipeToSlot(picking, "__extra__")}
            className="w-full"
          >
            <Plus className="mr-1 h-4 w-4" /> Add as extra
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
