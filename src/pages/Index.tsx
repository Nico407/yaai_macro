import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
import { useProfile } from "@/hooks/useProfile";
import { useTodayLogs, type MealLog } from "@/hooks/useTodayLogs";
import { useIngredients } from "@/hooks/useIngredients";
import { useRecipes, type RecipeRow } from "@/hooks/useRecipes";
import { useAllCookbookRecipes } from "@/hooks/useAllCookbookRecipes";
import type { CookbookRecipe } from "@/hooks/useCookbookRecipes";
import { sumMacros, remaining as calcRemaining } from "@/lib/macros";
import { balancedGramsForShare, clampGrams, ingredientBreakdown, macrosFor, recipePerGram, type PerGram, fitRecipe, rescaledLog, cookbookPerGram, cookbookServing, isFixedMeal, mealPortion, portionLimits, servingGrams } from "@/lib/scaling";
import { MacroRing } from "@/components/MacroRing";
import { supabase } from "@/integrations/supabase/client";
import { localDateISO } from "@/lib/dates";
import { NO_FILTER, RecipeFilterBar, passes, useRecipeFacets, type RecipeFilter } from "@/components/RecipeFilters";
import { toast } from "sonner";
import { Loader2, Sparkles, Carrot, Plus, Minus, Check, ChevronDown, Trash2, Search, Star } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { RecipePhoto } from "@/components/RecipePhoto";
import { useRecipePhotos } from "@/hooks/useRecipePhotos";

const SLOTS = ["Breakfast", "Lunch", "Dinner", "Snack"] as const;
const slotName = (s: string | null) => (!s || s === "__extra__" ? "extras" : s);
type Slot = (typeof SLOTS)[number];

