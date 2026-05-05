import { useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Globe, Lock, Search } from "lucide-react";

const COUNTRIES = [
  { flag: "🇮🇹", name: "Italy", desc: "Pasta, risotto, antipasti" },
  { flag: "🇯🇵", name: "Japan", desc: "Donburi, ramen, sushi bowls" },
  { flag: "🇲🇽", name: "Mexico", desc: "Bowls, tacos, salsas" },
  { flag: "🇮🇳", name: "India", desc: "Curries, dals, tandoori" },
  { flag: "🇹🇭", name: "Thailand", desc: "Stir-fries, curries, salads" },
  { flag: "🇬🇷", name: "Greece", desc: "Mediterranean macros" },
];

export default function Countries() {
  const [filter, setFilter] = useState("");
  const q = filter.trim().toLowerCase();
  const filtered = COUNTRIES.filter(
    (c) => c.name.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q),
  );

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
            Premium packs
          </p>
          <h1 className="font-display text-4xl font-bold md:text-5xl">Add countries</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Unlock curated recipe libraries from around the world.
          </p>
        </header>

        <Card className="mb-6 flex items-start gap-3 rounded-2xl border-dashed bg-secondary/40 p-4">
          <Globe className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-sm text-muted-foreground">
            Country packs are coming soon. Payments will be wired up later.
          </p>
        </Card>

        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search countries…"
            className="pl-9"
          />
        </div>

        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No countries match "{filter}".
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {filtered.map((c) => (
              <Card
                key={c.name}
                className="flex items-center justify-between rounded-2xl p-4 opacity-80"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{c.flag}</span>
                  <div>
                    <div className="font-semibold">{c.name}</div>
                    <div className="text-xs text-muted-foreground">{c.desc}</div>
                  </div>
                </div>
                <Lock className="h-4 w-4 text-muted-foreground" />
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
