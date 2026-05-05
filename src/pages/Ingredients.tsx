import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useIngredients } from "@/hooks/useIngredients";
import { ArrowLeft, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Ingredient } from "@/hooks/useIngredients";

type OFFHit = {
  code: string;
  name: string;
  brand?: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
};

async function searchOpenFoodFacts(q: string): Promise<OFFHit[]> {
  const url = new URL("https://world.openfoodfacts.org/cgi/search.pl");
  url.searchParams.set("search_terms", q);
  url.searchParams.set("search_simple", "1");
  url.searchParams.set("action", "process");
  url.searchParams.set("json", "1");
  url.searchParams.set("page_size", "12");
  url.searchParams.set(
    "fields",
    "code,product_name,brands,nutriments",
  );
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Search failed");
  const data = await res.json();
  const products: any[] = data.products ?? [];
  return products
    .map((p) => {
      const n = p.nutriments ?? {};
      const kcal =
        Number(n["energy-kcal_100g"]) ||
        (n["energy_100g"] ? Number(n["energy_100g"]) / 4.184 : NaN);
      return {
        code: p.code,
        name: p.product_name || "Unnamed",
        brand: p.brands || undefined,
        kcal,
        protein: Number(n.proteins_100g),
        carbs: Number(n.carbohydrates_100g),
        fat: Number(n.fat_100g),
      } as OFFHit;
    })
    .filter(
      (h) =>
        h.name &&
        Number.isFinite(h.kcal) &&
        Number.isFinite(h.protein) &&
        Number.isFinite(h.carbs) &&
        Number.isFinite(h.fat),
    );
}


