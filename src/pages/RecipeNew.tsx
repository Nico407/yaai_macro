import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useIngredients, type Ingredient } from "@/hooks/useIngredients";
import { useRecipes, CUISINE_TAGS } from "@/hooks/useRecipes";
import { ArrowLeft, Check, ChevronsUpDown, Loader2, Plus, Trash2 } from "lucide-react";

type Row = { ingredient_id: string; grams: string };

export default function RecipeNew() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: ingredients = [], isLoading } = useIngredients();
  const { data: recipes = [], isLoading: loadingRecipes } = useRecipes();
  const existing = isEdit ? recipes.find((r) => r.id === id) : undefined;

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [isFixed, setIsFixed] = useState(false);
  const [cuisineTags, setCuisineTags] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([
    { ingredient_id: "", grams: "" },
    { ingredient_id: "", grams: "" },
  ]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!isEdit || hydrated || !existing) return;
    setName(existing.name);
    setDescription(existing.description ?? "");
    setInstructions(existing.instructions ?? "");
    setIsFixed(!!existing.is_fixed);
    setCuisineTags(existing.cuisine_tags ?? []);
    const total = Number(existing.default_serving_g) || 0;
    setRows(
      existing.recipe_ingredients.map((ri) => ({
        ingredient_id: ri.ingredient_id,
        grams: String(Math.round(Number(ri.ratio) * total)),
      })),
    );
    setHydrated(true);
  }, [isEdit, hydrated, existing]);

  const ingMap = useMemo(() => {
    const m = new Map<string, Ingredient>();
    ingredients.forEach((i) => m.set(i.id, i));
    return m;
  }, [ingredients]);

  const totals = useMemo(() => {
    let totalG = 0;
    let kcal = 0,
      protein = 0,
      carbs = 0,
      fat = 0;
    rows.forEach((r) => {
      const g = parseFloat(r.grams);
      const ing = ingMap.get(r.ingredient_id);
      if (!ing || !Number.isFinite(g) || g <= 0) return;
      totalG += g;
      kcal += (Number(ing.kcal_per_100g) * g) / 100;
      protein += (Number(ing.protein_per_100g) * g) / 100;
      carbs += (Number(ing.carbs_per_100g) * g) / 100;
      fat += (Number(ing.fat_per_100g) * g) / 100;
    });
    return { totalG, kcal, protein, carbs, fat };
  }, [rows, ingMap]);

  const valid =
    name.trim().length > 0 &&
    totals.totalG > 0 &&
    rows.filter((r) => r.ingredient_id && parseFloat(r.grams) > 0).length >= 1;

  function updateRow(idx: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, { ingredient_id: "", grams: "" }]);
  }
  function removeRow(idx: number) {
    setRows((rs) => rs.filter((_, i) => i !== idx));
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);

    const valid_rows = rows.filter(
      (r) => r.ingredient_id && parseFloat(r.grams) > 0,
    );
    const total = valid_rows.reduce((s, r) => s + parseFloat(r.grams), 0);

    const recipePayload = {
      name: name.trim(),
      description: description.trim() || null,
      instructions: instructions.trim() || null,
      default_serving_g: Math.round(total),
      min_total_g: Math.max(50, Math.round(total * 0.5)),
      max_total_g: Math.round(total * 3),
      is_fixed: isFixed,
      cuisine_tags: cuisineTags,
    };

    let recipeId = id;
    if (isEdit) {
      const { error: upErr } = await supabase
        .from("recipes")
        .update(recipePayload)
        .eq("id", id!);
      if (upErr) {
        setSaving(false);
        toast({ title: "Couldn't save recipe", description: upErr.message, variant: "destructive" });
        return;
      }
      // Replace ingredients
      await supabase.from("recipe_ingredients").delete().eq("recipe_id", id!);
    } else {
      const { data: recipe, error: recErr } = await supabase
        .from("recipes")
        .insert(recipePayload)
        .select()
        .single();
      if (recErr || !recipe) {
        setSaving(false);
        toast({ title: "Couldn't save recipe", description: recErr?.message, variant: "destructive" });
        return;
      }
      recipeId = recipe.id;
    }

    const ingredientPayload = valid_rows.map((r) => ({
      recipe_id: recipeId!,
      ingredient_id: r.ingredient_id,
      ratio: parseFloat(r.grams) / total,
    }));

    const { error: riErr } = await supabase
      .from("recipe_ingredients")
      .insert(ingredientPayload);

    setSaving(false);

    if (riErr) {
      toast({ title: "Couldn't save ingredients", description: riErr.message, variant: "destructive" });
      return;
    }

    await qc.invalidateQueries({ queryKey: ["recipes"] });
    toast({ title: isEdit ? "Recipe updated" : "Recipe saved" });
    navigate("/recipes");
  }

  async function onDelete() {
    if (!isEdit) return;
    setDeleting(true);
    await supabase.from("recipe_ingredients").delete().eq("recipe_id", id!);
    const { error } = await supabase.from("recipes").delete().eq("id", id!);
    setDeleting(false);
    if (error) {
      toast({ title: "Couldn't delete", description: error.message, variant: "destructive" });
      return;
    }
    await qc.invalidateQueries({ queryKey: ["recipes"] });
    toast({ title: "Recipe deleted" });
    navigate("/recipes");
  }

  if (isEdit && loadingRecipes && !existing) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (isEdit && !loadingRecipes && !existing) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12 text-center">
        <p className="text-muted-foreground">Recipe not found.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/recipes">Back to recipes</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 md:py-12">
        <header className="mb-8">
          <Link to="/recipes" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
            <ArrowLeft className="h-4 w-4" /> Back to recipes
          </Link>
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
            {isEdit ? "Edit recipe" : "New recipe"}
          </p>
          <h1 className="font-display text-4xl font-bold md:text-5xl">
            {isEdit ? name || "Edit meal" : "Build a meal."}
          </h1>
          <p className="mt-2 text-muted-foreground">
            Add ingredients with their grams for one batch. Ratios are calculated automatically.
          </p>
        </header>

        <Card className="rounded-2xl p-6 shadow-soft md:p-8">
          <form onSubmit={onSave} className="space-y-6">
            <div>
              <Label htmlFor="r-name">Name</Label>
              <Input
                id="r-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Spaghetti with tomato sauce"
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="r-desc">Notes (optional)</Label>
              <Textarea
                id="r-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Quick weeknight dinner"
                className="mt-1.5"
                rows={2}
              />
            </div>

            <div>
              <Label htmlFor="r-instr">How to prep (optional)</Label>
              <Textarea
                id="r-instr"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder={"1. Cook the pasta…\n2. Heat the sauce…\n3. Combine and serve."}
                className="mt-1.5"
                rows={5}
              />
              <p className="mt-1 text-xs text-muted-foreground">One step per line.</p>
            </div>

            <div className="flex items-start justify-between gap-4 rounded-xl border bg-secondary/40 p-4">
              <div className="flex-1">
                <Label htmlFor="r-fixed" className="font-semibold">Fixed serving size</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  When on, this meal won't be auto-scaled to your macros (e.g. a protein shake). Other meals on the day still scale around it.
                </p>
              </div>
              <Switch id="r-fixed" checked={isFixed} onCheckedChange={setIsFixed} />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label>Ingredients</Label>
                <span className="text-xs text-muted-foreground">grams in one batch</span>
              </div>

              {isLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : ingredients.length === 0 ? (
                <Card className="rounded-xl p-4 text-sm text-muted-foreground">
                  No ingredients yet.{" "}
                  <Link to="/ingredients" className="underline">
                    Add some first
                  </Link>
                  .
                </Card>
              ) : (
                <div className="space-y-2">
                  {rows.map((r, idx) => {
                    const ing = ingMap.get(r.ingredient_id);
                    const g = parseFloat(r.grams);
                    const pct =
                      totals.totalG > 0 && Number.isFinite(g) && g > 0
                        ? (g / totals.totalG) * 100
                        : 0;
                    return (
                      <div key={idx} className="flex items-start gap-2">
                        <div className="flex-1">
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                role="combobox"
                                className={cn(
                                  "w-full justify-between font-normal",
                                  !ing && "text-muted-foreground",
                                )}
                              >
                                {ing ? ing.name : "Pick an ingredient…"}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                              <Command>
                                <CommandInput placeholder="Search ingredients…" />
                                <CommandList>
                                  <CommandEmpty>No ingredients found.</CommandEmpty>
                                  <CommandGroup>
                                    {ingredients.map((i) => (
                                      <CommandItem
                                        key={i.id}
                                        value={i.name}
                                        onSelect={() => updateRow(idx, { ingredient_id: i.id })}
                                      >
                                        <Check
                                          className={cn(
                                            "mr-2 h-4 w-4",
                                            r.ingredient_id === i.id ? "opacity-100" : "opacity-0",
                                          )}
                                        />
                                        {i.name}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                          {ing && (
                            <p className="mt-1 text-[10px] text-muted-foreground">
                              {Math.round(Number(ing.kcal_per_100g))} kcal · P{" "}
                              {Number(ing.protein_per_100g)} · C {Number(ing.carbs_per_100g)} · F{" "}
                              {Number(ing.fat_per_100g)} / 100g
                            </p>
                          )}
                        </div>
                        <div className="w-24">
                          <Input
                            type="number"
                            inputMode="decimal"
                            step="1"
                            min="0"
                            value={r.grams}
                            onChange={(e) => updateRow(idx, { grams: e.target.value })}
                            placeholder="g"
                          />
                          {pct > 0 && (
                            <p className="mt-1 text-right text-[10px] text-muted-foreground">
                              {pct.toFixed(1)}%
                            </p>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeRow(idx)}
                          disabled={rows.length <= 1}
                          aria-label="Remove ingredient"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}

                  <Button type="button" variant="outline" size="sm" onClick={addRow}>
                    <Plus className="mr-1 h-3 w-3" /> Add ingredient
                  </Button>
                </div>
              )}
            </div>

            {totals.totalG > 0 && (
              <div className="rounded-xl bg-secondary p-4">
                <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
                  <span>One batch ({Math.round(totals.totalG)}g)</span>
                  <span>per gram</span>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <Stat label="kcal" value={Math.round(totals.kcal)} per={(totals.kcal / totals.totalG).toFixed(2)} />
                  <Stat label="protein" value={`${totals.protein.toFixed(1)}g`} per={(totals.protein / totals.totalG).toFixed(2)} />
                  <Stat label="carbs" value={`${totals.carbs.toFixed(1)}g`} per={(totals.carbs / totals.totalG).toFixed(2)} />
                  <Stat label="fat" value={`${totals.fat.toFixed(1)}g`} per={(totals.fat / totals.totalG).toFixed(2)} />
                </div>
              </div>
            )}

            <Button type="submit" size="lg" disabled={saving || !valid} className="w-full">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isEdit ? "Save changes" : "Save recipe"}
            </Button>

            {isEdit && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete recipe
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this recipe?</AlertDialogTitle>
                    <AlertDialogDescription>
                      "{name}" will be removed permanently. Past meal logs are kept.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={onDelete}
                      disabled={deleting}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {deleting ? "Deleting…" : "Delete"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </form>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, per }: { label: string; value: string | number; per: string }) {
  return (
    <div>
      <div className="font-display text-lg font-bold">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-[10px] text-muted-foreground opacity-70">{per}/g</div>
    </div>
  );
}
