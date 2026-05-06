import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useIngredients, type Ingredient } from "@/hooks/useIngredients";
import { useProfile } from "@/hooks/useProfile";
import { useTodayLogs } from "@/hooks/useTodayLogs";
import { sumMacros, remaining as calcRemaining } from "@/lib/macros";
import { ArrowLeft, Loader2, Utensils, Zap } from "lucide-react";

type Row = { ingredient: Ingredient; grams: number };

export default function QuickLog() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: ingredients = [], isLoading } = useIngredients();
  const { data: profile } = useProfile();
  const { data: logs = [] } = useTodayLogs();

  const [name, setName] = useState("Quick meal");
  const [rows, setRows] = useState<Row[]>([]);
  const [picker, setPicker] = useState(false);
  const [saving, setSaving] = useState(false);

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
  const left = target ? calcRemaining(target, consumed) : null;

  const totals = rows.reduce(
    (acc, r) => {
      const f = r.grams / 100;
      return {
        kcal: acc.kcal + Number(r.ingredient.kcal_per_100g) * f,
        protein_g: acc.protein_g + Number(r.ingredient.protein_per_100g) * f,
        carbs_g: acc.carbs_g + Number(r.ingredient.carbs_per_100g) * f,
        fat_g: acc.fat_g + Number(r.ingredient.fat_per_100g) * f,
      };
    },
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );

  const totalGrams = rows.reduce((a, r) => a + r.grams, 0);

  function addIngredient(ing: Ingredient) {
    if (rows.some((r) => r.ingredient.id === ing.id)) {
      setPicker(false);
      return;
    }
    setRows((rs) => [...rs, { ingredient: ing, grams: 100 }]);
    setPicker(false);
  }

  function updateGrams(id: string, grams: number) {
    setRows((rs) =>
      rs.map((r) => (r.ingredient.id === id ? { ...r, grams } : r)),
    );
  }

  function removeRow(id: string) {
    setRows((rs) => rs.filter((r) => r.ingredient.id !== id));
  }

  async function onLog() {
    if (rows.length === 0 || totalGrams <= 0) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); navigate("/auth"); return; }
    const { error } = await supabase.from("meal_logs").insert({
      user_id: user.id,
      recipe_id: null,
      recipe_name: name.trim() || "Quick meal",
      total_grams: Math.round(totalGrams),
      kcal: Math.round(totals.kcal),
      protein_g: Math.round(totals.protein_g * 10) / 10,
      carbs_g: Math.round(totals.carbs_g * 10) / 10,
      fat_g: Math.round(totals.fat_g * 10) / 10,
      ingredients_json: rows.map((r) => ({
        ingredient_id: r.ingredient.id,
        name: r.ingredient.name,
        grams: Math.round(r.grams),
      })),
    });
    setSaving(false);
    if (error) {
      toast({ title: "Couldn't log meal", description: error.message, variant: "destructive" });
      return;
    }
    await qc.invalidateQueries({ queryKey: ["today_logs"] });
    toast({ title: "Logged", description: `${name} · ${Math.round(totalGrams)}g` });
    navigate("/");
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-8 md:py-12">
        <header className="mb-6">
          <Link to="/" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Quick log</p>
          <h1 className="font-display text-4xl font-bold md:text-5xl">One-off meal</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Log raw ingredient grams without saving a recipe.
          </p>
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
          <div className="mb-5">
            <Label htmlFor="meal-name">Meal name</Label>
            <Input
              id="meal-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              className="mt-1.5"
            />
          </div>

          <div className="mb-3 flex items-center justify-between">
            <Label>Ingredients</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPicker((v) => !v)}
            >
              + Add
            </Button>
          </div>

          {picker && (
            <Card className="mb-3 rounded-xl">
              {isLoading ? (
                <div className="flex justify-center p-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Command>
                  <CommandInput placeholder="Search ingredients..." />
                  <CommandList>
                    <CommandEmpty>
                      Nothing found.{" "}
                      <Link to="/ingredients" className="underline">
                        Add one
                      </Link>
                      .
                    </CommandEmpty>
                    <CommandGroup>
                      {ingredients.map((ing) => (
                        <CommandItem
                          key={ing.id}
                          value={ing.name}
                          onSelect={() => addIngredient(ing)}
                        >
                          <span className="flex-1">{ing.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {Math.round(Number(ing.kcal_per_100g))} kcal/100g
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              )}
            </Card>
          )}

          {rows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No ingredients yet. Tap <strong>+ Add</strong> to start.
            </p>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => (
                <div
                  key={r.ingredient.id}
                  className="flex items-center gap-2 rounded-lg border border-border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{r.ingredient.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {Math.round((Number(r.ingredient.kcal_per_100g) * r.grams) / 100)} kcal · P{" "}
                      {Math.round((Number(r.ingredient.protein_per_100g) * r.grams) / 100)}
                    </div>
                  </div>
                  <Input
                    type="number"
                    inputMode="numeric"
                    className="h-9 w-20 text-right"
                    value={r.grams}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      updateGrams(r.ingredient.id, Number.isFinite(v) ? Math.max(0, v) : 0);
                    }}
                  />
                  <span className="text-xs text-muted-foreground">g</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeRow(r.ingredient.id)}
                    className="text-muted-foreground"
                  >
                    ×
                  </Button>
                </div>
              ))}
            </div>
          )}

          {rows.length > 0 && (
            <div className="mt-5 rounded-xl bg-secondary p-4">
              <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
                <span>This meal</span>
                <span>{Math.round(totalGrams)}g total</span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <Mini label="kcal" value={Math.round(totals.kcal)} sub={left ? `${Math.round(left.kcal - totals.kcal)} left` : undefined} />
                <Mini label="protein" value={`${Math.round(totals.protein_g)}g`} sub={left ? `${Math.round(left.protein_g - totals.protein_g)} left` : undefined} />
                <Mini label="carbs" value={`${Math.round(totals.carbs_g)}g`} sub={left ? `${Math.round(left.carbs_g - totals.carbs_g)} left` : undefined} />
                <Mini label="fat" value={`${Math.round(totals.fat_g)}g`} sub={left ? `${Math.round(left.fat_g - totals.fat_g)} left` : undefined} />
              </div>
            </div>
          )}

          <Button
            onClick={onLog}
            size="lg"
            disabled={saving || rows.length === 0 || totalGrams <= 0}
            className="mt-6 w-full"
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Utensils className="mr-2 h-4 w-4" />
            )}
            Log this meal
          </Button>
        </Card>

        <p className="mt-4 flex items-center justify-center gap-1 text-xs text-muted-foreground">
          <Zap className="h-3 w-3" /> Won't be saved as a recipe.
        </p>
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
