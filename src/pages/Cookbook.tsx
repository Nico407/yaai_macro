import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ArrowLeft, BookOpen, Sparkles, Plus, Search, Clock, ChevronDown, Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useProfile } from "@/hooks/useProfile";
import { useTodayLogs } from "@/hooks/useTodayLogs";
import { sumMacros, remaining as calcRemaining } from "@/lib/macros";
import { supabase } from "@/integrations/supabase/client";
import { balancedGramsForShare, clampGrams, type PerGram } from "@/lib/scaling";
import { toast } from "sonner";
import chickenRiceImg from "@/assets/cookbook/chicken-rice.jpg";
import proteinOatsImg from "@/assets/cookbook/protein-oats.jpg";
import salmonVegImg from "@/assets/cookbook/salmon-veg.jpg";

const SLOTS = ["Breakfast", "Lunch", "Dinner", "Snack"] as const;
type Slot = (typeof SLOTS)[number];

type CookbookItem = {
  id: string;
  name: string;
  desc: string;
  kcal: number;
  p: number;
  c: number;
  f: number;
  image: string;
  cookTimeMin: number;
  ingredients: string[];
  instructions: string[];
};

const COOKBOOK: CookbookItem[] = [
  {
    id: "cb-chicken-rice",
    name: "Chicken & rice bowl",
    desc: "Lean protein staple, easy to scale.",
    kcal: 520,
    p: 45,
    c: 60,
    f: 10,
    image: chickenRiceImg,
    cookTimeMin: 25,
    ingredients: [
      "180g chicken breast",
      "150g cooked white rice",
      "100g broccoli florets",
      "1 tsp olive oil",
      "Salt, pepper, paprika",
    ],
    instructions: [
      "Season chicken with salt, pepper and paprika.",
      "Sear in olive oil over medium heat for 5–6 min per side until cooked through.",
      "Steam broccoli for 4 minutes until bright green and tender.",
      "Plate rice, slice chicken on top, add broccoli on the side.",
    ],
  },
  {
    id: "cb-oats-protein",
    name: "Protein oats",
    desc: "Breakfast that actually fills you up.",
    kcal: 430,
    p: 35,
    c: 55,
    f: 9,
    image: proteinOatsImg,
    cookTimeMin: 8,
    ingredients: [
      "60g rolled oats",
      "250ml milk (or alt)",
      "1 scoop whey protein (~30g)",
      "1 tbsp peanut butter",
      "Handful of berries",
    ],
    instructions: [
      "Simmer oats with milk for 4–5 minutes, stirring.",
      "Remove from heat and let cool 1 minute, then stir in protein powder.",
      "Top with peanut butter and fresh berries.",
    ],
  },
  {
    id: "cb-salmon-veg",
    name: "Salmon & veg tray",
    desc: "Omega-3s, easy macros, one pan.",
    kcal: 580,
    p: 42,
    c: 30,
    f: 28,
    image: salmonVegImg,
    cookTimeMin: 30,
    ingredients: [
      "200g salmon fillet",
      "200g mixed vegetables (peppers, zucchini, sweet potato)",
      "1 tbsp olive oil",
      "Lemon, garlic, rosemary",
      "Salt and pepper",
    ],
    instructions: [
      "Preheat oven to 200°C (400°F).",
      "Toss vegetables with olive oil, garlic, salt and pepper on a sheet pan.",
      "Roast for 15 minutes, then add the salmon fillet skin-side down.",
      "Top salmon with lemon slices and rosemary, roast another 12–14 minutes.",
    ],
  },
];

export default function Cookbook() {
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const { data: logs = [] } = useTodayLogs();
  const [picking, setPicking] = useState<CookbookItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem("cookbook_favorites");
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  });

  function toggleFavorite(id: string) {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem("cookbook_favorites", JSON.stringify(Array.from(next)));
      } catch {
        // ignore
      }
      return next;
    });
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COOKBOOK;
    return COOKBOOK.filter(
      (r) => r.name.toLowerCase().includes(q) || r.desc.toLowerCase().includes(q),
    );
  }, [query]);

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

  async function addToSlot(item: CookbookItem, slot: Slot | "__extra__") {
    // Cookbook items list macros for the default 100g serving — treat as per-gram basis
    const perGram: PerGram = {
      kcal: item.kcal / 100,
      protein_g: item.p / 100,
      carbs_g: item.c / 100,
      fat_g: item.f / 100,
    };
    let grams = 100;
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
      grams = clampGrams(raw || 100, 30, 5000);
    }

    setBusy(true);

    if (target && scalableCount > 0) {
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
          setBusy(false);
          toast.error("Couldn't rescale meals", { description: upErr.message });
          return;
        }
      }
    }

    const { error } = await supabase.from("meal_logs").insert({
      recipe_id: null,
      recipe_name: item.name,
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
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 md:py-12">
        <header className="mb-8">
          <Link to="/plan" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Free library</p>
          <h1 className="font-display text-4xl font-bold md:text-5xl">Cook Book</h1>
          <p className="mt-2 text-sm text-muted-foreground">A starter set of recipes — more arrive with country packs.</p>
        </header>

        <Card className="mb-6 flex items-start gap-3 rounded-2xl border-dashed bg-secondary/40 p-4">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-sm text-muted-foreground">
            Tap "Add to plan" — we'll auto-scale the dish to fit your remaining macros.
          </p>
        </Card>

        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search meals…"
            className="pl-9"
          />
        </div>

        <div className="space-y-3">
          {filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No meals match "{query}".
            </p>
          ) : (
            filtered.map((r) => {
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
                      <div className="flex items-center gap-2">
                        <div className="font-display text-lg font-bold">{r.name}</div>
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
                        />
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {r.cookTimeMin} min
                        </span>
                        <span>{r.kcal} kcal</span>
                        <span className="basis-full" />
                        <span>
                          P {r.p} · C {r.c} · F {r.f}
                        </span>
                      </div>
                      <div className="mt-1.5 text-xs text-muted-foreground">{r.desc}</div>
                      <div className="mt-3">
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPicking(r);
                          }}
                          className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
                        >
                          <Plus className="mr-1 h-4 w-4" /> Add to plan
                        </Button>
                      </div>
                    </div>
                    <img
                      src={r.image}
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
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(r.id);
                          }}
                          className="rounded-xl"
                          aria-label={favorites.has(r.id) ? "Remove from favorites" : "Add to favorites"}
                        >
                          <Star
                            className={`mr-1 h-4 w-4 ${favorites.has(r.id) ? "fill-yellow-400 text-yellow-400" : ""}`}
                          />
                          {favorites.has(r.id) ? "Favorited" : "Favorite"}
                        </Button>
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPicking(r);
                          }}
                          className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
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
    </div>
  );
}
