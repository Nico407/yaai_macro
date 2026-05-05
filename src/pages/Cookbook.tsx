import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { ArrowLeft, BookOpen, Sparkles } from "lucide-react";

// Static starter library — these are read-only sample recipes.
// Later we'll seed these into the DB or fetch from a curated source.
const COOKBOOK = [
  {
    id: "cb-chicken-rice",
    name: "Chicken & rice bowl",
    desc: "Lean protein staple, easy to scale.",
    kcal: 520,
    p: 45,
    c: 60,
    f: 10,
  },
  {
    id: "cb-oats-protein",
    name: "Protein oats",
    desc: "Breakfast that actually fills you up.",
    kcal: 430,
    p: 35,
    c: 55,
    f: 9,
  },
  {
    id: "cb-salmon-veg",
    name: "Salmon & veg tray",
    desc: "Omega-3s, easy macros, one pan.",
    kcal: 580,
    p: 42,
    c: 30,
    f: 28,
  },
];

export default function Cookbook() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 md:py-12">
        <header className="mb-8">
          <Link
            to="/plan"
            className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
            Free library
          </p>
          <h1 className="font-display text-4xl font-bold md:text-5xl">Cook Book</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            A starter set of recipes — more arrive with country packs.
          </p>
        </header>

        <Card className="mb-6 flex items-start gap-3 rounded-2xl border-dashed bg-secondary/40 p-4">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-sm text-muted-foreground">
            These recipes are previews. Scaling and logging will be wired up next.
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
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
