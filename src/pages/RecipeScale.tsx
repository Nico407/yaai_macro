import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { localDateISO } from "@/lib/dates";
import { useRecipes, type RecipeRow } from "@/hooks/useRecipes";
import { useProfile } from "@/hooks/useProfile";
import { useTodayLogs } from "@/hooks/useTodayLogs";
import { sumMacros, remaining as calcRemaining } from "@/lib/macros";
import { clampGrams, gramsForTarget, ingredientBreakdown, macrosFor, recipePerGram, type FitTarget, servingGrams, portionLimits, mealPortion } from "@/lib/scaling";
import { ArrowLeft, Loader2, Utensils } from "lucide-react";

const FIT_LABELS: Record<FitTarget, string> = {
  protein_g: "Remaining protein",
  kcal: "Remaining calories",
  carbs_g: "Remaining carbs",
  fat_g: "Remaining fat",
};

export default function RecipeScale() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: recipes = [], isLoading: loadingRecipes } = useRecipes();
  const { data: profile } = useProfile();
  const { data: logs = [] } = useTodayLogs();

  const recipe = recipes.find((r) => r.id === id);

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

  const left = target ? calcRemaining(target, consumed) : null;

  const perGram = useMemo(
    () => (recipe ? recipePerGram(recipe) : null),
    [recipe],
  );

  const [fit, setFit] = useState<FitTarget>("protein_g");
  const [grams, setGrams] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Auto-suggest grams when fit changes (only if user hasn't manually overridden much)
  const suggested = useMemo(() => {
    if (!recipe || !perGram || !left) return null;
    const raw = gramsForTarget(perGram, fit, left[fit]);
    const lim = scaleLimits(recipe);
    return clampGrams(raw || servingGrams(recipe), lim.min, lim.max);
  }, [recipe, perGram, left, fit]);

  // a fixed recipe (e.g. a protein shake) is always its own amounts: no fitting, no slider
  const fixed = !!recipe?.is_fixed;
  const activeGrams = fixed ? (recipe ? servingGrams(recipe) : 0) : grams ?? suggested ?? (recipe ? servingGrams(recipe) : 0);

  if (loadingRecipes) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!recipe || !perGram) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12 text-center">
        <p className="text-muted-foreground">Recipe not found.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/recipes">Back to recipes</Link>
        </Button>
      </div>
    );
  }

  const lim = scaleLimits(recipe);
  const minG = Math.max(10, Math.round(lim.min));
  const maxG = Math.max(minG + 10, Math.round(lim.max));

  const totals = macrosFor(perGram, activeGrams);
  const breakdown = ingredientBreakdown(recipe, activeGrams);

  async function onLog() {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const { error } = await supabase.from("meal_logs").insert({
      user_id: user.id,
      recipe_id: recipe.id,
      recipe_name: recipe.name,
      log_date: localDateISO(),   // today in Swiss time (the database default is UTC)
      is_fixed: fixed,
      ...mealPortion(recipe, activeGrams),
      total_grams: Math.round(activeGrams),
      kcal: Math.round(totals.kcal),
      protein_g: Math.round(totals.protein_g * 10) / 10,
      carbs_g: Math.round(totals.carbs_g * 10) / 10,
      fat_g: Math.round(totals.fat_g * 10) / 10,
      ingredients_json: breakdown.map((b) => ({
        ingredient_id: b.ingredient_id,
        name: b.name,
        grams: Math.round(b.grams),
      })),
    });
    setSaving(false);
    if (error) {
      toast({ title: "Couldn't log meal", description: error.message, variant: "destructive" });
      return;
    }
    await qc.invalidateQueries({ queryKey: ["today_logs"] });
    toast({ title: "Logged", description: `${recipe.name} · ${Math.round(activeGrams)}g` });
    navigate("/");
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-8 md:py-12">
        <header className="mb-6">
          <Link to="/recipes" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
            <ArrowLeft className="h-4 w-4" /> Back to recipes
          </Link>
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Pick & scale</p>
          <h1 className="font-display text-4xl font-bold md:text-5xl">{recipe.name}</h1>
          {recipe.description && (
            <p className="mt-2 text-muted-foreground">{recipe.description}</p>
          )}
        </header>

        {left && (
          <Card className="mb-4 rounded-2xl bg-secondary p-4">
            <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
              You have left today
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              <Mini label="kcal" value={Math.round(left.kcal)} />
              <Mini label="protein" value={`${Math.round(left.protein_g)}g`} />
              <Mini label="carbs" value={`${Math.round(left.carbs_g)}g`} />
              <Mini label="fat" value={`${Math.round(left.fat_g)}g`} />
            </div>
          </Card>
        )}

        <Card className="rounded-2xl p-6 shadow-soft md:p-8">
          {fixed && (
            <p className="mb-5 rounded-xl border border-border bg-secondary/40 p-3 text-sm text-muted-foreground">
              Fixed recipe: always {Math.round(activeGrams)} g with its own amounts. It's never scaled.
            </p>
          )}
          {left && !fixed && (
            <div className="mb-5">
              <Label>Fit to</Label>
              <Select
                value={fit}
                onValueChange={(v) => {
                  setFit(v as FitTarget);
                  setGrams(null);
                }}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(FIT_LABELS) as FitTarget[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {FIT_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className={`mb-5 ${fixed ? "hidden" : ""}`}>
            <div className="mb-2 flex items-center justify-between">
              <Label>Serving</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  inputMode="numeric"
                  className="h-9 w-24 text-right"
                  value={Math.round(activeGrams)}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setGrams(Number.isFinite(v) ? v : 0);
                  }}
                />
                <span className="text-sm text-muted-foreground">g</span>
              </div>
            </div>
            <Slider
              value={[Math.min(maxG, Math.max(minG, activeGrams))]}
              min={minG}
              max={maxG}
              step={5}
              onValueChange={(v) => setGrams(v[0])}
            />
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>{minG}g</span>
              <span>{maxG}g</span>
            </div>
          </div>

          <div className="rounded-xl bg-secondary p-4">
            <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
              This serving
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              <Mini label="kcal" value={Math.round(totals.kcal)} sub={left ? `${Math.round(left.kcal - totals.kcal)} left` : undefined} />
              <Mini label="protein" value={`${Math.round(totals.protein_g)}g`} sub={left ? `${Math.round(left.protein_g - totals.protein_g)} left` : undefined} />
              <Mini label="carbs" value={`${Math.round(totals.carbs_g)}g`} sub={left ? `${Math.round(left.carbs_g - totals.carbs_g)} left` : undefined} />
              <Mini label="fat" value={`${Math.round(totals.fat_g)}g`} sub={left ? `${Math.round(left.fat_g - totals.fat_g)} left` : undefined} />
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
              Ingredients
            </div>
            <div className="space-y-1.5">
              {breakdown.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <span className="truncate">{b.name}</span>
                  <span className="shrink-0 font-medium tabular-nums">
                    {Math.round(b.grams)}g
                  </span>
                </div>
              ))}
            </div>
          </div>

          <Button onClick={onLog} size="lg" disabled={saving || activeGrams <= 0} className="mt-6 w-full">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Utensils className="mr-2 h-4 w-4" />}
            Log this meal
          </Button>
        </Card>
      </div>
    </div>
  );
}

function Mini({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div>
      <div className="font-display text-lg font-bold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      {sub && <div className="text-[10px] text-muted-foreground opacity-70">{sub}</div>}
    </div>
  );
}

/** The slider's range: servings-based for recipes with servings or batch cooked, else the recipe's own range. */
function scaleLimits(recipe: RecipeRow) {
  return (Number(recipe.servings) || 1) > 1 || recipe.batch_cooked
    ? portionLimits(recipe)
    : { min: Number(recipe.min_total_g), max: Number(recipe.max_total_g) };
}
