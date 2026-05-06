import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CookbookRecipe } from "./useCookbookRecipes";

export function useAllCookbookRecipes() {
  return useQuery({
    queryKey: ["cookbook_recipes", "__all__"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cookbook_recipes")
        .select("*")
        .order("country", { ascending: true, nullsFirst: true })
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as CookbookRecipe[];
    },
  });
}