export default function Ingredients() {
  const qc = useQueryClient();
  const { data: ingredients = [], isLoading } = useIngredients();
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("");

  const filteredIngredients = ingredients.filter((i) =>
    i.name.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  const [name, setName] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<OFFHit[] | null>(null);

  // 4·P + 4·C + 9·F
  const computedKcal =
    Math.round(
      (parseFloat(protein || "0") * 4 +
        parseFloat(carbs || "0") * 4 +
        parseFloat(fat || "0") * 9) * 10,
    ) / 10;

  function reset() {
    setName(""); setProtein(""); setCarbs(""); setFat("");
  }

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const hits = await searchOpenFoodFacts(query.trim());
      setResults(hits);
      if (hits.length === 0) {
        toast({ title: "No results", description: "Try different keywords." });
      }
    } catch (err: any) {
      toast({ title: "Search failed", description: err.message, variant: "destructive" });
    } finally {
      setSearching(false);
    }
  }

  function pickResult(h: OFFHit) {
    setName(h.brand ? `${h.name} (${h.brand})` : h.name);
    setProtein(String(Math.round(h.protein * 10) / 10));
    setCarbs(String(Math.round(h.carbs * 10) / 10));
    setFat(String(Math.round(h.fat * 10) / 10));
    setResults(null);
    setQuery("");
    toast({ title: "Loaded — review & save below" });
  }

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("ingredients").insert({
      name: name.trim(),
      kcal_per_100g: computedKcal,
      protein_per_100g: parseFloat(protein || "0"),
      carbs_per_100g: parseFloat(carbs || "0"),
      fat_per_100g: parseFloat(fat || "0"),
    });
    setSaving(false);
    if (error) {
      toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
      return;
    }
    await qc.invalidateQueries({ queryKey: ["ingredients"] });
    reset();
    toast({ title: "Ingredient added" });
  }

  async function onDelete(id: string) {
    const { error } = await supabase.from("ingredients").delete().eq("id", id);
    if (error) {
      toast({ title: "Couldn't delete", description: error.message, variant: "destructive" });
      return;
    }
    await qc.invalidateQueries({ queryKey: ["ingredients"] });
  }

  const [editing, setEditing] = useState<Ingredient | null>(null);
  const [editName, setEditName] = useState("");
  const [editProtein, setEditProtein] = useState("");
  const [editCarbs, setEditCarbs] = useState("");
  const [editFat, setEditFat] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const editKcal =
    Math.round(
      (parseFloat(editProtein || "0") * 4 +
        parseFloat(editCarbs || "0") * 4 +
        parseFloat(editFat || "0") * 9) * 10,
    ) / 10;

  function openEdit(ing: Ingredient) {
    setEditing(ing);
    setEditName(ing.name);
    setEditProtein(String(ing.protein_per_100g));
    setEditCarbs(String(ing.carbs_per_100g));
    setEditFat(String(ing.fat_per_100g));
  }

  async function onSaveEdit() {
    if (!editing || !editName.trim()) return;
    setSavingEdit(true);
    const { error } = await supabase
      .from("ingredients")
      .update({
        name: editName.trim(),
        kcal_per_100g: editKcal,
        protein_per_100g: parseFloat(editProtein || "0"),
        carbs_per_100g: parseFloat(editCarbs || "0"),
        fat_per_100g: parseFloat(editFat || "0"),
      })
      .eq("id", editing.id);
    setSavingEdit(false);
    if (error) {
      toast({ title: "Couldn't update", description: error.message, variant: "destructive" });
      return;
    }
    await qc.invalidateQueries({ queryKey: ["ingredients"] });
    setEditing(null);
    toast({ title: "Ingredient updated" });
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 md:py-12">
        <header className="mb-8">
          <Link to="/" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Pantry</p>
          <h1 className="font-display text-4xl font-bold md:text-5xl">Ingredients</h1>
          <p className="mt-2 text-muted-foreground">
            Building blocks for your recipes. Macros are per 100g.
          </p>
        </header>

        <Card className="mb-4 rounded-2xl p-5 shadow-soft md:p-6">
          <form onSubmit={onSearch} className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search foods (e.g. greek yogurt, oats)…"
            />
            <Button type="submit" disabled={searching || !query.trim()}>
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span className="ml-2 hidden sm:inline">Search</span>
            </Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">
            Powered by Open Food Facts. Pick a result to pre-fill the form.
          </p>
          {results && results.length > 0 && (
            <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
              {results.map((h) => (
                <button
                  key={h.code}
                  type="button"
                  onClick={() => pickResult(h)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-background p-3 text-left transition-colors hover:border-primary hover:bg-primary/5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{h.name}</div>
                    {h.brand && (
                      <div className="truncate text-xs text-muted-foreground">{h.brand}</div>
                    )}
                  </div>
                  <div className="shrink-0 text-right text-xs text-muted-foreground">
                    {Math.round(h.kcal)} kcal · P {Math.round(h.protein)} · C {Math.round(h.carbs)} · F{" "}
                    {Math.round(h.fat)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card className="rounded-2xl p-6 shadow-soft md:p-8">
          <form onSubmit={onAdd} className="space-y-4">
            <div>
              <Label htmlFor="ing-name">Name</Label>
              <Input
                id="ing-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Chicken breast"
                className="mt-1.5"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="protein (g)" value={protein} onChange={setProtein} />
              <Field label="carbs (g)" value={carbs} onChange={setCarbs} />
              <Field label="fat (g)" value={fat} onChange={setFat} />
            </div>
            <div className="rounded-lg bg-secondary px-3 py-2 text-sm">
              <span className="text-muted-foreground">Calculated calories: </span>
              <span className="font-display font-bold tabular-nums">{computedKcal}</span>
              <span className="text-muted-foreground"> kcal / 100g</span>
            </div>
            <Button type="submit" disabled={saving || !name.trim() || computedKcal <= 0} className="w-full sm:w-auto">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Add ingredient
            </Button>
          </form>
        </Card>

        <section className="mt-8">
          <h2 className="mb-3 font-display text-xl font-bold">
            Your ingredients{" "}
            <span className="ml-1 text-sm font-normal text-muted-foreground">({ingredients.length})</span>
          </h2>
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : ingredients.length === 0 ? (
            <Card className="rounded-2xl p-8 text-center text-muted-foreground">
              Nothing yet. Add your first ingredient above.
            </Card>
          ) : (
            <>
              <div className="relative mb-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter your ingredients…"
                  className="pl-9"
                />
              </div>
              {filteredIngredients.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No ingredients match "{filter}".
                </p>
              ) : (
                <div className="space-y-2">
                  {filteredIngredients.map((ing) => (
                    <Card key={ing.id} className="flex items-center justify-between gap-3 rounded-xl p-4">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">{ing.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {Math.round(Number(ing.kcal_per_100g))} kcal · P {Number(ing.protein_per_100g)} · C{" "}
                          {Number(ing.carbs_per_100g)} · F {Number(ing.fat_per_100g)} <span className="opacity-60">/ 100g</span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDelete(ing.id)}
                        aria-label={`Delete ${ing.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        inputMode="decimal"
        step="0.1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1"
        placeholder="0"
      />
    </div>
  );
}
