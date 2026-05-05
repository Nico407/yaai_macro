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
import { Loader2, Sparkles, Utensils, Carrot, Zap, Plus, Trash2, Search, Settings, Calendar, UserCog, Star } from "lucide-react";
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

  const [editing, setEditing] = useState<MealLog | null>(null);

  const [pickerSlot, setPickerSlot] = useState<Slot | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");

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

    const { error } = await supabase.from("meal_logs").insert({
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
      <div className="mx-auto max-w-3xl px-4 py-8 md:py-12">
        <header className="mb-8 flex items-end justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Today</p>
            <h1 className="font-display text-4xl font-bold md:text-5xl">
              {profile.display_name ? `Hi, ${profile.display_name}` : "Your day"}
            </h1>
          </div>
          <div className="flex items-center gap-2">
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
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <Card className="rounded-2xl p-6 shadow-soft md:p-8">
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            <MacroRing consumed={consumed.kcal} target={target.kcal} label="Calories" unit="kcal" colorVar="--macro-calories" />
            <MacroRing consumed={consumed.protein_g} target={target.protein_g} label="Protein" unit="g" colorVar="--macro-protein" />
            <MacroRing consumed={consumed.carbs_g} target={target.carbs_g} label="Carbs" unit="g" colorVar="--macro-carbs" />
            <MacroRing consumed={consumed.fat_g} target={target.fat_g} label="Fat" unit="g" colorVar="--macro-fat" />
          </div>
        </Card>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
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
        <section className="mt-8">
          <div className="mb-3 flex items-end justify-between">
            <h2 className="font-display text-xl font-bold">Today's plan</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
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
                    className="cursor-pointer rounded-2xl p-4 transition-colors hover:bg-accent/40"
                  >
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{slot}</div>
                    <div className="mt-1 font-semibold">{log.recipe_name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
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
                  className="flex cursor-pointer items-center justify-between rounded-2xl border-dashed p-4 text-muted-foreground transition-colors hover:bg-accent/40"
                >
                  <div>
                    <div className="text-[10px] uppercase tracking-wider">{slot}</div>
                    <div className="mt-1 text-sm">Add a meal</div>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pickerSlot === ("__extra__" as Slot) ? "Add extra" : `Add to ${pickerSlot}`}</DialogTitle>
            <DialogDescription>
              Pick a recipe — we'll auto-scale it to fit your remaining macros.
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={pickerQuery}
              onChange={(e) => setPickerQuery(e.target.value)}
              placeholder="Search recipes…"
              className="pl-9"
            />
          </div>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {recipes.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No recipes yet.{" "}
                <Link to="/recipes" className="underline" onClick={() => setPickerSlot(null)}>
                  Create one
                </Link>
                .
              </p>
            ) : (() => {
              const q = pickerQuery.trim().toLowerCase();
              const filtered = q
                ? recipes.filter(
                    (r) =>
                      r.name.toLowerCase().includes(q) ||
                      (r.description ?? "").toLowerCase().includes(q),
                  )
                : recipes;
              if (filtered.length === 0) {
                return (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No recipes match "{pickerQuery}".
                  </p>
                );
              }
              return filtered.map((r) => (
                <button
                  key={r.id}
                  onClick={() => addRecipeToSlot(r)}
                  disabled={adding}
                  className="w-full rounded-xl border border-border p-3 text-left transition-colors hover:bg-accent/40 disabled:opacity-50"
                >
                  <div className="font-semibold">{r.name}</div>
                  {r.description && (
                    <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{r.description}</div>
                  )}
                </button>
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
    <Card className={`rounded-2xl p-5 ${disabled ? "opacity-60" : ""}`}>
      <div className="mb-2 flex items-center gap-2 text-primary">
        {icon}
        <h3 className="font-display text-lg font-bold">{title}</h3>
      </div>
      <p className="text-sm text-muted-foreground">{desc}</p>
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
