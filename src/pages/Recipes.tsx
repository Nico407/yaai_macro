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
import { balancedGramsForShare, clampGrams, ingredientBreakdown, macrosFor, recipePerGram, type PerGram } from "@/lib/scaling";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Pencil, Plus, Utensils } from "lucide-react";
import { cn } from "@/lib/utils";

const SLOTS = ["Breakfast", "Lunch", "Dinner", "Snack"] as const;
type Slot = (typeof SLOTS)[number];

export default function Recipes() {
  const qc = useQueryClient();
  const { data: recipes = [], isLoading } = useRecipes();
  const { data: profile } = useProfile();
  const { data: logs = [] } = useTodayLogs();
  const [editMode, setEditMode] = useState(false);
  const [picking, setPicking] = useState<RecipeRow | null>(null);
  const [busy, setBusy] = useState(false);

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

    const fixedLogs = logs.filter((l) => l.is_fixed);
    const scalableLogs = logs.filter((l) => !l.is_fixed);

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
      if (!isFixed) {
        const raw = balancedGramsForShare(perGram, share);
        grams = clampGrams(raw || grams, 30, 5000);
      }
    }
    const totals = macrosFor(perGram, grams);
    const breakdown = ingredientBreakdown(recipe, grams);

    setBusy(true);

    if (target && scalableCount > 0) {
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
          setBusy(false);
          toast.error("Couldn't rescale meals", { description: upErr.message });
          return;
        }
      }
    }

    const { error } = await supabase.from("meal_logs").insert({
      recipe_id: recipe.id,
      recipe_name: recipe.name,
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
              <h1 className="font-display text-4xl font-bold md:text-5xl">My creations</h1>
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
          <div className="space-y-3">
            {recipes.map((r) => {
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
                        className="shrink-0 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
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
