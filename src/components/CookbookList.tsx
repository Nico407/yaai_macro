import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { BookOpen, Plus, Search, Clock, ChevronDown, Star, Check } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { localDateISO } from "@/lib/dates";
import { useTodayLogs } from "@/hooks/useTodayLogs";
import { useProfile } from "@/hooks/useProfile";
import { balancedGramsForShare, clampGrams, type PerGram, rescaledLog, cookbookPerGram, cookbookServing } from "@/lib/scaling";
import { matchesByKeywords, hasAnyPrefs, type ProfilePrefs } from "@/lib/dietary";
import { toast } from "sonner";
import type { CookbookRecipe } from "@/hooks/useCookbookRecipes";
import chickenRiceImg from "@/assets/cookbook/chicken-rice.jpg";
import proteinOatsImg from "@/assets/cookbook/protein-oats.jpg";
import salmonVegImg from "@/assets/cookbook/salmon-veg.jpg";

const SLOTS = ["Breakfast", "Lunch", "Dinner", "Snack"] as const;
type Slot = (typeof SLOTS)[number];

const FALLBACK_IMAGES = [chickenRiceImg, proteinOatsImg, salmonVegImg];
function imageFor(r: CookbookRecipe, idx: number): string {
  if (r.image_url) return r.image_url;
  // stable fallback based on id hash so each card keeps the same image
  const hash = Array.from(r.id).reduce((s, c) => s + c.charCodeAt(0), 0);
  return FALLBACK_IMAGES[(hash + idx) % FALLBACK_IMAGES.length];
}

/** bare: the page around it does the searching and filtering (Plan my meals), so no own search box or prefs switch,
 *  and nothing is printed when the list is empty. */
