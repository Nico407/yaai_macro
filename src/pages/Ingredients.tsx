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
import { ArrowLeft, Loader2, Plus, Search, Trash2 } from "lucide-react";

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

  const [name, setName] = useState("");
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<OFFHit[] | null>(null);

  function reset() {
    setName(""); setKcal(""); setProtein(""); setCarbs(""); setFat("");
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
    setKcal(String(Math.round(h.kcal)));
    setProtein(String(Math.round(h.protein * 10) / 10));
    setCarbs(String(Math.round(h.carbs * 10) / 10));
    setFat(String(Math.round(h.fat * 10) / 10));
    setResults(null);
    setQuery("");
    toast({ title: "Loaded — review & save below" });
  }

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !kcal) return;
    setSaving(true);
    const { error } = await supabase.from("ingredients").insert({
      name: name.trim(),
      kcal_per_100g: parseFloat(kcal),
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
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Field label="kcal / 100g" value={kcal} onChange={setKcal} />
              <Field label="protein (g)" value={protein} onChange={setProtein} />
              <Field label="carbs (g)" value={carbs} onChange={setCarbs} />
              <Field label="fat (g)" value={fat} onChange={setFat} />
            </div>
            <Button type="submit" disabled={saving || !name.trim() || !kcal} className="w-full sm:w-auto">
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
            <div className="space-y-2">
              {ingredients.map((ing) => (
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
