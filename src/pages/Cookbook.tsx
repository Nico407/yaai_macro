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
import { ArrowLeft, BookOpen, Sparkles, Plus } from "lucide-react";
import { useProfile } from "@/hooks/useProfile";
import { useTodayLogs } from "@/hooks/useTodayLogs";
import { sumMacros, remaining as calcRemaining } from "@/lib/macros";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
};

const COOKBOOK: CookbookItem[] = [
  { id: "cb-chicken-rice", name: "Chicken & rice bowl", desc: "Lean protein staple, easy to scale.", kcal: 520, p: 45, c: 60, f: 10 },
  { id: "cb-oats-protein", name: "Protein oats", desc: "Breakfast that actually fills you up.", kcal: 430, p: 35, c: 55, f: 9 },
  { id: "cb-salmon-veg", name: "Salmon & veg tray", desc: "Omega-3s, easy macros, one pan.", kcal: 580, p: 42, c: 30, f: 28 },
];

export default function Cookbook() {
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const { data: logs = [] } = useTodayLogs();
  const [picking, setPicking] = useState<CookbookItem | null>(null);
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

  async function addToSlot(item: CookbookItem, slot: Slot | "__extra__") {
    let factor = 1;
    if (target) {
      const left = calcRemaining(target, consumed);
      const share = emptySlots > 0 ? left.kcal / emptySlots : left.kcal;
      if (share > 0 && item.kcal > 0) {
        factor = Math.max(0.5, Math.min(2, share / item.kcal));
      }
    }
    setBusy(true);
    const { error } = await supabase.from("meal_logs").insert({
      recipe_id: null,
      recipe_name: item.name,
      total_grams: Math.round(100 * factor),
      kcal: Math.round(item.kcal * factor),
      protein_g: Math.round(item.p * factor * 10) / 10,
      carbs_g: Math.round(item.c * factor * 10) / 10,
      fat_g: Math.round(item.f * factor * 10) / 10,
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

        <div className="space-y-3">
          {COOKBOOK.map((r) => (
            <Card key={r.id} className="rounded-2xl p-5">
              <div className="flex items-start gap-3">
                <BookOpen className="mt-1 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="font-display text-lg font-bold">{r.name}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{r.desc}</div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {r.kcal} kcal · P {r.p} · C {r.c} · F {r.f}
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => setPicking(r)}
                  className="shrink-0 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  <Plus className="mr-1 h-4 w-4" /> Add to plan
                </Button>
              </div>
            </Card>
          ))}
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
