import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type RecipeIngredientRow = {
  id: string;
  ingredient_id: string;
  ratio: number;
  ingredient: {
    id: string;
    name: string;
    kcal_per_100g: number;
    protein_per_100g: number;
    carbs_per_100g: number;
    fat_per_100g: number;
  };
};

export type RecipeRow = {
  id: string;
  name: string;
  description: string | null;
  default_serving_g: number;
  min_total_g: number;
  max_total_g: number;
  recipe_ingredients: RecipeIngredientRow[];
};

export function useRecipes() {
  return useQuery({
    queryKey: ["recipes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipes")
        .select(
          "id, name, description, default_serving_g, min_total_g, max_total_g, recipe_ingredients(id, ingredient_id, ratio, ingredient:ingredients(id, name, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g))",
        )
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as RecipeRow[];
    },
  });
}
