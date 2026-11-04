import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useIngredients, DIETARY_TAGS } from "@/hooks/useIngredients";
import { ArrowLeft, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Ingredient } from "@/hooks/useIngredients";
import { sameFood, searchIngredients } from "@/lib/ingredientSearch";

function TagPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  function toggle(t: string) {
    onChange(value.includes(t) ? value.filter((x) => x !== t) : [...value, t]);
  }
  return (
    <div>
      <Label className="text-xs">Dietary tags</Label>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {DIETARY_TAGS.map((t) => {
          const active = value.includes(t);
          return (
            <button
              type="button"
              key={t}
              onClick={() => toggle(t)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-input bg-background hover:bg-muted"
              }`}
            >
              {t.replace("contains_", "+ ")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type OFFHit = {
  code: string;
  name: string;
  brand?: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre?: number;
  salt?: number;
};

const OFF_FIELDS = "code,product_name,brands,nutriments";

function toHit(p: any): OFFHit {
  const n = p.nutriments ?? {};
  const kcal = Number(n["energy-kcal_100g"]) || (n["energy_100g"] ? Number(n["energy_100g"]) / 4.184 : NaN);
  return {
    code: String(p.code ?? ""),
    name: p.product_name || "Unnamed",
    brand: p.brands ? String(p.brands).split(",")[0].trim() : undefined,
    kcal,
    protein: Number(n.proteins_100g),
    carbs: Number(n.carbohydrates_100g),
    fat: Number(n.fat_100g),
    fibre: Number.isFinite(Number(n.fiber_100g)) && n.fiber_100g !== undefined ? Number(n.fiber_100g) : undefined,
    salt: Number.isFinite(Number(n.salt_100g)) && n.salt_100g !== undefined ? Number(n.salt_100g) : undefined,
  };
}
const complete = (h: OFFHit) =>
  !!h.code && !!h.name && [h.kcal, h.protein, h.carbs, h.fat].every((x) => Number.isFinite(x));

/** Open Food Facts: a barcode (8-14 digits) is looked up directly; words search products sold in Switzerland
 *  first, then everywhere if that finds nothing. */
async function searchOpenFoodFacts(q: string): Promise<OFFHit[]> {
  if (/^\d{8,14}$/.test(q)) {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${q}.json?fields=${OFF_FIELDS}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.status === 1 && data.product ? [toHit({ code: q, ...data.product })].filter(complete) : [];
  }
  const run = async (swiss: boolean) => {
    const url = new URL("https://world.openfoodfacts.org/cgi/search.pl");
    url.searchParams.set("search_terms", q);
    url.searchParams.set("search_simple", "1");
    url.searchParams.set("action", "process");
    url.searchParams.set("json", "1");
    url.searchParams.set("page_size", "12");
    url.searchParams.set("fields", OFF_FIELDS);
    if (swiss) {
      url.searchParams.set("tagtype_0", "countries");
      url.searchParams.set("tag_contains_0", "contains");
      url.searchParams.set("tag_0", "switzerland");
    }
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error("Search failed");
    const data = await res.json();
    return ((data.products ?? []) as any[]).map(toHit).filter(complete);
  };
  const ch = await run(true);
  return ch.length ? ch : run(false);
}


export default function Ingredients() {
  const qc = useQueryClient();
  const { data: ingredients = [], isLoading } = useIngredients();
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("");

  // ~800 with the Swiss foods: search English and German names, show the best 150
  const matching = filter.trim() ? searchIngredients(ingredients, filter, 10000) : ingredients;
  const filteredIngredients = matching.slice(0, 150);

  const [name, setName] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [fibre, setFibre] = useState("");
  const [salt, setSalt] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<OFFHit[] | null>(null);
  const [picked, setPicked] = useState<OFFHit | null>(null);       // the product the form was filled from
  // your ingredients that match what's typed in the search: use one of these instead of adding a copy
  const yours = query.trim().length >= 2 && !/^\d+$/.test(query.trim()) ? searchIngredients(ingredients, query, 6) : [];
  const byBarcode = new Map(ingredients.filter((i) => i.source === "off" && i.source_id).map((i) => [i.source_id!, i]));
  const sameAsName = name.trim() ? ingredients.find((i) => sameFood(i.name, name)) : undefined;

  // 4·P + 4·C + 9·F
  const computedKcal =
    Math.round(
      (parseFloat(protein || "0") * 4 +
        parseFloat(carbs || "0") * 4 +
        parseFloat(fat || "0") * 9) * 10,
    ) / 10;

  function reset() {
    setName(""); setProtein(""); setCarbs(""); setFat(""); setFibre(""); setSalt(""); setTags([]); setPicked(null);
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
    const have = byBarcode.get(h.code);
    if (have) {
      toast({ title: "Already in your list", description: have.name });
      return;
    }
    setPicked(h);
    setName(h.brand ? `${h.name} (${h.brand})` : h.name);
    setProtein(String(Math.round(h.protein * 10) / 10));
    setCarbs(String(Math.round(h.carbs * 10) / 10));
    setFat(String(Math.round(h.fat * 10) / 10));
    setFibre(h.fibre !== undefined ? String(Math.round(h.fibre * 10) / 10) : "");
    setSalt(h.salt !== undefined ? String(Math.round(h.salt * 100) / 100) : "");
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
      fibre_per_100g: optNum(fibre),
      salt_per_100g: optNum(salt),
      dietary_tags: tags,
      // a product from Open Food Facts keeps its barcode, so it can't be added twice
      ...(picked ? { source: "off", source_id: picked.code } : {}),
    });
    setSaving(false);
    if (error) {
      const dup = error.code === "23505";
      toast({ title: dup ? "Already in your list" : "Couldn't save", description: dup ? "That product is saved already." : error.message, variant: "destructive" });
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
  const [editFibre, setEditFibre] = useState("");
  const [editSalt, setEditSalt] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
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
    setEditFibre(ing.fibre_per_100g == null ? "" : String(ing.fibre_per_100g));
    setEditSalt(ing.salt_per_100g == null ? "" : String(ing.salt_per_100g));
    setEditTags(ing.dietary_tags ?? []);
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
        fibre_per_100g: optNum(editFibre),
        salt_per_100g: optNum(editSalt),
        dietary_tags: editTags,
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
              placeholder="Search foods or type a barcode (e.g. greek yogurt, 7610…)"
            />
            <Button type="submit" disabled={searching || !query.trim()}>
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span className="ml-2 hidden sm:inline">Search</span>
            </Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">
            Products from Open Food Facts (Swiss first). Pick one to pre-fill the form, check the values, save.
          </p>
          {yours.length > 0 && (
            <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-2.5">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-primary">Already in your list</div>
              {yours.map((i) => (
                <div key={i.id} className="flex items-center justify-between gap-3 py-0.5 text-sm">
                  <span className="truncate">{i.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {Math.round(Number(i.kcal_per_100g))} kcal · P {Number(i.protein_per_100g)}
                  </span>
                </div>
              ))}
            </div>
          )}
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
                  {byBarcode.has(h.code) && (
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">saved</span>
                  )}
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
            <div className="grid grid-cols-3 gap-3">
              <Field label="fibre (g)" value={fibre} onChange={setFibre} placeholder="–" />
              <Field label="salt (g)" value={salt} onChange={setSalt} placeholder="–" />
              <p className="self-end pb-2 text-[11px] text-muted-foreground">Optional. Empty = not known.</p>
            </div>
            <TagPicker value={tags} onChange={setTags} />
            {sameAsName && (
              <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
                You already have <span className="font-semibold">{sameAsName.name}</span>. Use that one in your recipes, or
                save this anyway if it's a different product.
              </p>
            )}
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
                  placeholder="Filter your ingredients (English or German)…"
                  className="pl-9"
                />
              </div>
              {filteredIngredients.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No ingredients match "{filter}".
                </p>
              ) : (
                <div className="space-y-2">
                  {matching.length > filteredIngredients.length && (
                    <p className="text-xs text-muted-foreground">
                      Showing {filteredIngredients.length} of {matching.length}. Type to narrow it down.
                    </p>
                  )}
                  {filteredIngredients.map((ing) => (
                    <Card key={ing.id} className="flex items-center justify-between gap-3 rounded-xl p-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-semibold">{ing.name}</span>
                          {ing.source && (
                            <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground"
                              title={ing.source === "off" ? `Open Food Facts · ${ing.source_id}` : "Swiss Food Composition Database (FSVO)"}>
                              {ing.source === "off" ? "OFF" : "CH"}
                            </span>
                          )}
                        </div>
                        {ing.name_de && <div className="truncate text-xs text-muted-foreground">{ing.name_de}</div>}
                        <div className="text-xs text-muted-foreground">
                          {Math.round(Number(ing.kcal_per_100g))} kcal · P {Number(ing.protein_per_100g)} · C{" "}
                          {Number(ing.carbs_per_100g)} · F {Number(ing.fat_per_100g)}
                          {ing.fibre_per_100g != null && <> · fibre {Number(ing.fibre_per_100g)}</>}
                          {ing.salt_per_100g != null && <> · salt {Number(ing.salt_per_100g)}</>}
                          <span className="opacity-60"> / 100g</span>
                        </div>
                        {ing.dietary_tags && ing.dietary_tags.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {ing.dietary_tags.map((t) => (
                              <span key={t} className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                {t.replace("contains_", "+ ")}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(ing)}
                        aria-label={`Edit ${ing.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
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

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit ingredient</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-ing-name">Name</Label>
              <Input
                id="edit-ing-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="protein (g)" value={editProtein} onChange={setEditProtein} />
              <Field label="carbs (g)" value={editCarbs} onChange={setEditCarbs} />
              <Field label="fat (g)" value={editFat} onChange={setEditFat} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="fibre (g)" value={editFibre} onChange={setEditFibre} placeholder="–" />
              <Field label="salt (g)" value={editSalt} onChange={setEditSalt} placeholder="–" />
            </div>
            <TagPicker value={editTags} onChange={setEditTags} />
            <div className="rounded-lg bg-secondary px-3 py-2 text-sm">
              <span className="text-muted-foreground">Calculated calories: </span>
              <span className="font-display font-bold tabular-nums">{editKcal}</span>
              <span className="text-muted-foreground"> kcal / 100g</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={onSaveEdit} disabled={savingEdit || !editName.trim() || editKcal <= 0}>
              {savingEdit && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** "" -> null (not known), else the number */
const optNum = (v: string) => (v.trim() === "" || !Number.isFinite(parseFloat(v)) ? null : parseFloat(v));

function Field({
  label,
  value,
  onChange,
  placeholder = "0",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
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
        placeholder={placeholder}
      />
    </div>
  );
}