export default function Index() {
  const qc = useQueryClient();
  const { data: profile, isLoading } = useProfile();
  const { data: logs = [] } = useTodayLogs();
  const { data: allIngredients = [] } = useIngredients();
  const { data: recipes = [] } = useRecipes();
  const fixedRecipeIds = useMemo(() => new Set(recipes.filter((r) => r.is_fixed).map((r) => r.id)), [recipes]);
  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);
  // how far a planned meal may be rescaled: a batch-cooked soup stays within 0.5-1.5 servings, etc.
  const limitsOf = (l: MealLog) => {
    const r = l.recipe_id ? recipeById.get(l.recipe_id) : undefined;
    return r ? portionLimits(r) : undefined;
  };
  const { data: cookbookAll = [] } = useAllCookbookRecipes();
  const pickFacets = useRecipeFacets(recipes, cookbookAll);

  const [editing, setEditing] = useState<MealLog | null>(null);

  const [pickerSlot, setPickerSlot] = useState<Slot | null>(null);
  const { data: photos } = useRecipePhotos();
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickFilter, setPickFilter] = useState<RecipeFilter>(NO_FILTER);
  const [pickFav, setPickFav] = useState(false);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  // the menu bar's star opens the favourites here (?favorites=1)
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (params.get("favorites")) {
      setFavoritesOpen(true);
      setParams({}, { replace: true });
    }
  }, [params, setParams]);
  const [favoritesQuery, setFavoritesQuery] = useState("");
  const [togglingFav, setTogglingFav] = useState<string | null>(null);

  async function toggleFavorite(r: RecipeRow) {
    setTogglingFav(r.id);
    const { error } = await supabase
      .from("recipes")
      .update({ is_favorite: !r.is_favorite })
      .eq("id", r.id);
    setTogglingFav(null);
    if (error) {
      toast.error("Couldn't update favorite", { description: error.message });
      return;
    }
    await qc.invalidateQueries({ queryKey: ["recipes"] });
    toast.success(r.is_favorite ? "Removed from favorites" : "Added to favorites");
  }

  async function deleteLog(id: string) {
    setDeleting(true);
    const { error } = await supabase.from("meal_logs").delete().eq("id", id);
    setDeleting(false);
    if (error) {
      toast.error("Couldn't remove", { description: error.message });
      return;
    }
    setEditing(null);
    await qc.invalidateQueries({ queryKey: ["meal_logs"] });
    toast.success("Meal removed");
  }

  /** Quick edit from the meal's card: a new amount (macros and ingredient grams scale with it) and/or another slot. */
  async function updateLog(log: MealLog, patch: { grams?: number; slot?: string | null }) {
    const update: Record<string, unknown> = {};
    if (patch.grams && patch.grams !== Number(log.total_grams)) {
      const f = patch.grams / Number(log.total_grams || patch.grams);
      update.total_grams = Math.round(patch.grams);
      update.kcal = Math.round(Number(log.kcal) * f);
      update.protein_g = Math.round(Number(log.protein_g) * f * 10) / 10;
      update.carbs_g = Math.round(Number(log.carbs_g) * f * 10) / 10;
      update.fat_g = Math.round(Number(log.fat_g) * f * 10) / 10;
      if (Array.isArray(log.ingredients_json)) {
        update.ingredients_json = (log.ingredients_json as Array<{ grams: number }>).map((i) => ({ ...i, grams: Math.round(Number(i.grams) * f) }));
      }
      if (log.servings != null) update.servings = Math.round(Number(log.servings) * f * 100) / 100;
      if (log.portion_g != null) update.portion_g = Math.round(Number(log.portion_g) * f);
    }
    if (patch.slot !== undefined && patch.slot !== log.slot) update.slot = patch.slot;
    if (!Object.keys(update).length) return;
    const { error } = await supabase.from("meal_logs").update(update as never).eq("id", log.id);
    if (error) {
      toast.error("Couldn't save", { description: error.message });
      return;
    }
    await qc.invalidateQueries({ queryKey: ["meal_logs"] });
  }

  // fibre and salt of today's meals, from their saved ingredient grams (only ingredients that have the data)
  const extra = useMemo(() => {
    const byId = new Map(allIngredients.map((i) => [i.id, i]));
    let fibre = 0, salt = 0, known = 0, weighed = 0;
    for (const l of logs) {
      for (const it of (Array.isArray(l.ingredients_json) ? l.ingredients_json : []) as { ingredient_id?: string; grams?: number }[]) {
        const g = Number(it.grams);
        if (!it.ingredient_id || !(g > 0)) continue;
        weighed += 1;
        const ing = byId.get(it.ingredient_id);
        if (!ing || ing.fibre_per_100g == null || ing.salt_per_100g == null) continue;
        known += 1;
        fibre += (Number(ing.fibre_per_100g) * g) / 100;
        salt += (Number(ing.salt_per_100g) * g) / 100;
      }
    }
    return { fibre, salt, known, weighed };
  }, [logs, allIngredients]);

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

  const target = useMemo(
    () =>
      profile && profile.target_calories
        ? {
            kcal: Number(profile.target_calories),
            protein_g: Number(profile.target_protein_g ?? 0),
            carbs_g: Number(profile.target_carbs_g ?? 0),
            fat_g: Number(profile.target_fat_g ?? 0),
          }
        : null,
    [profile],
  );

  // Group logs by slot, oldest first: the first meal of each slot fills its card, every further meal (a second lunch,
  // snacks, extras without a slot) gets a card of its own after the four
  const slotLogs = useMemo(() => {
    const map: Record<string, MealLog[]> = {};
    [...logs].reverse().forEach((l) => {
      if (l.slot && SLOTS.includes(l.slot as Slot)) (map[l.slot] ??= []).push(l);
    });
    return map;
  }, [logs]);
  const extraLogs = useMemo(() => {
    const firsts = new Set(SLOTS.map((sl) => slotLogs[sl]?.[0]?.id).filter(Boolean));
    return [...logs].reverse().filter((l) => !firsts.has(l.id));
  }, [logs, slotLogs]);

  const emptySlots = SLOTS.filter((s) => !slotLogs[s]?.length).length;

  // Picking a recipe closes the picker straight away; adding (and rescaling the other meals) runs behind a small
  // "Adding…" note. Before, the picker stayed open with every recipe greyed out until the database answered, and an
  // unexpected error left it like that for good.
  async function pick(run: () => Promise<void>) {
    if (adding) return;
    closePicker();
    const note = toast.loading("Adding…");
    try {
      // a request that never answers must not block the next add
      await Promise.race([run(), new Promise((_, no) => setTimeout(() => no(new Error("No answer from the database, try again")), 20000))]);
    } catch (e) {
      toast.error("Couldn't add", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      toast.dismiss(note);
      setAdding(false);
    }
  }
  function closePicker() {
    setPickerSlot(null);
    setPickerQuery("");
    setPickFilter(NO_FILTER);
    setPickFav(false);
  }

  async function addRecipeToSlot(recipe: RecipeRow) {
    if (!pickerSlot || !target) return;
    const perGram = recipePerGram(recipe);
    if (!perGram.kcal) {
      toast.error("Recipe has no calories");
      return;
    }

    const isFixed = !!recipe.is_fixed;

    // Fixed meals are not scaled — use the recipe's default batch size
    const fixedLogs = logs.filter((l) => isFixedMeal(l, fixedRecipeIds));
    const scalableLogs = logs.filter((l) => !isFixedMeal(l, fixedRecipeIds));

    // Subtract fixed meals from the daily target, then split the rest evenly
    const fixedConsumed = {
      kcal: fixedLogs.reduce((s, l) => s + Number(l.kcal), 0) +
        (isFixed ? perGram.kcal * servingGrams(recipe) : 0),
      protein_g: fixedLogs.reduce((s, l) => s + Number(l.protein_g), 0) +
        (isFixed ? perGram.protein_g * servingGrams(recipe) : 0),
      carbs_g: fixedLogs.reduce((s, l) => s + Number(l.carbs_g), 0) +
        (isFixed ? perGram.carbs_g * servingGrams(recipe) : 0),
      fat_g: fixedLogs.reduce((s, l) => s + Number(l.fat_g), 0) +
        (isFixed ? perGram.fat_g * servingGrams(recipe) : 0),
    };
    const scalableCount = scalableLogs.length + (isFixed ? 0 : 1);
    const share = {
      kcal: Math.max(0, target.kcal - fixedConsumed.kcal) / Math.max(1, scalableCount),
      protein_g: Math.max(0, target.protein_g - fixedConsumed.protein_g) / Math.max(1, scalableCount),
      carbs_g: Math.max(0, target.carbs_g - fixedConsumed.carbs_g) / Math.max(1, scalableCount),
      fat_g: Math.max(0, target.fat_g - fixedConsumed.fat_g) / Math.max(1, scalableCount),
    };

    // fixed meals are always one serving; others get fitted to this meal's share (see fitRecipe)
    const fitted = isFixed ? null : fitRecipe(recipe, share);
    const grams = fitted ? fitted.grams : servingGrams(recipe);
    // in servings and plate grams, for recipes that have servings, are batch cooked or have a cooked weight
    const portion = mealPortion(recipe, grams);
    const totals = fitted ? fitted.totals : macrosFor(perGram, grams);
    const breakdown = fitted ? fitted.breakdown : ingredientBreakdown(recipe, grams);

    setAdding(true);

    // Rescale only non-fixed existing meals to their balanced share
    if (scalableCount > 0) {
      // the whole portion of each moves to the new share, with its saved ingredient grams (all at once, not one by one)
      const results = await Promise.all(scalableLogs.map((l) => {
        const update = rescaledLog(l, share, limitsOf(l));
        return update ? supabase.from("meal_logs").update(update as never).eq("id", l.id) : Promise.resolve({ error: null });
      }));
      const upErr = results.find((r) => r.error)?.error;
      if (upErr) {
        setAdding(false);
        toast.error("Couldn't rescale meals", { description: upErr.message });
        return;
      }
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setAdding(false); toast.error("Sign in required"); return; }
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
      slot: pickerSlot === ("__extra__" as Slot) ? null : pickerSlot,
      is_fixed: isFixed,
      ...portion,
      instructions: recipe.instructions ?? null,
      ingredients_json: [
        ...breakdown.map((b) => ({
          ingredient_id: b.ingredient_id,
          name: b.name,
          grams: Math.round(b.grams),
        })),
        // salt, pepper…: listed, not weighed
        ...(recipe.extra_ingredients ?? []).map((name) => ({ name, grams: 0 })),
      ],
    });
    setAdding(false);
    if (error) {
      toast.error("Couldn't add", { description: error.message });
      return;
    }
    setPickerSlot(null);
    await qc.invalidateQueries({ queryKey: ["meal_logs"] });
    toast.success(`${recipe.name} added to ${slotName(pickerSlot)}`);
  }

  async function addCookbookToSlot(item: CookbookRecipe) {
    if (!pickerSlot) return;
    // the cook book's macros are per serving: per gram is macros / serving weight (not / 100)
    const perGram: PerGram = cookbookPerGram(item);
    let grams = cookbookServing(item);
    let share = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
    if (target) {
      const scalableLogs = logs.filter((l) => !isFixedMeal(l, fixedRecipeIds));
      const fixedLogs = logs.filter((l) => isFixedMeal(l, fixedRecipeIds));
      const fixedConsumed = {
        kcal: fixedLogs.reduce((s, l) => s + Number(l.kcal), 0),
        protein_g: fixedLogs.reduce((s, l) => s + Number(l.protein_g), 0),
        carbs_g: fixedLogs.reduce((s, l) => s + Number(l.carbs_g), 0),
        fat_g: fixedLogs.reduce((s, l) => s + Number(l.fat_g), 0),
      };
      const denom = Math.max(1, scalableLogs.length + 1);
      share = {
        kcal: Math.max(0, target.kcal - fixedConsumed.kcal) / denom,
        protein_g: Math.max(0, target.protein_g - fixedConsumed.protein_g) / denom,
        carbs_g: Math.max(0, target.carbs_g - fixedConsumed.carbs_g) / denom,
        fat_g: Math.max(0, target.fat_g - fixedConsumed.fat_g) / denom,
      };
      const raw = balancedGramsForShare(perGram, share);
      grams = clampGrams(raw || cookbookServing(item), 30, 5000);
    }

    setAdding(true);
    if (target) {
      const scalableLogs = logs.filter((l) => !isFixedMeal(l, fixedRecipeIds));
      // the whole portion of each moves to the new share, with its saved ingredient grams (all at once, not one by one)
      const results = await Promise.all(scalableLogs.map((l) => {
        const update = rescaledLog(l, share, limitsOf(l));
        return update ? supabase.from("meal_logs").update(update as never).eq("id", l.id) : Promise.resolve({ error: null });
      }));
      const upErr = results.find((r) => r.error)?.error;
      if (upErr) {
        setAdding(false);
        toast.error("Couldn't rescale meals", { description: upErr.message });
        return;
      }
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setAdding(false); toast.error("Sign in required"); return; }
    const { error } = await supabase.from("meal_logs").insert({
      user_id: user.id,
      recipe_id: null,
      recipe_name: item.name,
      total_grams: Math.round(grams),
      kcal: Math.round(perGram.kcal * grams),
      protein_g: Math.round(perGram.protein_g * grams * 10) / 10,
      carbs_g: Math.round(perGram.carbs_g * grams * 10) / 10,
      fat_g: Math.round(perGram.fat_g * grams * 10) / 10,
      slot: pickerSlot === ("__extra__" as Slot) ? null : pickerSlot,
      instructions: item.instructions?.length ? item.instructions.map((s, i) => `${i + 1}. ${s}`).join("\n") : null,
      ingredients_json: item.ingredients.map((name) => ({ name, grams: 0 })),
    });
    setAdding(false);
    if (error) {
      toast.error("Couldn't add", { description: error.message });
      return;
    }
    setPickerSlot(null);
    await qc.invalidateQueries({ queryKey: ["meal_logs"] });
    toast.success(`${item.name} added to ${slotName(pickerSlot)}`);
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!profile || !profile.target_calories || !target) {
    return <Welcome />;
  }

  const left = calcRemaining(target, consumed);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-5 md:py-12">

        <Card className="rounded-2xl p-4 shadow-soft md:p-8">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
            <MacroRing consumed={consumed.kcal} target={target.kcal} label="Calories" unit="kcal" colorVar="--macro-calories" />
            <MacroRing consumed={consumed.protein_g} target={target.protein_g} label="Protein" unit="g" colorVar="--macro-protein" />
            <MacroRing consumed={consumed.carbs_g} target={target.carbs_g} label="Carbs" unit="g" colorVar="--macro-carbs" />
            <MacroRing consumed={consumed.fat_g} target={target.fat_g} label="Fat" unit="g" colorVar="--macro-fat" />
          </div>
          {extra.weighed > 0 && (
            <p className="mt-3 text-center text-xs text-muted-foreground" title="Recommended: at least 30 g fibre, at most 5 g salt a day">
              Fibre <span className="font-semibold text-foreground tabular-nums">{extra.fibre.toFixed(1)} g</span>
              <span className="opacity-60"> / 30</span> · Salt{" "}
              <span className={`font-semibold tabular-nums ${extra.salt > 5 ? "text-destructive" : "text-foreground"}`}>{extra.salt.toFixed(1)} g</span>
              <span className="opacity-60"> / 5</span>
              {extra.known < extra.weighed && <span className="opacity-60"> · {extra.weighed - extra.known} ingredients without data</span>}
            </p>
          )}
        </Card>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 md:mt-8 md:gap-4">
          <Link to="/plan">
            <ActionCard icon={<Sparkles className="h-5 w-5" />} title="Plan my meals" desc="Your recipes, by base, protein, country and lifestyle." />
          </Link>
          <Link to="/ingredients">
            <ActionCard icon={<Carrot className="h-5 w-5" />} title="Ingredients" desc="Manage your pantry." />
          </Link>
        </div>

        {/* Today's plan */}
        <section className="mt-5 md:mt-8">
          <div className="mb-2 flex items-end justify-between md:mb-3">
            <h2 className="font-display text-lg font-bold md:text-xl">Today's plan</h2>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 md:gap-3">
            {SLOTS.map((slot) => {
              const log = (slotLogs[slot] ?? [])[0];
              if (log) return <MealCard photo={photos?.get(log.recipe_id ?? "")} key={slot} label={slot} log={log} open={editing?.id === log.id}
                onToggle={() => setEditing(editing?.id === log.id ? null : log)} onDelete={() => deleteLog(log.id)}
                onSave={(p) => updateLog(log, p)} busy={deleting} />;
              return (
                <Card
                  key={slot}
                  role="button"
                  tabIndex={0}
                  onClick={() => setPickerSlot(slot)}
                  className="flex cursor-pointer items-center justify-between rounded-2xl border-dashed p-3 text-muted-foreground transition-colors hover:bg-accent/40 md:p-4"
                >
                  <div>
                    <div className="text-[10px] uppercase tracking-wider">{slot}</div>
                    <div className="mt-0.5 text-sm">Add a meal</div>
                  </div>
                  <Plus className="h-5 w-5" />
                </Card>
              );
            })}
            {/* more meals (a second lunch, snacks, extras): each its own card, same size as the others */}
            {extraLogs.map((log) => (
              <MealCard photo={photos?.get(log.recipe_id ?? "")} key={log.id} label={log.slot && SLOTS.includes(log.slot as Slot) ? log.slot : "Extra"} log={log}
                open={editing?.id === log.id} onToggle={() => setEditing(editing?.id === log.id ? null : log)}
                onDelete={() => deleteLog(log.id)} onSave={(p) => updateLog(log, p)} busy={deleting} />
            ))}
          </div>
          <Button
            variant="outline"
            className="mt-3 w-full rounded-xl border-dashed"
            onClick={() => setPickerSlot("__extra__" as Slot)}
          >
            <Plus className="mr-1 h-4 w-4" /> Add more
          </Button>
        </section>
      </div>

      {/* Slot picker dialog */}
      <Dialog
        open={!!pickerSlot}
        onOpenChange={(o) => {
          if (!o) {
            setPickerSlot(null);
            setPickerQuery("");
            setPickFilter(NO_FILTER);
            setPickFav(false);
          }
        }}
      >
        <DialogContent className="flex max-h-[90vh] max-w-lg flex-col">
          <DialogHeader>
            <DialogTitle>{pickerSlot === ("__extra__" as Slot) ? "Add extra" : `Add to ${pickerSlot}`}</DialogTitle>
            <DialogDescription>
              Pick a recipe — we'll auto-scale it to fit your remaining macros.
            </DialogDescription>
          </DialogHeader>

          <RecipeFilterBar query={pickerQuery} onQuery={setPickerQuery} filter={pickFilter}
            onFilter={(k, v) => setPickFilter((f) => ({ ...f, [k]: v }))} countries={pickFacets.countries}
            favoritesOnly={pickFav} onFavoritesOnly={setPickFav}
            onClear={() => { setPickerQuery(""); setPickFilter(NO_FILTER); setPickFav(false); }} />
          {(() => {
            const ownList = recipes.filter((r) => (!pickFav || r.is_favorite)
              && passes(pickFacets.ownFacets.get(r.id), r.name, r.description, pickFilter, pickerQuery));
            const cbList = cookbookAll.filter((r) => (!pickFav || r.is_favorite)
              && passes(pickFacets.cbFacets.get(r.id), r.name, r.description, pickFilter, pickerQuery));
            if (!ownList.length && !cbList.length) {
              return <p className="py-6 text-center text-sm text-muted-foreground">No recipes match.</p>;
            }
            return (
              <div className="-mx-1 flex-1 space-y-2 overflow-y-auto px-1 pt-1">
                {ownList.map((r) => (
                  <button key={`r-${r.id}`} onClick={() => { void pick(() => addRecipeToSlot(r)); }} disabled={adding}
                    className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:bg-accent/20 disabled:opacity-50">
                    <RecipePhoto src={photos?.get(r.id)} alt={r.name} className="h-12 w-12" iconClassName="h-4 w-4" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-semibold">{r.name}</span>
                        {r.is_favorite && <Star className="h-3.5 w-3.5 shrink-0 fill-yellow-400 text-yellow-400" />}
                        <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">Your recipe</span>
                      </div>
                      {r.description && <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{r.description}</div>}
                    </div>
                  </button>
                ))}
                {cbList.map((r) => (
                  <button key={`c-${r.id}`} onClick={() => { void pick(() => addCookbookToSlot(r)); }} disabled={adding}
                    className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:bg-accent/20 disabled:opacity-50">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-semibold">{r.name}</span>
                        {r.is_favorite && <Star className="h-3.5 w-3.5 shrink-0 fill-yellow-400 text-yellow-400" />}
                        <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">{r.country ?? "Cook book"}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{r.kcal} kcal · P {r.protein_g} · C {r.carbs_g} · F {r.fat_g}</div>
                    </div>
                    {r.image_url && <img src={r.image_url} alt={r.name} className="h-14 w-14 shrink-0 rounded-lg object-cover" loading="lazy" />}
                  </button>
                ))}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>


      {/* Favorites dialog */}
      <Dialog
        open={favoritesOpen}
        onOpenChange={(o) => {
          if (!o) {
            setFavoritesOpen(false);
            setFavoritesQuery("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Favorite dishes</DialogTitle>
            <DialogDescription>
              Star the recipes you love so they're easy to find.
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={favoritesQuery}
              onChange={(e) => setFavoritesQuery(e.target.value)}
              placeholder="Search recipes…"
              className="pl-9"
            />
          </div>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {(() => {
              const q = favoritesQuery.trim().toLowerCase();
              const favs = recipes.filter((r) => r.is_favorite);
              const others = recipes.filter((r) => !r.is_favorite);
              const filterFn = (r: RecipeRow) =>
                !q ||
                r.name.toLowerCase().includes(q) ||
                (r.description ?? "").toLowerCase().includes(q);
              const list = [...favs, ...others].filter(filterFn);
              if (list.length === 0) {
                return (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No recipes found.
                  </p>
                );
              }
              return list.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"
                >
                  <div className="min-w-0">
                    <div className="font-semibold">{r.name}</div>
                    {r.description && (
                      <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                        {r.description}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleFavorite(r)}
                    disabled={togglingFav === r.id}
                    aria-label={r.is_favorite ? "Unfavorite" : "Favorite"}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
                  >
                    <Star
                      className="h-5 w-5"
                      fill={r.is_favorite ? "currentColor" : "none"}
                    />
                  </button>
                </div>
              ));
            })()}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ActionCard({
  icon,
  title,
  desc,
  tag,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  tag?: string;
  disabled?: boolean;
}) {
  return (
    <Card className={`flex h-full flex-col rounded-2xl p-3 md:p-5 ${disabled ? "opacity-60" : ""}`}>
      <div className="mb-1 flex min-h-[3rem] items-start gap-2 text-primary md:mb-2 md:min-h-0">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <h3 className="font-display text-base font-bold leading-tight md:text-lg">{title}</h3>
      </div>
      <p className="text-xs text-muted-foreground md:text-sm">{desc}</p>
      {tag && (
        <span className="mt-3 inline-block rounded-full bg-secondary px-2 py-0.5 text-[10px] uppercase tracking-wider">
          {tag}
        </span>
      )}
    </Card>
  );
}

function Welcome() {
  return (
    <div className="min-h-screen bg-gradient-hero">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-4 py-16 text-foreground">
        <p className="mb-3 text-sm uppercase tracking-[0.25em] opacity-80">Macro</p>
        <h1 className="font-display text-5xl font-bold leading-[1.05] md:text-6xl">
          Eat what you want.<br />
          <span className="opacity-80">Hit your numbers.</span>
        </h1>
        <p className="mt-5 max-w-md text-lg opacity-85">
          Pick any meal — we'll scale the ingredients so it fits the macros you've got left for the day.
        </p>
        <div className="mt-8">
          <Button asChild size="lg" variant="secondary" className="rounded-full px-8">
            <Link to="/onboarding">Get started</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

/** One meal of today's plan. Click to open it in place: ingredients, how to prep, and quick edits (amount, slot,
 *  remove). An open card takes the full row, so its neighbour keeps its size. */
const fmtServings = (n: number) => `${+n.toFixed(2)} serving${n === 1 ? "" : "s"}`;

function MealCard({ label, log, photo, open, onToggle, onDelete, onSave, busy }: {
  label: string; log: MealLog; photo?: string; open: boolean; onToggle: () => void; onDelete: () => void;
  onSave: (p: { grams?: number; slot?: string | null }) => Promise<void>; busy: boolean;
}) {
  // meals of recipes with servings (batch soups…) are edited in servings, others in grams
  const inServings = log.servings != null && Number(log.servings) > 0;
  const current = inServings ? String(Number(log.servings)) : String(Math.round(Number(log.total_grams)));
  const [grams, setGrams] = useState(current);
  const [saving, setSaving] = useState(false);
  useEffect(() => setGrams(current), [current, open]);
  const step = inServings ? 0.25 : 10;
  const toRawGrams = (v: number) => (inServings ? (v / Number(log.servings)) * Number(log.total_grams) : v);
  const ings = Array.isArray(log.ingredients_json) ? (log.ingredients_json as Array<{ name: string; grams: number }>) : [];
  const steps = (log.instructions ?? "").split(/\r?\n/).map((x) => x.replace(/^\s*\d+[.)]\s*/, "").trim()).filter(Boolean);
  const save = async (p: { grams?: number; slot?: string | null }) => {
    setSaving(true);
    await onSave(p);
    setSaving(false);
  };
  const g = Number(grams);
  return (
    <Card className={`overflow-hidden rounded-2xl transition-colors ${open ? "sm:col-span-2 border-primary/50" : "hover:bg-accent/40"}`}>
      <div role="button" tabIndex={0} aria-expanded={open} onClick={onToggle}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
        className="flex cursor-pointer items-start gap-2 p-3 md:p-4">
        {photo && <img src={photo} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" loading="lazy" />}
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="mt-0.5 truncate font-semibold">{log.recipe_name}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {inServings
              ? <>{fmtServings(Number(log.servings))} · {Math.round(Number(log.portion_g ?? log.total_grams))} g</>
              : <>{Math.round(Number(log.total_grams))}g</>} · {Math.round(Number(log.kcal))} kcal · P{" "}
            {Math.round(Number(log.protein_g))} · C {Math.round(Number(log.carbs_g))} · F{" "}
            {Math.round(Number(log.fat_g))}
          </div>
        </div>
        <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </div>

      {open && (
        <div className="space-y-4 border-t border-border/70 px-3 pb-3 pt-3 text-sm md:px-4 md:pb-4">
          {/* quick edits */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <Button size="icon" variant="outline" className="h-8 w-8 rounded-lg" disabled={saving || g <= step}
                onClick={() => setGrams(String(Math.max(step, +(g - step).toFixed(2))))} aria-label={inServings ? "Less" : "10 g less"}><Minus className="h-3.5 w-3.5" /></Button>
              <Input inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value.replace(",", ".").replace(/[^0-9.]/g, ""))}
                className="h-8 w-20 text-center tabular-nums" aria-label={inServings ? "Servings" : "Amount in grams"} />
              <Button size="icon" variant="outline" className="h-8 w-8 rounded-lg" disabled={saving}
                onClick={() => setGrams(String(+(g + step).toFixed(2)))} aria-label={inServings ? "More" : "10 g more"}><Plus className="h-3.5 w-3.5" /></Button>
              <span className="text-xs text-muted-foreground">{inServings ? "servings" : "g"}</span>
              {g > 0 && String(g) !== current && (
                <Button size="sm" className="h-8 rounded-lg" disabled={saving} onClick={() => save({ grams: toRawGrams(g) })}>
                  <Check className="mr-1 h-3.5 w-3.5" /> Save
                </Button>
              )}
            </div>
            <Select value={log.slot ?? "__extra__"} onValueChange={(v) => save({ slot: v === "__extra__" ? null : v })}>
              <SelectTrigger className="h-8 w-32 rounded-lg text-xs" aria-label="Move to"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SLOTS.map((sl) => <SelectItem key={sl} value={sl}>{sl}</SelectItem>)}
                <SelectItem value="__extra__">Extra</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="ghost" className="ml-auto h-8 rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={busy} onClick={onDelete}>
              <Trash2 className="mr-1 h-3.5 w-3.5" /> {busy ? "Removing…" : "Remove"}
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <section>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ingredients</h3>
              {ings.length === 0 ? (
                <p className="text-muted-foreground">No ingredient breakdown saved.</p>
              ) : (
                <ul className="divide-y divide-border rounded-xl border">
                  {ings.map((i, idx) => (
                    <li key={idx} className="flex items-center justify-between px-3 py-1.5">
                      <span>{i.name}</span>
                      <span className="tabular-nums text-muted-foreground">{Number(i.grams) > 0 ? `${Math.round(Number(i.grams))} g` : "to taste"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">How to prep</h3>
              {steps.length === 0 ? (
                <p className="text-muted-foreground">No instructions yet.</p>
              ) : (
                <ol className="list-decimal space-y-1 pl-5">{steps.map((x, idx) => <li key={idx}>{x}</li>)}</ol>
              )}
            </section>
          </div>
        </div>
      )}
    </Card>
  );
}
