import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { addWeeks, endOfWeek, format, startOfWeek, addDays, isSameDay } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useProfile } from "@/hooks/useProfile";
import { useRecipes, type RecipeRow } from "@/hooks/useRecipes";
import { useAllCookbookRecipes } from "@/hooks/useAllCookbookRecipes";
import type { CookbookRecipe } from "@/hooks/useCookbookRecipes";
import { usePlannedMeals, type PlannedMeal } from "@/hooks/usePlannedMeals";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  balancedGramsForShare,
  clampGrams,
  ingredientBreakdown,
  macrosFor,
  recipePerGram,
  type PerGram,
} from "@/lib/scaling";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Search,
  Trash2,
  ClipboardList,
  ArrowLeft,
  CheckCheck,
} from "lucide-react";

const SLOTS = ["Breakfast", "Lunch", "Dinner", "Snack"] as const;
type Slot = (typeof SLOTS)[number];

type Macros = { kcal: number; protein_g: number; carbs_g: number; fat_g: number };

export default function Planner() {
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const { data: recipes = [] } = useRecipes();
  const { data: cookbook = [] } = useAllCookbookRecipes();

  const [weekOffset, setWeekOffset] = useState(0);
  const [picker, setPicker] = useState<{ date: string; slot: Slot | null } | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const weekStart = useMemo(
    () => startOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 }),
    [weekOffset],
  );
  const weekEnd = useMemo(() => endOfWeek(weekStart, { weekStartsOn: 1 }), [weekStart]);
  const startKey = format(weekStart, "yyyy-MM-dd");
  const endKey = format(weekEnd, "yyyy-MM-dd");

  const { data: planned = [], isLoading } = usePlannedMeals(startKey, endKey);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const target: Macros | null = useMemo(
    () =>
      profile?.target_calories
        ? {
            kcal: Number(profile.target_calories),
            protein_g: Number(profile.target_protein_g ?? 0),
            carbs_g: Number(profile.target_carbs_g ?? 0),
            fat_g: Number(profile.target_fat_g ?? 0),
          }
        : null,
    [profile],
  );

  const byDay = useMemo(() => {
    const map: Record<string, PlannedMeal[]> = {};
    planned.forEach((p) => {
      map[p.plan_date] = map[p.plan_date] ?? [];
      map[p.plan_date].push(p);
    });
    return map;
  }, [planned]);

  function dayTotals(date: string): Macros {
    return (byDay[date] ?? []).reduce<Macros>(
      (acc, p) => ({
        kcal: acc.kcal + Number(p.kcal),
        protein_g: acc.protein_g + Number(p.protein_g),
        carbs_g: acc.carbs_g + Number(p.carbs_g),
        fat_g: acc.fat_g + Number(p.fat_g),
      }),
      { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
    );
  }

  /** Rescale all non-fixed planned meals of a day to an equal balanced share. */
  async function rebalanceDay(date: string, extra: PlannedMeal[] = [], skipIds: string[] = []) {
    if (!target) return;
    const existing = (byDay[date] ?? []).filter((p) => !skipIds.includes(p.id));
    const all = [...existing, ...extra];
    const fixed = all.filter((p) => p.is_fixed);
    const scalable = all.filter((p) => !p.is_fixed && !!p.id);
    const fixedSum = fixed.reduce<Macros>(
      (a, p) => ({
        kcal: a.kcal + Number(p.kcal),
        protein_g: a.protein_g + Number(p.protein_g),
        carbs_g: a.carbs_g + Number(p.carbs_g),
        fat_g: a.fat_g + Number(p.fat_g),
      }),
      { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
    );
    const denom = Math.max(1, scalable.length);
    const share: Macros = {
      kcal: Math.max(0, target.kcal - fixedSum.kcal) / denom,
      protein_g: Math.max(0, target.protein_g - fixedSum.protein_g) / denom,
      carbs_g: Math.max(0, target.carbs_g - fixedSum.carbs_g) / denom,
      fat_g: Math.max(0, target.fat_g - fixedSum.fat_g) / denom,
    };
    for (const p of scalable) {
      const oldGrams = Number(p.total_grams);
      const oldKcal = Number(p.kcal);
      if (!oldGrams || !oldKcal) continue;
      const perGram: PerGram = {
        kcal: oldKcal / oldGrams,
        protein_g: Number(p.protein_g) / oldGrams,
        carbs_g: Number(p.carbs_g) / oldGrams,
        fat_g: Number(p.fat_g) / oldGrams,
      };
      const newGrams = clampGrams(balancedGramsForShare(perGram, share) || oldGrams, 30, 5000);
      const f = newGrams / oldGrams;
      const { error } = await supabase
        .from("planned_meals")
        .update({
          total_grams: Math.round(newGrams),
          kcal: Math.round(oldKcal * f),
          protein_g: Math.round(Number(p.protein_g) * f * 10) / 10,
          carbs_g: Math.round(Number(p.carbs_g) * f * 10) / 10,
          fat_g: Math.round(Number(p.fat_g) * f * 10) / 10,
        })
        .eq("id", p.id);
      if (error) throw error;
    }
  }

  async function addRecipe(recipe: RecipeRow) {
    if (!picker) return;
    const perGram = recipePerGram(recipe);
    if (!perGram.kcal) {
      toast.error("Recipe has no calories");
      return;
    }
    setBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in required");
      const grams = recipe.is_fixed ? Number(recipe.default_serving_g) : Number(recipe.default_serving_g);
      const totals = macrosFor(perGram, grams);
      const breakdown = ingredientBreakdown(recipe, grams);
      const { data, error } = await supabase
        .from("planned_meals")
        .insert({
          user_id: user.id,
          plan_date: picker.date,
          slot: picker.slot,
          recipe_id: recipe.id,
          recipe_name: recipe.name,
          total_grams: Math.round(grams),
          kcal: Math.round(totals.kcal),
          protein_g: Math.round(totals.protein_g * 10) / 10,
          carbs_g: Math.round(totals.carbs_g * 10) / 10,
          fat_g: Math.round(totals.fat_g * 10) / 10,
          is_fixed: !!recipe.is_fixed,
          instructions: recipe.instructions ?? null,
          ingredients_json: breakdown.map((b) => ({
            ingredient_id: b.ingredient_id,
            name: b.name,
            grams: Math.round(b.grams),
          })),
        })
        .select("*")
        .single();
      if (error) throw error;
      await rebalanceDay(picker.date, [data as unknown as PlannedMeal]);
      await qc.invalidateQueries({ queryKey: ["planned_meals"] });
      toast.success(`${recipe.name} planned for ${picker.slot ?? "extra"}`);
      setPicker(null);
      setQuery("");
    } catch (e) {
      toast.error("Couldn't plan meal", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function addCookbook(item: CookbookRecipe) {
    if (!picker) return;
    setBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in required");
      const perGram: PerGram = {
        kcal: item.kcal / 100,
        protein_g: item.protein_g / 100,
        carbs_g: item.carbs_g / 100,
        fat_g: item.fat_g / 100,
      };
      const grams = 100;
      const { data, error } = await supabase
        .from("planned_meals")
        .insert({
          user_id: user.id,
          plan_date: picker.date,
          slot: picker.slot,
          recipe_id: null,
          recipe_name: item.name,
          total_grams: grams,
          kcal: Math.round(perGram.kcal * grams),
          protein_g: Math.round(perGram.protein_g * grams * 10) / 10,
          carbs_g: Math.round(perGram.carbs_g * grams * 10) / 10,
          fat_g: Math.round(perGram.fat_g * grams * 10) / 10,
          is_fixed: false,
          instructions: item.instructions?.length
            ? item.instructions.map((s, i) => `${i + 1}. ${s}`).join("\n")
            : null,
          ingredients_json: item.ingredients.map((name) => ({ name, grams: 0 })),
        })
        .select("*")
        .single();
      if (error) throw error;
      await rebalanceDay(picker.date, [data as unknown as PlannedMeal]);
      await qc.invalidateQueries({ queryKey: ["planned_meals"] });
      toast.success(`${item.name} planned for ${picker.slot ?? "extra"}`);
      setPicker(null);
      setQuery("");
    } catch (e) {
      toast.error("Couldn't plan meal", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function removePlanned(p: PlannedMeal) {
    setBusy(true);
    try {
      const { error } = await supabase.from("planned_meals").delete().eq("id", p.id);
      if (error) throw error;
      await rebalanceDay(p.plan_date, [], [p.id]);
      await qc.invalidateQueries({ queryKey: ["planned_meals"] });
      toast.success("Removed from plan");
    } catch (e) {
      toast.error("Couldn't remove", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function logDay(date: string) {
    const items = byDay[date] ?? [];
    if (!items.length) return;
    setBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in required");
      const { error } = await supabase.from("meal_logs").insert(
        items.map((p) => ({
          user_id: user.id,
          recipe_id: p.recipe_id,
          recipe_name: p.recipe_name,
          total_grams: Math.round(Number(p.total_grams)),
          kcal: Math.round(Number(p.kcal)),
          protein_g: Number(p.protein_g),
          carbs_g: Number(p.carbs_g),
          fat_g: Number(p.fat_g),
          log_date: date,
          slot: p.slot,
          is_fixed: p.is_fixed,
          instructions: p.instructions,
          ingredients_json: (p.ingredients_json ?? []) as never,
        })),
      );
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["meal_logs"] });
      toast.success("Day logged");
    } catch (e) {
      toast.error("Couldn't log day", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function copyDayToNextWeek(date: string) {
    const items = byDay[date] ?? [];
    if (!items.length) return;
    const nextDate = format(addDays(new Date(date), 7), "yyyy-MM-dd");
    setBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in required");
      const { error } = await supabase.from("planned_meals").insert(
        items.map((p) => ({
          user_id: user.id,
          plan_date: nextDate,
          slot: p.slot,
          recipe_id: p.recipe_id,
          recipe_name: p.recipe_name,
          total_grams: p.total_grams,
          kcal: p.kcal,
          protein_g: p.protein_g,
          carbs_g: p.carbs_g,
          fat_g: p.fat_g,
          is_fixed: p.is_fixed,
          instructions: p.instructions,
          ingredients_json: (p.ingredients_json ?? []) as never,
        })),
      );
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["planned_meals"] });
      toast.success("Copied to next week");
    } catch (e) {
      toast.error("Couldn't copy", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const q = query.trim().toLowerCase();
  const myMatches = q ? recipes.filter((r) => r.name.toLowerCase().includes(q)) : recipes;
  const cookMatches = q ? cookbook.filter((c) => c.name.toLowerCase().includes(q)) : cookbook.slice(0, 20);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-5 md:py-10">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <Link
              to="/main"
              className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </Link>
            <h1 className="flex items-center gap-2 font-display text-2xl font-bold md:text-4xl">
              <ClipboardList className="h-6 w-6 text-primary" /> Planner
            </h1>
            <p className="text-xs text-muted-foreground md:text-sm">
              Plan your meals for the whole week ahead.
            </p>
          </div>
        </header>

        <Card className="mb-4 flex items-center justify-between gap-2 p-3">
          <Button variant="ghost" size="icon" onClick={() => setWeekOffset((w) => w - 1)} aria-label="Previous week">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-center">
            <p className="text-sm font-semibold">
              {format(weekStart, "dd MMM")} – {format(weekEnd, "dd MMM yyyy")}
            </p>
            <button
              type="button"
              onClick={() => setWeekOffset(0)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {weekOffset === 0 ? "This week" : "Jump to this week"}
            </button>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setWeekOffset((w) => w + 1)} aria-label="Next week">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </Card>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            {days.map((d) => {
              const dateKey = format(d, "yyyy-MM-dd");
              const items = byDay[dateKey] ?? [];
              const totals = dayTotals(dateKey);
              const isToday = isSameDay(d, new Date());
              return (
                <Card
                  key={dateKey}
                  className={`p-3 md:p-4 ${isToday ? "ring-1 ring-primary/40" : ""}`}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">
                        {format(d, "EEEE")}{" "}
                        <span className="text-xs font-normal text-muted-foreground">{format(d, "dd MMM")}</span>
                        {isToday && (
                          <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                            today
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {Math.round(totals.kcal)}
                        {target ? ` / ${Math.round(target.kcal)}` : ""} kcal · {Math.round(totals.protein_g)}P{" "}
                        {Math.round(totals.carbs_g)}C {Math.round(totals.fat_g)}F
                      </p>
                    </div>
                    {items.length > 0 && (
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button size="sm" variant="secondary" disabled={busy} onClick={() => logDay(dateKey)}>
                          <CheckCheck className="mr-1 h-3.5 w-3.5" /> Log day
                        </Button>
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => copyDayToNextWeek(dateKey)}>
                          Copy +1w
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    {SLOTS.map((slot) => {
                      const meal = items.find((p) => p.slot === slot);
                      return (
                        <div
                          key={slot}
                          className="flex items-center justify-between gap-2 rounded-lg bg-secondary/40 px-2.5 py-1.5"
                        >
                          <div className="min-w-0">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{slot}</p>
                            {meal ? (
                              <p className="truncate text-sm">
                                {meal.recipe_name}{" "}
                                <span className="text-xs text-muted-foreground">
                                  · {Math.round(Number(meal.total_grams))} g · {Math.round(Number(meal.kcal))} kcal
                                  {meal.is_fixed ? " · fixed" : ""}
                                </span>
                              </p>
                            ) : (
                              <p className="text-sm text-muted-foreground">Empty</p>
                            )}
                          </div>
                          {meal ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 shrink-0"
                              disabled={busy}
                              onClick={() => removePlanned(meal)}
                              aria-label={`Remove ${meal.recipe_name}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 shrink-0 px-2"
                              onClick={() => setPicker({ date: dateKey, slot })}
                            >
                              <Plus className="mr-1 h-3.5 w-3.5" /> Add
                            </Button>
                          )}
                        </div>
                      );
                    })}

                    {items
                      .filter((p) => !p.slot || !SLOTS.includes(p.slot as Slot))
                      .map((extra) => (
                        <div
                          key={extra.id}
                          className="flex items-center justify-between gap-2 rounded-lg bg-secondary/40 px-2.5 py-1.5"
                        >
                          <div className="min-w-0">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Extra</p>
                            <p className="truncate text-sm">
                              {extra.recipe_name}{" "}
                              <span className="text-xs text-muted-foreground">
                                · {Math.round(Number(extra.total_grams))} g · {Math.round(Number(extra.kcal))} kcal
                              </span>
                            </p>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 shrink-0"
                            disabled={busy}
                            onClick={() => removePlanned(extra)}
                            aria-label={`Remove ${extra.recipe_name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}

                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => setPicker({ date: dateKey, slot: null })}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" /> Add more
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!picker} onOpenChange={(o) => !o && setPicker(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Plan {picker?.slot ?? "extra meal"}
              {picker ? ` · ${format(new Date(picker.date), "EEE dd MMM")}` : ""}
            </DialogTitle>
            <DialogDescription>Pick a recipe — portions auto-balance across the day.</DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search recipes…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8"
            />
          </div>

          <div className="space-y-3">
            {myMatches.length > 0 && (
              <div>
                <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">Recipes</p>
                <div className="space-y-1">
                  {myMatches.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      disabled={busy}
                      onClick={() => addRecipe(r)}
                      className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm hover:bg-secondary disabled:opacity-50"
                    >
                      <span className="truncate">{r.name}</span>
                      {r.is_fixed && <span className="ml-2 text-xs text-muted-foreground">fixed</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {cookMatches.length > 0 && (
              <div>
                <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">Cook Book</p>
                <div className="space-y-1">
                  {cookMatches.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      disabled={busy}
                      onClick={() => addCookbook(c)}
                      className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm hover:bg-secondary disabled:opacity-50"
                    >
                      <span className="truncate">{c.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{c.country ?? "Library"}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {myMatches.length === 0 && cookMatches.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">No recipes found.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
