import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useRecipes } from "@/hooks/useRecipes";
import { ArrowLeft, Loader2, Pencil, Plus, Utensils } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Recipes() {
  const { data: recipes = [], isLoading } = useRecipes();
  const [editMode, setEditMode] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 md:py-12">
        <header className="mb-8">
          <Link to="/recipes" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Your library</p>
              <h1 className="font-display text-4xl font-bold md:text-5xl">My creations</h1>
            </div>
            <div className="flex flex-col gap-2">
              <Button asChild>
                <Link to="/recipes/new">
                  <Plus className="mr-1 h-4 w-4" /> New
                </Link>
              </Button>
              <Button
                variant={editMode ? "default" : "outline"}
                onClick={() => setEditMode((v) => !v)}
              >
                <Pencil className="mr-1 h-4 w-4" />
                {editMode ? "Done" : "Edit"}
              </Button>
            </div>
          </div>
          {editMode && (
            <p className="mt-3 text-xs text-muted-foreground">
              Tap any recipe to edit it. Tap <strong>Done</strong> to exit edit mode.
            </p>
          )}
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
              const target = editMode ? `/recipes/${r.id}/edit` : `/recipes/${r.id}/scale`;
              return (
                <Link key={r.id} to={target} className="block">
                  <Card
                    className={cn(
                      "rounded-2xl p-5 transition-colors",
                      editMode
                        ? "border-primary/40 bg-primary/5 hover:border-primary"
                        : "hover:border-primary/40",
                    )}
                  >
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
                      {editMode && (
                        <Pencil className="h-4 w-4 shrink-0 text-primary" />
                      )}
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
