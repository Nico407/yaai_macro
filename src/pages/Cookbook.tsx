import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Sparkles } from "lucide-react";
import { useCookbookRecipes } from "@/hooks/useCookbookRecipes";
import { CookbookList } from "@/components/CookbookList";

export default function Cookbook() {
  const { data: recipes = [], isLoading } = useCookbookRecipes(null);

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

        {isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
        ) : (
          <CookbookList recipes={recipes} />
        )}
      </div>
    </div>
  );
}
