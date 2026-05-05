import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useRecipes } from "@/hooks/useRecipes";
import { ArrowLeft, Loader2, Plus, Utensils } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export default function Recipes() {
  const { data: recipes = [], isLoading } = useRecipes();
  const qc = useQueryClient();

  async function onDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"?`)) return;
    await supabase.from("recipe_ingredients").delete().eq("recipe_id", id);
    const { error } = await supabase.from("recipes").delete().eq("id", id);
    if (error) {
      toast({ title: "Couldn't delete", description: error.message, variant: "destructive" });
      return;
    }
    await qc.invalidateQueries({ queryKey: ["recipes"] });
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 md:py-12">
        <header className="mb-8">
          <Link to="/" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Cookbook</p>
              <h1 className="font-display text-4xl font-bold md:text-5xl">Recipes</h1>
            </div>
            <Button asChild>
              <Link to="/recipes/new">
                <Plus className="mr-1 h-4 w-4" /> New
              </Link>
            </Button>
          </div>
        </header>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : recipes.length === 0 ? (
          <Card className="rounded-2xl p-10 text-center">
            <Utensils className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-muted-foreground">No recipes yet.</p>
            <Button asChild className="mt-4">
              <Link to="/recipes/new">
                <Plus className="mr-1 h-4 w-4" /> Build your first recipe
              </Link>
            </Button>
          </Card>
        ) : (
          <div className="space-y-3">
            {recipes.map((r) => {
              const total = r.default_serving_g;
              let kcal = 0,
                protein = 0,
                carbs = 0,
                fat = 0;
              r.recipe_ingredients.forEach((ri) => {
                const g = Number(ri.ratio) * total;
                const ing = ri.ingredient;
                kcal += (Number(ing.kcal_per_100g) * g) / 100;
                protein += (Number(ing.protein_per_100g) * g) / 100;
                carbs += (Number(ing.carbs_per_100g) * g) / 100;
                fat += (Number(ing.fat_per_100g) * g) / 100;
              });
              return (
                <Card key={r.id} className="rounded-2xl p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-display text-lg font-bold">{r.name}</div>
                      {r.description && (
                        <div className="mt-0.5 text-xs text-muted-foreground">{r.description}</div>
                      )}
                      <div className="mt-2 text-xs text-muted-foreground">
                        {r.recipe_ingredients.length} ingredients · {Math.round(total)}g batch
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {Math.round(kcal)} kcal · P {Math.round(protein)} · C {Math.round(carbs)} · F{" "}
                        {Math.round(fat)}
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => onDelete(r.id, r.name)}>
                      Delete
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
