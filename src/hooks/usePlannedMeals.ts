import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PlannedMeal = {
  id: string;
  plan_date: string;
  slot: string | null;
  recipe_id: string | null;
  recipe_name: string;
  total_grams: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  is_fixed: boolean;
  instructions: string | null;
  ingredients_json: unknown;
};

export function usePlannedMeals(start: string, end: string) {
  return useQuery({
    queryKey: ["planned_meals", start, end],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("planned_meals")
        .select("*")
        .gte("plan_date", start)
        .lte("plan_date", end)
        .order("plan_date", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as PlannedMeal[];
    },
  });
}
