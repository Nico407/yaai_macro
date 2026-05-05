import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const DIETARY_TAGS = [
  "vegan",
  "vegetarian",
  "pescatarian",
  "halal",
  "kosher",
  "contains_gluten",
  "contains_lactose",
  "contains_nuts",
  "contains_eggs",
  "contains_soy",
  "contains_fish",
  "contains_shellfish",
] as const;
export type DietaryTag = (typeof DIETARY_TAGS)[number];

export type Ingredient = {
  id: string;
  name: string;
  kcal_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  dietary_tags: string[];
};

export function useIngredients() {
  return useQuery({
    queryKey: ["ingredients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ingredients")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Ingredient[];
    },
  });
}
