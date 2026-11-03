import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CookbookRecipe = {
  id: string;
  country: string | null;
  name: string;
  description: string | null;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  cook_time_min: number;
  image_url: string | null;
  ingredients: string[];
  instructions: string[];
  sort_order: number;
  is_favorite: boolean;
  base_tags?: string[];
  protein_tags?: string[];
  lifestyle?: string | null;
};

export function useCookbookRecipes(country: string | null = null) {
  return useQuery({
    queryKey: ["cookbook_recipes", country ?? "__global__"],
    queryFn: async () => {
      const q = supabase
        .from("cookbook_recipes")
        .select("*")
        .order("sort_order", { ascending: true });
      const { data, error } = country === null ? await q.is("country", null) : await q.eq("country", country);
      if (error) throw error;
      return (data ?? []) as unknown as CookbookRecipe[];
    },
  });
}
