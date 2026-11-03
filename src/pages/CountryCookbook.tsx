import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useCookbookRecipes } from "@/hooks/useCookbookRecipes";
import { CookbookList } from "@/components/CookbookList";

const COUNTRY_META: Record<string, { flag: string; name: string; desc: string }> = {
  Italy: { flag: "🇮🇹", name: "Italy", desc: "Pasta, risotto, antipasti" },
  Japan: { flag: "🇯🇵", name: "Japan", desc: "Donburi, ramen, sushi bowls" },
  Mexico: { flag: "🇲🇽", name: "Mexico", desc: "Bowls, tacos, salsas" },
  India: { flag: "🇮🇳", name: "India", desc: "Curries, dals, tandoori" },
  Thailand: { flag: "🇹🇭", name: "Thailand", desc: "Stir-fries, curries, salads" },
  Greece: { flag: "🇬🇷", name: "Greece", desc: "Mediterranean macros" },
};

export default function CountryCookbook() {
  const { country = "" } = useParams();
  const meta = COUNTRY_META[country];
  const { data: recipes = [], isLoading } = useCookbookRecipes(country);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 md:py-12">
        <header className="mb-8">
          <Link to="/plan/countries" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
            <ArrowLeft className="h-4 w-4" /> Back to countries
          </Link>
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Country recipes</p>
          <h1 className="font-display text-4xl font-bold md:text-5xl">
            {meta?.flag ?? "🌍"} {meta?.name ?? country}
          </h1>
          {meta?.desc && <p className="mt-2 text-sm text-muted-foreground">{meta.desc}</p>}
        </header>

        {isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
        ) : (
          <CookbookList recipes={recipes} />
        )}
      </div>
    </div>
  );
}
