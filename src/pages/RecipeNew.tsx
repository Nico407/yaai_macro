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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
import { useRecipePhotos, useSaveRecipePhoto } from "@/hooks/useRecipePhotos";
import { RecipePhoto } from "@/components/RecipePhoto";
import { searchIngredients } from "@/lib/ingredientSearch";
import { BASES, COUNTRIES, LIFESTYLES, PROTEINS, facetsOf, type Lifestyle } from "@/lib/recipeFacets";
import { ArrowLeft, Check, ChevronsUpDown, Loader2, Plus, Trash2 } from "lucide-react";

type Row = { ingredient_id: string; grams: string };

export default function RecipeNew() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: ingredients = [], isLoading } = useIngredients();
  const [ingQuery, setIngQuery] = useState("");
  const [extras, setExtras] = useState("");
  const { data: recipes = [], isLoading: loadingRecipes } = useRecipes();
  const existing = isEdit ? recipes.find((r) => r.id === id) : undefined;

  const { data: photos } = useRecipePhotos();
  const savePhoto = useSaveRecipePhoto();
  // a new recipe's photo waits here until the recipe is saved; an existing recipe's is saved right away
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null);
  const shownPhoto = isEdit ? photos?.get(id!) : pendingPhoto;
  async function onPhoto(image: string | null) {
    if (isEdit) {
      await savePhoto(id!, image);
      toast({ title: image ? "Photo saved" : "Photo removed" });
    } else setPendingPhoto(image);
  }

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [isFixed, setIsFixed] = useState(false);
  const [servings, setServings] = useState("1");          // the amounts below make this many servings
  const [batchCooked, setBatchCooked] = useState(false);  // cooked ahead: only the portion changes
  const [cookedWeight, setCookedWeight] = useState("");   // whole batch, cooked (optional)
  const nServings = Math.max(1, parseInt(servings, 10) || 1);
  const [cuisineTags, setCuisineTags] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([
    { ingredient_id: "", grams: "" },
    { ingredient_id: "", grams: "" },
  ]);
  const [hydrated, setHydrated] = useState(false);
  const [openIngIdx, setOpenIngIdx] = useState<number | null>(null);
  const [tagsOpen, setTagsOpen] = useState(false);
  // Filter tags (Plan my meals): suggested from the ingredients until you change one yourself
  const [baseTags, setBaseTags] = useState<string[]>([]);
  const [proteinTags, setProteinTags] = useState<string[]>([]);
  const [lifestyle, setLifestyle] = useState<Lifestyle | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [tagsTouched, setTagsTouched] = useState(false);

  useEffect(() => {
    if (!isEdit || hydrated || !existing) return;
    setName(existing.name);
    setDescription(existing.description ?? "");
    setInstructions(existing.instructions ?? "");
    setExtras((existing.extra_ingredients ?? []).join(", "));
    setIsFixed(!!existing.is_fixed);
    setServings(String(existing.servings ?? 1));
    setBatchCooked(!!existing.batch_cooked);
    setCookedWeight(existing.cooked_weight_g ? String(Math.round(Number(existing.cooked_weight_g))) : "");
    setCuisineTags(existing.cuisine_tags ?? []);
    if (existing.lifestyle) {
      // tagged before: keep those tags, no more suggestions
      setBaseTags(existing.base_tags ?? []);
      setProteinTags(existing.protein_tags ?? []);
      setLifestyle(existing.lifestyle as Lifestyle);
      setCountry(existing.country ?? null);
      setTagsTouched(true);
    }
    const total = Number(existing.default_serving_g) || 0;
    setRows(
      existing.recipe_ingredients.map((ri) => ({
        ingredient_id: ri.ingredient_id,
        grams: String(Math.round(Number(ri.ratio) * total)),
      })),
    );
    setHydrated(true);
  }, [isEdit, hydrated, existing]);

  // Suggest the filter tags from the name and ingredients, as long as you haven't set them yourself
  const suggestion = useMemo(() => facetsOf(
    rows.map((r) => ingredients.find((i) => i.id === r.ingredient_id)?.name ?? "").filter(Boolean),
    { name, cuisineTags },
  ), [rows, ingredients, name, cuisineTags]);
  useEffect(() => {
    if (tagsTouched) return;
    setBaseTags(suggestion.bases);
    setProteinTags(suggestion.proteins);
    setLifestyle(suggestion.lifestyle);
    setCountry(suggestion.country);
  }, [suggestion, tagsTouched]);
  const toggleIn = (list: string[], set: (v: string[]) => void, value: string) => {
    setTagsTouched(true);
    set(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  };

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
      fat = 0,
      fibre = 0,
      salt = 0,
      unknown = 0;          // weighed ingredients without fibre / salt data
    rows.forEach((r) => {
      const g = parseFloat(r.grams);
      const ing = ingMap.get(r.ingredient_id);
      if (!ing || !Number.isFinite(g) || g <= 0) return;
      totalG += g;
      kcal += (Number(ing.kcal_per_100g) * g) / 100;
      protein += (Number(ing.protein_per_100g) * g) / 100;
      carbs += (Number(ing.carbs_per_100g) * g) / 100;
      fat += (Number(ing.fat_per_100g) * g) / 100;
      if (ing.fibre_per_100g == null || ing.salt_per_100g == null) unknown += 1;
      fibre += (Number(ing.fibre_per_100g ?? 0) * g) / 100;
      salt += (Number(ing.salt_per_100g ?? 0) * g) / 100;
    });
    return { totalG, kcal, protein, carbs, fat, fibre, salt, unknown };
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

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      toast({ title: "Sign in required", variant: "destructive" });
      navigate("/auth");
      return;
    }

    const valid_rows = rows.filter(
      (r) => r.ingredient_id && parseFloat(r.grams) > 0,
    );
    const total = valid_rows.reduce((s, r) => s + parseFloat(r.grams), 0);

    const recipePayload = {
      user_id: user.id,
      name: name.trim(),
      description: description.trim() || null,
      instructions: instructions.trim() || null,
      extra_ingredients: extras.split(",").map((x) => x.trim()).filter(Boolean),
      default_serving_g: Math.round(total),
      min_total_g: Math.max(50, Math.round(total * 0.5)),
      max_total_g: Math.round(total * 3),
      is_fixed: isFixed,
      servings: nServings,
      batch_cooked: batchCooked,
      cooked_weight_g: Number(cookedWeight) > 0 ? Math.round(Number(cookedWeight)) : null,
      cuisine_tags: cuisineTags,
      base_tags: baseTags,
      protein_tags: proteinTags,
      lifestyle: lifestyle ?? suggestion.lifestyle,
      country,
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

    if (!isEdit && pendingPhoto) {
      await savePhoto(recipeId!, pendingPhoto).catch((e) =>
        toast({ title: "Recipe saved, photo not", description: e instanceof Error ? e.message : String(e), variant: "destructive" }));
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
      <div className="mx-auto max-w-3xl px-4 py-6 md:py-12">
        <header className="mb-5 md:mb-8">
          <Link to="/recipes" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
            <ArrowLeft className="h-4 w-4" /> Back to recipes
          </Link>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground md:text-sm">
            {isEdit ? "Edit recipe" : "New recipe"}
          </p>
          <h1 className="font-display text-3xl font-bold md:text-5xl">
            {isEdit ? name || "Edit meal" : "Build a meal."}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground md:text-base">
            Add ingredients with their grams for one batch. Ratios are calculated automatically.
          </p>
        </header>

        <Card className="rounded-2xl p-4 shadow-soft md:p-8">
          <form onSubmit={onSave} className="space-y-3 md:space-y-5">
            <div className="flex items-center gap-4">
              <RecipePhoto src={shownPhoto} alt={name || "Recipe photo"} className="h-24 w-24 md:h-28 md:w-28"
                iconClassName="h-7 w-7" onPick={onPhoto} onRemove={() => onPhoto(null)} />
              <div className="text-sm">
                <div className="font-semibold">{shownPhoto ? "Photo" : "Add a photo"}</div>
                <p className="text-xs text-muted-foreground">
                  {shownPhoto ? "Tap it to change it." : "Tap the hat to take one when you cook it, or pick one from your phone."}
                </p>
              </div>
            </div>
            <div>
              <Label htmlFor="r-name">Name</Label>
              <Input
                id="r-name"
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 32))}
                placeholder="Spaghetti with tomato sauce"
                maxLength={32}
                className="mt-1.5"
              />
              <p className="mt-1 text-right text-[10px] text-muted-foreground">{name.length}/32</p>
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

            {/* servings and batch cooking: the planner works from one serving, never the whole pot */}
            <div className="space-y-4 rounded-xl border bg-secondary/40 p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <Label htmlFor="r-servings" className="font-semibold">Makes</Label>
                  <p className="mt-1 text-xs text-muted-foreground">How many servings the amounts below make.</p>
                </div>
                <div className="flex items-center gap-2">
                  <Input id="r-servings" inputMode="numeric" value={servings} className="h-9 w-16 text-center"
                    onChange={(e) => setServings(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))} />
                  <span className="text-sm text-muted-foreground">serving{nServings === 1 ? "" : "s"}</span>
                </div>
              </div>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <Label htmlFor="r-batch" className="font-semibold">Batch cooked</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Cooked ahead (soups, stews, meal prep). The planner keeps your portion between ½ and 1½ servings.
                  </p>
                </div>
                <Switch id="r-batch" checked={batchCooked} onCheckedChange={setBatchCooked} />
              </div>
              {(batchCooked || nServings > 1) && (
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <Label htmlFor="r-cooked" className="font-semibold">Cooked weight of the whole batch</Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Optional. Weigh the pot once (minus the pot): meals then say how much to put in your bowl.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input id="r-cooked" inputMode="numeric" value={cookedWeight} placeholder="–" className="h-9 w-20 text-center"
                      onChange={(e) => setCookedWeight(e.target.value.replace(/[^0-9]/g, "").slice(0, 5))} />
                    <span className="text-sm text-muted-foreground">g</span>
                  </div>
                </div>
              )}
              <div className="flex items-start justify-between gap-4 border-t border-border/60 pt-4">
                <div className="flex-1">
                  <Label htmlFor="r-fixed" className="font-semibold">Fixed serving size</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Always exactly one serving, never scaled (e.g. a protein shake). Other meals on the day scale around it.
                  </p>
                </div>
                <Switch id="r-fixed" checked={isFixed} onCheckedChange={setIsFixed} />
              </div>
            </div>

            {/* cuisine tags moved below */}

            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label>Ingredients</Label>
                <span className="text-xs text-muted-foreground">grams for the whole recipe ({nServings} serving{nServings === 1 ? "" : "s"})</span>
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
                        <div className="min-w-0 flex-1">
                          <Popover open={openIngIdx === idx} onOpenChange={(o) => { setOpenIngIdx(o ? idx : null); setIngQuery(""); }}>
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
                                <span className="truncate">{ing ? ing.name : "Pick an ingredient…"}</span>
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                              {/* our own search: ~800 ingredients, English or German names, best matches first */}
                              <Command shouldFilter={false}>
                                <CommandInput placeholder="Search ingredients…" value={ingQuery} onValueChange={setIngQuery} />
                                <CommandList>
                                  <CommandEmpty>
                                    No ingredients found.{" "}
                                    <Link to="/ingredients" className="underline">Look it up on Open Food Facts</Link>
                                  </CommandEmpty>
                                  <CommandGroup>
                                    {searchIngredients(ingredients, ingQuery).map((i) => (
                                      <CommandItem
                                        key={i.id}
                                        value={i.id}
                                        onSelect={() => {
                                          updateRow(idx, { ingredient_id: i.id });
                                          setOpenIngIdx(null);
                                        }}
                                      >
                                        <Check
                                          className={cn(
                                            "mr-2 h-4 w-4",
                                            r.ingredient_id === i.id ? "opacity-100" : "opacity-0",
                                          )}
                                        />
                                        <span className="min-w-0 flex-1 truncate">{i.name}</span>
                                        <span className="ml-2 shrink-0 text-[10px] text-muted-foreground">
                                          {Math.round(Number(i.kcal_per_100g))} kcal · P {Number(i.protein_per_100g)}
                                        </span>
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
                        <div className="w-20 shrink-0">
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
                {nServings > 1 && (
                  <p className="mt-3 text-center text-sm">
                    <span className="text-muted-foreground">Per serving ({nServings}): </span>
                    <span className="font-semibold">
                      {Math.round(totals.kcal / nServings)} kcal · P {(totals.protein / nServings).toFixed(1)} g ·{" "}
                      {Number(cookedWeight) > 0
                        ? `${Math.round(Number(cookedWeight) / nServings)} g cooked`
                        : `${Math.round(totals.totalG / nServings)} g`}
                    </span>
                  </p>
                )}
                <div className="mt-2 flex justify-center gap-4 text-xs text-muted-foreground">
                  <span>fibre <span className="font-semibold text-foreground">{totals.fibre.toFixed(1)}g</span></span>
                  <span>salt <span className="font-semibold text-foreground">{totals.salt.toFixed(1)}g</span></span>
                  {totals.unknown > 0 && <span className="opacity-70">({totals.unknown} without fibre/salt data)</span>}
                </div>
              </div>
            )}

            {/* listed with the recipe, not weighed: salt, pepper, hot sauce… */}
            <div>
              <Label htmlFor="r-extras">Also needed (not weighed)</Label>
              <Input id="r-extras" value={extras} onChange={(e) => setExtras(e.target.value)}
                placeholder="salt, pepper, hot sauce" className="mt-1.5" />
              <p className="mt-1 text-xs text-muted-foreground">Comma-separated. Shown with the recipe, no macros counted.</p>
            </div>

            <div className="space-y-3 rounded-xl border border-border p-4">
              <div className="flex items-baseline justify-between">
                <Label>Tags for filtering</Label>
                <span className="text-xs text-muted-foreground">
                  {tagsTouched ? "set by you" : "suggested from the ingredients"}
                </span>
              </div>
              <TagRow label="Base" options={BASES.map(([b]) => b)} active={baseTags}
                onToggle={(v) => toggleIn(baseTags, setBaseTags, v)} />
              <TagRow label="Protein" options={PROTEINS.map(([p]) => p)} active={proteinTags}
                onToggle={(v) => toggleIn(proteinTags, setProteinTags, v)} />
              <TagRow label="Lifestyle" options={LIFESTYLES} active={lifestyle ? [lifestyle] : []}
                onToggle={(v) => { setTagsTouched(true); setLifestyle(v as Lifestyle); }} />
              <TagRow label="Country" options={[...new Set([...(country ? [country] : []), ...COUNTRIES])]} active={country ? [country] : []}
                onToggle={(v) => { setTagsTouched(true); setCountry(country === v ? null : v); }} />
            </div>

            <Collapsible open={tagsOpen} onOpenChange={setTagsOpen}>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="outline" className="w-full justify-between">
                  <span>
                    Cuisine tags
                    {cuisineTags.length > 0 && (
                      <span className="ml-2 text-xs text-muted-foreground">({cuisineTags.length})</span>
                    )}
                  </span>
                  <ChevronsUpDown className="h-4 w-4 opacity-50" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3">
                <div className="flex flex-wrap gap-2">
                  {CUISINE_TAGS.map((tag) => {
                    const active = cuisineTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() =>
                          setCuisineTags((prev) =>
                            active ? prev.filter((t) => t !== tag) : [...prev, tag],
                          )
                        }
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs transition-colors",
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background text-muted-foreground hover:bg-secondary",
                        )}
                      >
                        {tag === "yaai" ? "YAAI" : tag}
                      </button>
                    );
                  })}
                </div>
              </CollapsibleContent>
            </Collapsible>

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

/** One row of tag chips; active ones in the primary colour. */
function TagRow({ label, options, active, onToggle }: {
  label: string; options: readonly string[]; active: string[]; onToggle: (v: string) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onToggle(o)}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
              active.includes(o)
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:bg-secondary",
            )}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}
