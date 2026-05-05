import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useProfile } from "@/hooks/useProfile";
import { useTodayLogs } from "@/hooks/useTodayLogs";
import { sumMacros, remaining as calcRemaining } from "@/lib/macros";
import { MacroRing } from "@/components/MacroRing";
import { Loader2, Sparkles, Utensils, Carrot, Zap } from "lucide-react";

export default function Index() {
  const { data: profile, isLoading } = useProfile();
  const { data: logs = [] } = useTodayLogs();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!profile || !profile.target_calories) {
    return <Welcome />;
  }

  const consumed = sumMacros(
    logs.map((l) => ({
      kcal: Number(l.kcal),
      protein_g: Number(l.protein_g),
      carbs_g: Number(l.carbs_g),
      fat_g: Number(l.fat_g),
    })),
  );
  const target = {
    kcal: Number(profile.target_calories),
    protein_g: Number(profile.target_protein_g ?? 0),
    carbs_g: Number(profile.target_carbs_g ?? 0),
    fat_g: Number(profile.target_fat_g ?? 0),
  };
  const left = calcRemaining(target, consumed);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 md:py-12">
        <header className="mb-8 flex items-end justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Today</p>
            <h1 className="font-display text-4xl font-bold md:text-5xl">
              {profile.display_name ? `Hi, ${profile.display_name}` : "Your day"}
            </h1>
          </div>
          <div className="flex flex-col items-end gap-1 text-sm">
            <Link to="/history" className="text-muted-foreground underline-offset-4 hover:underline">
              History
            </Link>
            <Link to="/onboarding" className="text-muted-foreground underline-offset-4 hover:underline">
              Edit profile
            </Link>
          </div>
        </header>

        <Card className="rounded-2xl p-6 shadow-soft md:p-8">
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            <MacroRing
              consumed={consumed.kcal}
              target={target.kcal}
              label="Calories"
              unit="kcal"
              colorVar="--macro-calories"
            />
            <MacroRing
              consumed={consumed.protein_g}
              target={target.protein_g}
              label="Protein"
              unit="g"
              colorVar="--macro-protein"
            />
            <MacroRing
              consumed={consumed.carbs_g}
              target={target.carbs_g}
              label="Carbs"
              unit="g"
              colorVar="--macro-carbs"
            />
            <MacroRing
              consumed={consumed.fat_g}
              target={target.fat_g}
              label="Fat"
              unit="g"
              colorVar="--macro-fat"
            />
          </div>
        </Card>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Link to="/recipes">
            <ActionCard
              icon={<Sparkles className="h-5 w-5" />}
              title="Pick & scale"
              desc="Choose a recipe — we'll scale grams to fit remaining macros."
            />
          </Link>
          <Link to="/quick-log">
            <ActionCard
              icon={<Zap className="h-5 w-5" />}
              title="Quick log"
              desc="Log raw ingredient grams without saving a recipe."
            />
          </Link>
          <Link to="/recipes">
            <ActionCard
              icon={<Utensils className="h-5 w-5" />}
              title="Recipes"
              desc="Build meals from your pantry with grams per ingredient."
            />
          </Link>
          <Link to="/ingredients">
            <ActionCard
              icon={<Carrot className="h-5 w-5" />}
              title="Ingredients"
              desc="Manage your pantry — the building blocks for recipes."
            />
          </Link>
        </div>

        <section className="mt-8">
          <h2 className="mb-3 font-display text-xl font-bold">Today's meals</h2>
          {logs.length === 0 ? (
            <Card className="rounded-2xl p-8 text-center text-muted-foreground">
              No meals logged yet. Remaining: <strong className="text-foreground">{Math.round(left.kcal)}</strong>{" "}
              kcal · <strong className="text-foreground">{Math.round(left.protein_g)}g</strong> protein.
            </Card>
          ) : (
            <div className="space-y-2">
              {logs.map((l) => (
                <Card key={l.id} className="flex items-center justify-between rounded-xl p-4">
                  <div>
                    <div className="font-semibold">{l.recipe_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {Math.round(Number(l.total_grams))}g · {Math.round(Number(l.kcal))} kcal
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    P {Math.round(Number(l.protein_g))} · C {Math.round(Number(l.carbs_g))} · F{" "}
                    {Math.round(Number(l.fat_g))}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ActionCard({
  icon,
  title,
  desc,
  tag,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  tag?: string;
  disabled?: boolean;
}) {
  return (
    <Card className={`rounded-2xl p-5 ${disabled ? "opacity-60" : ""}`}>
      <div className="mb-2 flex items-center gap-2 text-primary">
        {icon}
        <h3 className="font-display text-lg font-bold">{title}</h3>
      </div>
      <p className="text-sm text-muted-foreground">{desc}</p>
      {tag && (
        <span className="mt-3 inline-block rounded-full bg-secondary px-2 py-0.5 text-[10px] uppercase tracking-wider">
          {tag}
        </span>
      )}
    </Card>
  );
}

function Welcome() {
  return (
    <div className="min-h-screen bg-gradient-hero">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-4 py-16 text-primary-foreground">
        <p className="mb-3 text-sm uppercase tracking-[0.25em] opacity-80">Macro</p>
        <h1 className="font-display text-5xl font-bold leading-[1.05] md:text-6xl">
          Eat what you want.<br />
          <span className="opacity-80">Hit your numbers.</span>
        </h1>
        <p className="mt-5 max-w-md text-lg opacity-85">
          Pick any meal — we'll scale the ingredients so it fits the macros you've got left for the day.
        </p>
        <div className="mt-8">
          <Button asChild size="lg" variant="secondary" className="rounded-full px-8">
            <Link to="/onboarding">Get started</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
