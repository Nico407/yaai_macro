import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { localDateISO } from "@/lib/dates";

export type MealLog = {
  id: string;
  recipe_id: string | null;
  recipe_name: string;
  total_grams: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  ingredients_json: unknown;
  logged_at: string;
  log_date: string;
  slot: string | null;
  is_fixed: boolean;
  instructions: string | null;
};

function todayISO() {
  return localDateISO();
}

export function useTodayLogs() {
  return useQuery({
    queryKey: ["meal_logs", "today"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meal_logs")
        .select("*")
        .eq("log_date", todayISO())
        .order("logged_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MealLog[];
    },
  });
}