export function CookbookList({ recipes, bare = false }: { recipes: CookbookRecipe[]; bare?: boolean }) {
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const { data: logs = [] } = useTodayLogs();
  const [picking, setPicking] = useState<CookbookRecipe | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [favTogglingId, setFavTogglingId] = useState<string | null>(null);
  const [hideNonMatching, setHideNonMatching] = useState(true);

  const prefs: ProfilePrefs = {
    nutrition_preference: (profile as { nutrition_preference?: string } | undefined)?.nutrition_preference ?? null,
    dietary_restrictions: (profile as { dietary_restrictions?: string[] } | undefined)?.dietary_restrictions ?? [],
  };
  const prefsActive = hasAnyPrefs(prefs);

  const matchMap = useMemo(() => {
    const m = new Map<string, boolean>();
    recipes.forEach((r) => m.set(r.id, matchesByKeywords(r.ingredients, prefs)));
    return m;
  }, [recipes, prefs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = recipes;
    if (q) {
      list = list.filter(
        (r) => r.name.toLowerCase().includes(q) || (r.description ?? "").toLowerCase().includes(q),
      );
    }
    if (prefsActive && hideNonMatching && !bare) {
      list = list.filter((r) => matchMap.get(r.id));
    }
    return list;
  }, [query, recipes, prefsActive, hideNonMatching, matchMap]);

  const target = profile?.target_calories
    ? {
        kcal: Number(profile.target_calories),
        protein_g: Number(profile.target_protein_g ?? 0),
        carbs_g: Number(profile.target_carbs_g ?? 0),
        fat_g: Number(profile.target_fat_g ?? 0),
      }
    : null;

  const usedSlots = new Set(logs.map((l) => l.slot).filter(Boolean));

  async function toggleFavorite(r: CookbookRecipe) {
    setFavTogglingId(r.id);
    const { error } = await supabase
      .from("cookbook_recipes")
      .update({ is_favorite: !r.is_favorite })
      .eq("id", r.id);
    setFavTogglingId(null);
    if (error) {
      toast.error("Couldn't update favorite", { description: error.message });
      return;
    }
    await qc.invalidateQueries({ queryKey: ["cookbook_recipes"] });
  }

  async function addToSlot(item: CookbookRecipe, slot: Slot | "__extra__") {
    // the cook book's macros are per serving: per gram is macros / serving weight (not / 100)
    const perGram: PerGram = cookbookPerGram(item);
    let grams = cookbookServing(item);
    let share = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
    let scalableCount = 0;
    if (target) {
      const scalableLogs = logs.filter((l) => !l.is_fixed);
      const fixedLogs = logs.filter((l) => l.is_fixed);
      const fixedConsumed = {
        kcal: fixedLogs.reduce((s, l) => s + Number(l.kcal), 0),
        protein_g: fixedLogs.reduce((s, l) => s + Number(l.protein_g), 0),
        carbs_g: fixedLogs.reduce((s, l) => s + Number(l.carbs_g), 0),
        fat_g: fixedLogs.reduce((s, l) => s + Number(l.fat_g), 0),
      };
      scalableCount = scalableLogs.length + 1;
      const denom = Math.max(1, scalableCount);
      share = {
        kcal: Math.max(0, target.kcal - fixedConsumed.kcal) / denom,
        protein_g: Math.max(0, target.protein_g - fixedConsumed.protein_g) / denom,
        carbs_g: Math.max(0, target.carbs_g - fixedConsumed.carbs_g) / denom,
        fat_g: Math.max(0, target.fat_g - fixedConsumed.fat_g) / denom,
      };
      const raw = balancedGramsForShare(perGram, share);
      grams = clampGrams(raw || cookbookServing(item), 30, 5000);
    }

    setBusy(true);

    if (target && scalableCount > 0) {
      const scalableLogs = logs.filter((l) => !l.is_fixed);
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
      recipe_id: null,
      recipe_name: item.name,
      log_date: localDateISO(),   // today in Swiss time (the database default is UTC)
      total_grams: Math.round(grams),
      kcal: Math.round(perGram.kcal * grams),
      protein_g: Math.round(perGram.protein_g * grams * 10) / 10,
      carbs_g: Math.round(perGram.carbs_g * grams * 10) / 10,
      fat_g: Math.round(perGram.fat_g * grams * 10) / 10,
      slot: slot === "__extra__" ? null : slot,
    });
    setBusy(false);
    if (error) {
      toast.error("Couldn't add", { description: error.message });
      return;
    }
    setPicking(null);
    await qc.invalidateQueries({ queryKey: ["meal_logs"] });
    toast.success(`${item.name} added${slot !== "__extra__" ? ` to ${slot}` : ""}`);
  }

  return (
    <>
      {!bare && <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search meals…"
          className="pl-9"
        />
      </div>}

      {prefsActive && !bare && (
        <div className="mb-4 flex items-center justify-between rounded-xl border bg-secondary/40 px-4 py-2.5">
          <Label htmlFor="cb-hide" className="text-sm">
            Hide meals that don't match my prefs
          </Label>
          <Switch id="cb-hide" checked={hideNonMatching} onCheckedChange={setHideNonMatching} />
        </div>
      )}
      <div className="space-y-3">
        {filtered.length === 0 && bare ? null : filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No meals match "{query}".
          </p>
        ) : (
          filtered.map((r, idx) => {
            const expanded = expandedId === r.id;
            return (
              <Card key={r.id} className="overflow-hidden rounded-2xl">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setExpandedId(expanded ? null : r.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setExpandedId(expanded ? null : r.id);
                    }
                  }}
                  className="flex w-full cursor-pointer items-start gap-4 p-5 text-left transition-colors hover:bg-secondary/40"
                  aria-expanded={expanded}
                >
                  <BookOpen className="mt-1 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-display text-lg font-bold">{r.name}</div>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
                      />
                      {prefsActive && matchMap.get(r.id) && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent dark:text-emerald-400">
                          <Check className="h-3 w-3" /> matches your prefs
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {r.cook_time_min} min
                      </span>
                      <span>{r.kcal} kcal</span>
                      <span className="basis-full" />
                      <span>
                        P {r.protein_g} · C {r.carbs_g} · F {r.fat_g}
                      </span>
                    </div>
                    {r.description && (
                      <div className="mt-1.5 text-xs text-muted-foreground">{r.description}</div>
                    )}
                    <div className="mt-3">
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPicking(r);
                        }}
                        className="rounded-xl bg-accent text-accent-foreground hover:bg-accent/90"
                      >
                        <Plus className="mr-1 h-4 w-4" /> Add to plan
                      </Button>
                    </div>
                  </div>
                  <img
                    src={imageFor(r, idx)}
                    alt={r.name}
                    loading="lazy"
                    width={512}
                    height={512}
                    className="aspect-square w-28 shrink-0 rounded-xl object-cover sm:w-32"
                  />
                </div>

                {expanded && (
                  <div className="border-t bg-secondary/20 px-5 py-5">
                    <div className="grid gap-5 md:grid-cols-2">
                      <div>
                        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Ingredients
                        </h4>
                        <ul className="space-y-1 text-sm">
                          {r.ingredients.map((ing, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="text-muted-foreground">•</span>
                              <span>{ing}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Instructions
                        </h4>
                        <ol className="space-y-2 text-sm">
                          {r.instructions.map((step, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="font-semibold text-primary">{i + 1}.</span>
                              <span>{step}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    </div>
                    <div className="mt-5 flex items-center justify-between gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={favTogglingId === r.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(r);
                        }}
                        className="rounded-xl"
                        aria-label={r.is_favorite ? "Remove from favorites" : "Add to favorites"}
                      >
                        <Star
                          className={`mr-1 h-4 w-4 ${r.is_favorite ? "fill-yellow-400 text-yellow-400" : ""}`}
                        />
                        {r.is_favorite ? "Favorited" : "Favorite"}
                      </Button>
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPicking(r);
                        }}
                        className="rounded-xl bg-accent text-accent-foreground hover:bg-accent/90"
                      >
                        <Plus className="mr-1 h-4 w-4" /> Add to plan
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>

      <Dialog open={!!picking} onOpenChange={(o) => !o && setPicking(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add {picking?.name}</DialogTitle>
            <DialogDescription>
              Pick a slot — we'll auto-scale to fit your remaining macros.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {SLOTS.map((s) => {
              const taken = usedSlots.has(s);
              return (
                <Button
                  key={s}
                  variant="outline"
                  disabled={busy}
                  onClick={() => picking && addToSlot(picking, s)}
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
            onClick={() => picking && addToSlot(picking, "__extra__")}
            className="w-full"
          >
            <Plus className="mr-1 h-4 w-4" /> Add as extra
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
