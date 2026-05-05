import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { ArrowLeft, BookOpen, ChefHat, Globe, Lock } from "lucide-react";

export default function RecipesHub() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 md:py-12">
        <header className="mb-8">
          <Link
            to="/"
            className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
            Cookbook
          </p>
          <h1 className="font-display text-4xl font-bold md:text-5xl">Recipes</h1>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          <HubCard
            to="/recipes/cookbook"
            icon={<BookOpen className="h-5 w-5" />}
            title="Cook Book"
            desc="A free starter library of macro-friendly recipes."
          />
          <HubCard
            to="/recipes/mine"
            icon={<ChefHat className="h-5 w-5" />}
            title="My creations"
            desc="Recipes you've built from your own pantry."
          />
          <HubCard
            to="/recipes/countries"
            icon={<Globe className="h-5 w-5" />}
            title="Add countries"
            desc="Unlock recipe packs from around the world."
            tag="Coming soon"
            locked
          />
        </div>
      </div>
    </div>
  );
}

function HubCard({
  to,
  icon,
  title,
  desc,
  tag,
  locked,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  tag?: string;
  locked?: boolean;
}) {
  return (
    <Link to={to} className="block">
      <Card className="group relative h-full rounded-2xl p-5 transition-colors hover:border-primary/40">
        <div className="mb-2 flex items-center gap-2 text-primary">
          {icon}
          <h3 className="font-display text-lg font-bold">{title}</h3>
          {locked && (
            <Lock className="ml-auto h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <p className="text-sm text-muted-foreground">{desc}</p>
        {tag && (
          <span className="mt-3 inline-block rounded-full bg-secondary px-2 py-0.5 text-[10px] uppercase tracking-wider">
            {tag}
          </span>
        )}
      </Card>
    </Link>
  );
}
