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
  DialogFooter,
} from "@/components/ui/dialog";
import { useProfile } from "@/hooks/useProfile";
import { useTodayLogs, type MealLog } from "@/hooks/useTodayLogs";
import { useRecipes, type RecipeRow } from "@/hooks/useRecipes";
import { useAllCookbookRecipes } from "@/hooks/useAllCookbookRecipes";
import { useIngredients } from "@/hooks/useIngredients";
import type { CookbookRecipe } from "@/hooks/useCookbookRecipes";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { sumMacros, remaining as calcRemaining } from "@/lib/macros";
import {
  balancedGramsForShare,
  clampGrams,
  ingredientBreakdown,
  macrosFor,
  recipePerGram,
  type PerGram,
} from "@/lib/scaling";
import { MacroRing } from "@/components/MacroRing";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Sparkles, Utensils, Carrot, Zap, Plus, Trash2, Search, Settings, Calendar, UserCog, Star, BookOpen, ChefHat, Globe, Lock } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

const SLOTS = ["Breakfast", "Lunch", "Dinner", "Snack"] as const;
type Slot = (typeof SLOTS)[number];

export default function Index() {
  const qc = useQueryClient();
  const { data: profile, isLoading } = useProfile();
  const { data: logs = [] } = useTodayLogs();
  const { data: recipes = [] } = useRecipes();
  const { data: cookbookAll = [] } = useAllCookbookRecipes();
  const { data: allIngredients = [] } = useIngredients();

  const [editing, setEditing] = useState<MealLog | null>(null);

  const [pickerSlot, setPickerSlot] = useState<Slot | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerTab, setPickerTab] = useState<"favorites" | "cookbooks" | "filter">("favorites");
  const [pickerCookbook, setPickerCookbook] = useState<string>("__library__");
  const [filterCuisine, setFilterCuisine] = useState<string[]>([]);
  const [filterIngredient, setFilterIngredient] = useState<string[]>([]);
  const [filterApplied, setFilterApplied] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
  const [favoritesOpen, setFavoritesOpen] = useState(false);
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

  // Group logs by slot (first match wins; extras remain unslotted)
  const slotLogs = useMemo(() => {
    const map: Record<string, MealLog | undefined> = {};
    logs.forEach((l) => {
      if (l.slot && SLOTS.includes(l.slot as Slot) && !map[l.slot]) {
        map[l.slot] = l;
      }
    });
    return map;
  }, [logs]);

  const unslottedLogs = useMemo(
    () => logs.filter((l) => !l.slot || !SLOTS.includes(l.slot as Slot)),
    [logs],
  );

  const emptySlots = SLOTS.filter((s) => !slotLogs[s]).length;

  async function addRecipeToSlot(recipe: RecipeRow) {
    if (!pickerSlot || !target) return;
    const perGram = recipePerGram(recipe);
    if (!perGram.kcal) {
      toast.error("Recipe has no calories");
      return;
    }

    const isFixed = !!recipe.is_fixed;

    // Fixed meals are not scaled — use the recipe's default batch size
    const fixedLogs = logs.filter((l) => l.is_fixed);
    const scalableLogs = logs.filter((l) => !l.is_fixed);

    // Subtract fixed meals from the daily target, then split the rest evenly
    const fixedConsumed = {
      kcal: fixedLogs.reduce((s, l) => s + Number(l.kcal), 0) +
        (isFixed ? perGram.kcal * Number(recipe.default_serving_g) : 0),
      protein_g: fixedLogs.reduce((s, l) => s + Number(l.protein_g), 0) +
        (isFixed ? perGram.protein_g * Number(recipe.default_serving_g) : 0),
      carbs_g: fixedLogs.reduce((s, l) => s + Number(l.carbs_g), 0) +
        (isFixed ? perGram.carbs_g * Number(recipe.default_serving_g) : 0),
      fat_g: fixedLogs.reduce((s, l) => s + Number(l.fat_g), 0) +
        (isFixed ? perGram.fat_g * Number(recipe.default_serving_g) : 0),
    };
    const scalableCount = scalableLogs.length + (isFixed ? 0 : 1);
    const share = {
      kcal: Math.max(0, target.kcal - fixedConsumed.kcal) / Math.max(1, scalableCount),
      protein_g: Math.max(0, target.protein_g - fixedConsumed.protein_g) / Math.max(1, scalableCount),
      carbs_g: Math.max(0, target.carbs_g - fixedConsumed.carbs_g) / Math.max(1, scalableCount),
      fat_g: Math.max(0, target.fat_g - fixedConsumed.fat_g) / Math.max(1, scalableCount),
    };

    let grams: number;
    if (isFixed) {
      grams = Number(recipe.default_serving_g);
    } else {
      const raw = balancedGramsForShare(perGram, share);
      grams = clampGrams(raw || Number(recipe.default_serving_g), 30, 5000);
    }
    const totals = macrosFor(perGram, grams);
    const breakdown = ingredientBreakdown(recipe, grams);

    setAdding(true);

    // Rescale only non-fixed existing meals to their balanced share
    if (scalableCount > 0) {
      for (const l of scalableLogs) {
        const oldGrams = Number(l.total_grams);
        const oldKcal = Number(l.kcal);
        if (!oldGrams || !oldKcal) continue;
        // Reconstruct per-gram from the existing log
        const lPerGram: PerGram = {
          kcal: oldKcal / oldGrams,
          protein_g: Number(l.protein_g) / oldGrams,
          carbs_g: Number(l.carbs_g) / oldGrams,
          fat_g: Number(l.fat_g) / oldGrams,
        };
        const newGramsRaw = balancedGramsForShare(lPerGram, share);
        const newGrams = clampGrams(newGramsRaw || oldGrams, 30, 5000);
        const factor = newGrams / oldGrams;
        const { error: upErr } = await supabase
          .from("meal_logs")
          .update({
            total_grams: Math.round(newGrams),
            kcal: Math.round(oldKcal * factor),
            protein_g: Math.round(Number(l.protein_g) * factor * 10) / 10,
            carbs_g: Math.round(Number(l.carbs_g) * factor * 10) / 10,
            fat_g: Math.round(Number(l.fat_g) * factor * 10) / 10,
          })
          .eq("id", l.id);
        if (upErr) {
          setAdding(false);
          toast.error("Couldn't rescale meals", { description: upErr.message });
          return;
        }
      }
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setAdding(false); toast.error("Sign in required"); return; }
    const { error } = await supabase.from("meal_logs").insert({
      user_id: user.id,
      recipe_id: recipe.id,
      recipe_name: recipe.name,
      total_grams: Math.round(grams),
      kcal: Math.round(totals.kcal),
      protein_g: Math.round(totals.protein_g * 10) / 10,
      carbs_g: Math.round(totals.carbs_g * 10) / 10,
      fat_g: Math.round(totals.fat_g * 10) / 10,
      slot: pickerSlot === ("__extra__" as Slot) ? null : pickerSlot,
      is_fixed: isFixed,
      instructions: recipe.instructions ?? null,
      ingredients_json: breakdown.map((b) => ({
        ingredient_id: b.ingredient_id,
        name: b.name,
        grams: Math.round(b.grams),
      })),
    });
    setAdding(false);
    if (error) {
      toast.error("Couldn't add", { description: error.message });
      return;
    }
    setPickerSlot(null);
    await qc.invalidateQueries({ queryKey: ["meal_logs"] });
    toast.success(`${recipe.name} added to ${pickerSlot}`);
  }

  async function addCookbookToSlot(item: CookbookRecipe) {
    if (!pickerSlot) return;
    const perGram: PerGram = {
      kcal: item.kcal / 100,
      protein_g: item.protein_g / 100,
      carbs_g: item.carbs_g / 100,
      fat_g: item.fat_g / 100,
    };
    let grams = 100;
    let share = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
    if (target) {
      const scalableLogs = logs.filter((l) => !l.is_fixed);
      const fixedLogs = logs.filter((l) => l.is_fixed);
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
      grams = clampGrams(raw || 100, 30, 5000);
    }

    setAdding(true);
    if (target) {
      const scalableLogs = logs.filter((l) => !l.is_fixed);
      for (const l of scalableLogs) {
        const oldGrams = Number(l.total_grams);
        const oldKcal = Number(l.kcal);
        if (!oldGrams || !oldKcal) continue;
        const lPerGram: PerGram = {
          kcal: oldKcal / oldGrams,
          protein_g: Number(l.protein_g) / oldGrams,
          carbs_g: Number(l.carbs_g) / oldGrams,
          fat_g: Number(l.fat_g) / oldGrams,
        };
        const newGramsRaw = balancedGramsForShare(lPerGram, share);
        const newGrams = clampGrams(newGramsRaw || oldGrams, 30, 5000);
        const f = newGrams / oldGrams;
        const { error: upErr } = await supabase
          .from("meal_logs")
          .update({
            total_grams: Math.round(newGrams),
            kcal: Math.round(oldKcal * f),
            protein_g: Math.round(Number(l.protein_g) * f * 10) / 10,
            carbs_g: Math.round(Number(l.carbs_g) * f * 10) / 10,
            fat_g: Math.round(Number(l.fat_g) * f * 10) / 10,
          })
          .eq("id", l.id);
        if (upErr) {
          setAdding(false);
          toast.error("Couldn't rescale meals", { description: upErr.message });
          return;
        }
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
    toast.success(`${item.name} added to ${pickerSlot}`);
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
        <header className="mb-5 flex items-end justify-between md:mb-8">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground md:text-sm">Today</p>
            <h1 className="font-display text-2xl font-bold md:text-5xl">
              {profile.display_name ? `Hi, ${profile.display_name}` : "Your day"}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFavoritesOpen(true)}
              aria-label="Favorites"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <Star className="h-5 w-5" />
            </button>
            <Link
              to="/history"
              aria-label="History"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <Calendar className="h-5 w-5" />
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Settings"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <Settings className="h-5 w-5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link to="/onboarding">
                    <UserCog className="mr-2 h-4 w-4" /> Edit profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/settings">
                    <Settings className="mr-2 h-4 w-4" /> Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    await supabase.auth.signOut();
                    window.location.href = "/auth";
                  }}
                >
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <Card className="rounded-2xl p-4 shadow-soft md:p-8">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
            <MacroRing consumed={consumed.kcal} target={target.kcal} label="Calories" unit="kcal" colorVar="--macro-calories" />
            <MacroRing consumed={consumed.protein_g} target={target.protein_g} label="Protein" unit="g" colorVar="--macro-protein" />
            <MacroRing consumed={consumed.carbs_g} target={target.carbs_g} label="Carbs" unit="g" colorVar="--macro-carbs" />
            <MacroRing consumed={consumed.fat_g} target={target.fat_g} label="Fat" unit="g" colorVar="--macro-fat" />
          </div>
        </Card>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 md:mt-8 md:gap-4">
          <Link to="/plan">
            <ActionCard icon={<Sparkles className="h-5 w-5" />} title="Plan my meals" desc="Browse cookbook & your creations." />
          </Link>
          <Link to="/quick-log">
            <ActionCard icon={<Zap className="h-5 w-5" />} title="Quick log" desc="Log raw ingredient grams without a recipe." />
          </Link>
          <Link to="/recipes">
            <ActionCard icon={<Utensils className="h-5 w-5" />} title="My creations" desc="Build meals from your pantry." />
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
              const log = slotLogs[slot];
              if (log) {
                return (
                  <Card
                    key={slot}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setEditing(log);
                    }}
                    className="cursor-pointer rounded-2xl p-3 transition-colors hover:bg-accent/40 md:p-4"
                  >
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{slot}</div>
                    <div className="mt-0.5 font-semibold">{log.recipe_name}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {Math.round(Number(log.total_grams))}g · {Math.round(Number(log.kcal))} kcal · P{" "}
                      {Math.round(Number(log.protein_g))} · C {Math.round(Number(log.carbs_g))} · F{" "}
                      {Math.round(Number(log.fat_g))}
                    </div>
                  </Card>
                );
              }
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
          </div>
          <Button
            variant="outline"
            className="mt-3 w-full rounded-xl border-dashed"
            onClick={() => setPickerSlot("__extra__" as Slot)}
          >
            <Plus className="mr-1 h-4 w-4" /> Add more
          </Button>
        </section>

        {unslottedLogs.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 font-display text-xl font-bold">Other meals today</h2>
            <div className="space-y-2">
              {unslottedLogs.map((l) => (
                <Card
                  key={l.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setEditing(l);
                  }}
                  className="flex cursor-pointer items-center justify-between rounded-xl p-4 transition-colors hover:bg-accent/40"
                >
                  <div>
                    <div className="font-semibold">{l.recipe_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {Math.round(Number(l.total_grams))}g · {Math.round(Number(l.kcal))} kcal
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    P {Math.round(Number(l.protein_g))} · C {Math.round(Number(l.carbs_g))} · F {Math.round(Number(l.fat_g))}
                  </div>
                </Card>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Meal details dialog (read-only) */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.recipe_name}</DialogTitle>
            <DialogDescription>
              {editing && (
                <>
                  {Math.round(Number(editing.total_grams))}g · {Math.round(Number(editing.kcal))} kcal · P{" "}
                  {Math.round(Number(editing.protein_g))} · C {Math.round(Number(editing.carbs_g))} · F{" "}
                  {Math.round(Number(editing.fat_g))}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {editing && (() => {
            const ings = Array.isArray(editing.ingredients_json)
              ? (editing.ingredients_json as Array<{ name: string; grams: number }>)
              : [];
            const steps = (editing.instructions ?? "")
              .split(/\r?\n/)
              .map((s) => s.replace(/^\s*\d+[.)]\s*/, "").trim())
              .filter(Boolean);
            return (
              <div className="space-y-5 text-sm">
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Ingredients
                  </h3>
                  {ings.length === 0 ? (
                    <p className="text-muted-foreground">No ingredient breakdown saved.</p>
                  ) : (
                    <ul className="divide-y divide-border rounded-xl border">
                      {ings.map((i, idx) => (
                        <li key={idx} className="flex items-center justify-between px-3 py-2">
                          <span>{i.name}</span>
                          <span className="text-muted-foreground">{Math.round(Number(i.grams))} g</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    How to prep
                  </h3>
                  {steps.length === 0 ? (
                    <p className="text-muted-foreground">No instructions yet.</p>
                  ) : (
                    <ol className="list-decimal space-y-1.5 pl-5">
                      {steps.map((s, idx) => (
                        <li key={idx}>{s}</li>
                      ))}
                    </ol>
                  )}
                </section>
              </div>
            );
          })()}

          {editing && (
            <DialogFooter>
              <Button
                variant="destructive"
                onClick={() => deleteLog(editing.id)}
                disabled={deleting}
              >
                <Trash2 className="mr-1 h-4 w-4" />
                {deleting ? "Removing…" : "Remove meal"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Slot picker dialog */}
      <Dialog
        open={!!pickerSlot}
        onOpenChange={(o) => {
          if (!o) {
            setPickerSlot(null);
            setPickerQuery("");
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

          {(() => {
            const q = pickerQuery.trim().toLowerCase();
            const matchQ = (name: string, desc?: string | null) =>
              !q || name.toLowerCase().includes(q) || (desc ?? "").toLowerCase().includes(q);

            const favRecipes = recipes.filter((r) => r.is_favorite && matchQ(r.name, r.description));
            const favCookbook = cookbookAll.filter((r) => r.is_favorite && matchQ(r.name, r.description));

            const cookbookCountries = Array.from(
              new Set(cookbookAll.map((r) => r.country).filter((c): c is string => !!c)),
            ).sort();
            const cookbookOptions: { value: string; label: string }[] = [
              { value: "__library__", label: "Free library" },
              ...cookbookCountries.map((c) => ({ value: c, label: c })),
              { value: "__mine__", label: "My creations" },
            ];

            let cookbookList: Array<{ kind: "recipe"; r: RecipeRow } | { kind: "cookbook"; r: CookbookRecipe }> = [];
            if (pickerCookbook === "__mine__") {
              cookbookList = recipes
                .filter((r) => matchQ(r.name, r.description))
                .map((r) => ({ kind: "recipe" as const, r }));
            } else if (pickerCookbook === "__library__") {
              cookbookList = cookbookAll
                .filter((r) => !r.country && matchQ(r.name, r.description))
                .map((r) => ({ kind: "cookbook" as const, r }));
            } else {
              cookbookList = cookbookAll
                .filter((r) => r.country === pickerCookbook && matchQ(r.name, r.description))
                .map((r) => ({ kind: "cookbook" as const, r }));
            }

            // Build tag pools
            const cuisineSet = new Set<string>();
            recipes.forEach((r) => (r.cuisine_tags ?? []).forEach((t) => cuisineSet.add(t)));
            cookbookAll.forEach((r) => r.country && cuisineSet.add(r.country));
            const cuisineOptions = Array.from(cuisineSet).sort();

            const ingredientSet = new Set<string>();
            recipes.forEach((r) =>
              r.recipe_ingredients?.forEach((ri) => ri.ingredient?.name && ingredientSet.add(ri.ingredient.name)),
            );
            // For cookbook recipes, match canonical ingredient names that appear in their raw ingredient lines
            const canonicalNames = allIngredients.map((i) => i.name);
            cookbookAll.forEach((r) => {
              const blob = (r.ingredients ?? []).join(" ").toLowerCase();
              canonicalNames.forEach((n) => {
                if (blob.includes(n.toLowerCase())) ingredientSet.add(n);
              });
            });
            const ingredientOptions = Array.from(ingredientSet).sort();

            const recipeMatchesFilters = (r: RecipeRow) => {
              if (filterCuisine.length && !filterCuisine.some((t) => (r.cuisine_tags ?? []).includes(t))) return false;
              if (filterIngredient.length) {
                const names = (r.recipe_ingredients ?? []).map((ri) => ri.ingredient?.name ?? "");
                if (!filterIngredient.every((t) => names.includes(t))) return false;
              }
              return true;
            };
            const cookbookMatchesFilters = (r: CookbookRecipe) => {
              if (filterCuisine.length && !filterCuisine.some((t) => r.country === t)) return false;
              if (filterIngredient.length) {
                const blob = (r.ingredients ?? []).join(" ").toLowerCase();
                if (!filterIngredient.every((t) => blob.includes(t.toLowerCase()))) return false;
              }
              return true;
            };

            const filterList: Array<{ kind: "recipe"; r: RecipeRow } | { kind: "cookbook"; r: CookbookRecipe }> = [
              ...recipes.filter((r) => matchQ(r.name, r.description) && recipeMatchesFilters(r)).map((r) => ({ kind: "recipe" as const, r })),
              ...cookbookAll.filter((r) => matchQ(r.name, r.description) && cookbookMatchesFilters(r)).map((r) => ({ kind: "cookbook" as const, r })),
            ];

            const renderRecipeBtn = (r: RecipeRow) => (
              <button
                key={`r-${r.id}`}
                onClick={() => addRecipeToSlot(r)}
                disabled={adding}
                className="w-full rounded-xl border border-border p-3 text-left transition-colors hover:bg-accent/40 disabled:opacity-50"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{r.name}</span>
                  {r.is_favorite && <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />}
                  <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">My recipe</span>
                </div>
                {r.description && (
                  <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{r.description}</div>
                )}
              </button>
            );
            const renderCookbookBtn = (r: CookbookRecipe) => (
              <button
                key={`c-${r.id}`}
                onClick={() => addCookbookToSlot(r)}
                disabled={adding}
                className="w-full rounded-xl border border-border p-3 text-left transition-colors hover:bg-accent/40 disabled:opacity-50"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{r.name}</span>
                  {r.is_favorite && <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />}
                  <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">
                    {r.country ?? "Library"}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {r.kcal} kcal · P {r.protein_g} · C {r.carbs_g} · F {r.fat_g}
                </div>
              </button>
            );

            return (
              <Tabs value={pickerTab} onValueChange={(v) => setPickerTab(v as typeof pickerTab)}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="favorites">Favourites</TabsTrigger>
                  <TabsTrigger value="cookbooks">Categories</TabsTrigger>
                  <TabsTrigger value="filter">Filter</TabsTrigger>
                </TabsList>

                {pickerTab === "favorites" && (
                  <div className="relative mt-3">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={pickerQuery}
                      onChange={(e) => setPickerQuery(e.target.value)}
                      placeholder="Search recipes…"
                      className="pl-9"
                    />
                  </div>
                )}

                <TabsContent value="favorites" className="h-[50vh] space-y-2 overflow-y-auto">
                  {favRecipes.length === 0 && favCookbook.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      No favourites yet. Star a recipe to see it here.
                    </p>
                  ) : (
                    <>
                      {favRecipes.map(renderRecipeBtn)}
                      {favCookbook.map(renderCookbookBtn)}
                    </>
                  )}
                </TabsContent>

                <TabsContent value="cookbooks" className="space-y-3">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <button
                      type="button"
                      onClick={() => setPickerCookbook("__library__")}
                      className={`rounded-xl border p-3 text-left transition-colors ${pickerCookbook === "__library__" ? "border-primary bg-accent/40" : "border-border hover:bg-accent/20"}`}
                    >
                      <div className="mb-1 flex items-center gap-2 text-primary">
                        <BookOpen className="h-4 w-4" />
                        <span className="font-display text-sm font-bold">Cook Book</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Free starter library of macro-friendly recipes.</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPickerCookbook("__mine__")}
                      className={`rounded-xl border p-3 text-left transition-colors ${pickerCookbook === "__mine__" ? "border-primary bg-accent/40" : "border-border hover:bg-accent/20"}`}
                    >
                      <div className="mb-1 flex items-center gap-2 text-primary">
                        <ChefHat className="h-4 w-4" />
                        <span className="font-display text-sm font-bold">My creations</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Recipes you've built yourself.</p>
                    </button>
                    <button
                      type="button"
                      disabled
                      className="cursor-not-allowed rounded-xl border border-border p-3 text-left opacity-60"
                    >
                      <div className="mb-1 flex items-center gap-2 text-primary">
                        <Globe className="h-4 w-4" />
                        <span className="font-display text-sm font-bold">Add countries</span>
                        <Lock className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <p className="text-xs text-muted-foreground">Recipe packs from around the world.</p>
                      <span className="mt-2 inline-block rounded-full bg-secondary px-2 py-0.5 text-[9px] uppercase tracking-wider">Coming soon</span>
                    </button>
                  </div>
                </TabsContent>

                <TabsContent value="filter" className="flex max-h-[50vh] flex-col gap-3 overflow-hidden">
                  <div className="space-y-2 overflow-y-auto pr-1">
                    {(filterCuisine.length > 0 || filterIngredient.length > 0) && (
                      <div className="rounded-lg border border-primary/40 bg-primary/5 p-2">
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Selected tags</p>
                        <div className="flex flex-wrap gap-1.5">
                          {filterCuisine.map((tag) => (
                            <button
                              key={`sel-c-${tag}`}
                              type="button"
                              onClick={() => {
                                setFilterApplied(false);
                                setFilterCuisine((prev) => prev.filter((t) => t !== tag));
                              }}
                              className="rounded-full border border-primary bg-primary px-2.5 py-0.5 text-xs text-primary-foreground"
                            >
                              {tag} ×
                            </button>
                          ))}
                          {filterIngredient.map((tag) => (
                            <button
                              key={`sel-i-${tag}`}
                              type="button"
                              onClick={() => {
                                setFilterApplied(false);
                                setFilterIngredient((prev) => prev.filter((t) => t !== tag));
                              }}
                              className="rounded-full border border-primary bg-primary px-2.5 py-0.5 text-xs text-primary-foreground"
                            >
                              {tag} ×
                            </button>
                          ))}
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setFilterCuisine([]);
                              setFilterIngredient([]);
                              setFilterApplied(false);
                            }}
                            className="text-xs text-muted-foreground underline"
                          >
                            Clear filters
                          </button>
                          {filterApplied ? (
                            <Button size="sm" variant="outline" onClick={() => setFilterApplied(false)}>
                              Edit
                            </Button>
                          ) : (
                            <Button size="sm" onClick={() => setFilterApplied(true)}>
                              Done
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                    {!filterApplied && (
                      <>
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            value={tagSearch}
                            onChange={(e) => setTagSearch(e.target.value)}
                            placeholder="Search tags…"
                            className="pl-9"
                          />
                        </div>
                        <div>
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cuisine tags</p>
                          <div className="flex flex-wrap gap-1.5">
                            {cuisineOptions.length === 0 && (
                              <span className="text-xs text-muted-foreground">No cuisine tags yet.</span>
                            )}
                            {cuisineOptions.filter((t) => !filterCuisine.includes(t)).map((tag) => (
                              <button
                                key={tag}
                                type="button"
                                onClick={() => {
                                  setFilterApplied(false);
                                  setFilterCuisine((prev) => [...prev, tag]);
                                }}
                                className="rounded-full border border-border bg-background px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-secondary"
                              >
                                {tag}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Ingredients</p>
                          <div className="flex flex-wrap gap-1.5">
                            {ingredientOptions.length === 0 && (
                              <span className="text-xs text-muted-foreground">No ingredients yet.</span>
                            )}
                            {ingredientOptions.filter((t) => !filterIngredient.includes(t)).map((tag) => (
                              <button
                                key={tag}
                                type="button"
                                onClick={() => {
                                  setFilterApplied(false);
                                  setFilterIngredient((prev) => [...prev, tag]);
                                }}
                                className="rounded-full border border-border bg-background px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-secondary"
                              >
                                {tag}
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  {filterApplied && (filterCuisine.length > 0 || filterIngredient.length > 0) && (
                    <div className="flex-1 space-y-2 overflow-y-auto border-t pt-2">
                      {filterList.length === 0 ? (
                        <p className="py-6 text-center text-sm text-muted-foreground">
                          No recipes match your filters.
                        </p>
                      ) : (
                        filterList.map((it) =>
                          it.kind === "recipe" ? renderRecipeBtn(it.r) : renderCookbookBtn(it.r),
                        )
                      )}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
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
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-4 py-16 text-primary-foreground">
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
